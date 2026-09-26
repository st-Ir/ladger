import { rebalance, type RebalPlan } from "./rebalance";
import { isUsdAsset } from "./macro";
import type { Account, Capital, Cur, Position, Shock, TargetBook, Wallet } from "./types";

/**
 * The shock test — panel 04 of `docs/macro.md`, and the one that justifies the
 * tab. Pure, and deliberately not a forecast.
 *
 * **You supply the shock, the app supplies the arithmetic.** No likelihoods, no
 * historical scenario library, no implied correlation between the three inputs —
 * moving crypto alone leaves equities where they are, which is unrealistic and
 * *honest about being unrealistic*. It is a mechanism check.
 *
 * The point of doing it here rather than approximating: `rebalance()` is pure
 * and takes `positions`, `rate` and `prices` as inputs, so the hypothetical book
 * is priced by the **production code path** that draws the real plan — same
 * bands, same cash-first funding, same lot rounding, same broker bill.
 */

/** Nothing typed = nothing shocked. */
export const NO_SHOCK: Shock = { crypto: 0, equities: 0, rate: 0 };

export interface ShockInput {
  /** The user's assumption, in % moves. */
  shock: Shock;
  positions: Position[];
  capital: Capital[];
  accounts: Account[];
  wallets: Wallet[];
  book: TargetBook | null;
  /** IDR per USD, spot, before the shock. */
  rate: number;
  cashFirst: boolean;
  priced: boolean;
  /** USD-base prices for symbols targeted but not held. */
  prices: Record<string, number>;
  fx: boolean;
  portfolio: boolean;
  /** From `macro()` — what the runway divides into. */
  spendPerMonthIdr: number | null;
  /** Share of that spending denominated in USD, %. A weaker rupiah lifts it. */
  spendUsdPct: number | null;
}

export interface ShockSide {
  /** IDR. */
  netIdr: number;
  cashIdr: number;
  pfIdr: number;
  /** Liquid cash ÷ monthly spend. Null until there is spending to divide by. */
  runwayMonths: number | null;
  rate: number;
}

/** A sleeve the shock pushed out of its band. */
export interface ShockBreach {
  id: string;
  name: string;
  color: string;
  /** pp from target, after. */
  drift: number;
  /** The correction the band then justifies, USD base. >0 buy, <0 trim. */
  need: number;
  /** True when it was inside its band before the shock — the shock did this. */
  fresh: boolean;
}

export interface ShockResult {
  shock: Shock;
  /** True when every slider is at zero — nothing to report. */
  idle: boolean;
  before: ShockSide;
  after: ShockSide;
  deltaIdr: number;
  deltaPct: number;
  /**
   * The move split into its two causes. `assetIdr` re-prices the book at the old
   * rate; `fxIdr` is the remainder, so the cross term lands with the currency
   * rather than being dropped.
   */
  assetIdr: number;
  fxIdr: number;
  runwayDelta: number | null;
  /** The plan the shocked book would need. Same engine as the live one. */
  plan: RebalPlan;
  breaches: ShockBreach[];
  /** Q3: can idle capital still buy the dip? Buys the shock creates, USD base… */
  buysUsd: number;
  /** …against the capital sitting there to pay for them. */
  idleCashUsd: number;
  /**
   * The same three figures in rupiah **at the shocked rate**. They belong to the
   * hypothetical, so valuing them at today's spot — which is what a USD-base
   * number formatted by the app would do — would quietly restate them.
   */
  buysIdr: number;
  idleCashIdr: number;
  costIdr: number;
  fundedByCash: boolean;
  /** What nothing could fund, USD base. */
  gapUsd: number;
  /**
   * The band asked for a trim. Not the same as "cash ran out" — with `cashFirst`
   * on, a sell only ever comes from an overweight the band wants corrected, so
   * this is a fact about drift, and `gapUsd` is the one about funding.
   */
  needsSell: boolean;
  /** Q4: fees + Indonesian final tax on that correction, USD base. */
  costUsd: number;
  costPct: number;
}

const idrOf = (bal: number, cur: Cur | undefined, rate: number) =>
  (cur || "USD") === "USD" ? bal * rate : bal;

const posUsd = (p: Position) => p.cur * p.qty;

/**
 * How much this position's *native* price moves. Hedge is untouched: a cash
 * equivalent that falls 20% with crypto is not a hedge, it's a third slider
 * nobody asked for.
 */
function priceMult(p: Position, s: Shock): number {
  if (p.type === "crypto") return 1 + (s.crypto || 0) / 100;
  if (p.type === "stock" || p.type === "etf") return 1 + (s.equities || 0) / 100;
  return 1;
}

/**
 * The shocked USD-base price.
 *
 * IDX names need the extra term: their price is fixed in rupiah, so a rate move
 * changes the USD number the ledger stores without changing what the position is
 * worth to a rupiah owner. Skipping this would show a rupiah devaluation making
 * IDX holdings richer in rupiah, which never happened.
 */
export function shockedPrice(p: Position, s: Shock, rate: number, newRate: number): number {
  let m = priceMult(p, s);
  if (isUsdAsset(p) === false && newRate > 0) m *= rate / newRate;
  return p.cur * m;
}

export function shockTest(input: ShockInput): ShockResult {
  const { shock, rate, fx, portfolio } = input;
  const positions = portfolio ? input.positions : [];
  const holders = [...(input.accounts || []), ...(input.wallets || []), ...(input.capital || [])];
  const liquid = [...(input.accounts || []), ...(input.wallets || [])];

  // FX off is a single-currency ledger, so the rate slider has nothing to move.
  const rateShock = fx ? shock.rate || 0 : 0;
  const newRate = rate * (1 + rateShock / 100);
  const idle = !(shock.crypto || shock.equities || rateShock);

  const shocked = positions.map((p) => ({ ...p, cur: shockedPrice(p, shock, rate, newRate) }));

  const cashIdrAt = (r: number) => holders.reduce((a, h) => a + idrOf(h.bal, h.currency, r), 0);
  const pfIdrAt = (list: Position[], r: number) => list.reduce((a, p) => a + posUsd(p) * r, 0);

  const cashBefore = cashIdrAt(rate);
  const cashAfter = cashIdrAt(newRate);
  const pfBefore = pfIdrAt(positions, rate);
  const pfAfter = pfIdrAt(shocked, newRate);
  const netBefore = cashBefore + pfBefore;
  const netAfter = cashAfter + pfAfter;

  // The price leg alone: the same shock at the *old* rate. Everything left over
  // is currency, cross term included — the same residual discipline the 30-day
  // attribution uses, and for the same reason.
  const pfPriceOnly = positions.reduce((a, p) => a + posUsd(p) * priceMult(p, shock) * rate, 0);
  const assetIdr = pfPriceOnly - pfBefore;
  const deltaIdr = netAfter - netBefore;

  // Spending in dollars costs more rupiah after a devaluation, so the runway
  // shortens from both ends. Ignoring that would flatter the answer.
  const perMonth = input.spendPerMonthIdr;
  const usdShare = (input.spendUsdPct || 0) / 100;
  const perMonthAfter =
    perMonth == null ? null : perMonth * (1 + usdShare * (rateShock / 100));
  const liquidBefore = liquid.reduce((a, h) => a + idrOf(h.bal, h.currency, rate), 0);
  const liquidAfter = liquid.reduce((a, h) => a + idrOf(h.bal, h.currency, newRate), 0);
  const runway = (cash: number, spend: number | null) => (spend && spend > 0 ? cash / spend : null);
  const runwayBefore = runway(liquidBefore, perMonth);
  const runwayAfter = runway(liquidAfter, perMonthAfter);

  const common = {
    book: input.book,
    capital: input.capital || [],
    cashFirst: input.cashFirst,
    priced: input.priced,
    fx,
  };
  const basePlan = rebalance({ ...common, positions, rate, prices: input.prices || {} });
  // An unheld target keeps its live price: the ledger knows the symbol's weight
  // but not its class, and guessing one to shock it with would be invention.
  const plan = rebalance({ ...common, positions: shocked, rate: newRate, prices: input.prices || {} });

  const wasInBand = new Map<string, boolean>();
  for (const n of basePlan.nodes) if (n.kind === "sleeve") wasInBand.set(n.id, n.inBand);
  const breaches: ShockBreach[] = plan.nodes
    .filter((n) => n.kind === "sleeve" && !n.inBand)
    .map((n) => ({
      id: n.id,
      name: n.name,
      color: n.color,
      drift: n.drift || 0,
      need: n.need,
      fresh: wasInBand.get(n.id) === true,
    }));

  const gapUsd = plan.gaps.reduce((a, g) => a + Math.max(0, g.amount), 0);
  const buysUsd = plan.moves.filter((m) => m.kind === "buy").reduce((a, m) => a + m.amount, 0) + gapUsd;
  const idleCashUsd = (input.capital || []).reduce(
    (a, c) => a + Math.max(0, (c.currency || "USD") === "USD" ? c.bal : c.bal / newRate),
    0
  );

  return {
    shock,
    idle,
    before: { netIdr: netBefore, cashIdr: cashBefore, pfIdr: pfBefore, runwayMonths: runwayBefore, rate },
    after: { netIdr: netAfter, cashIdr: cashAfter, pfIdr: pfAfter, runwayMonths: runwayAfter, rate: newRate },
    deltaIdr,
    deltaPct: netBefore ? (deltaIdr / netBefore) * 100 : 0,
    assetIdr,
    fxIdr: deltaIdr - assetIdr,
    runwayDelta:
      runwayBefore != null && runwayAfter != null ? runwayAfter - runwayBefore : null,
    plan,
    breaches,
    buysUsd,
    idleCashUsd,
    buysIdr: buysUsd * newRate,
    idleCashIdr: idleCashUsd * newRate,
    costIdr: plan.cost * newRate,
    fundedByCash: gapUsd <= 1e-9,
    gapUsd,
    needsSell: plan.moves.some((m) => m.kind === "sell"),
    costUsd: plan.cost,
    costPct: plan.costPct,
  };
}
