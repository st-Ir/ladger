import type {
  Account,
  Capital,
  Cur,
  Expense,
  FxRate,
  Income,
  MacroNote,
  Position,
  Wallet,
} from "./types";

/**
 * The macro engine — pure, and the arithmetic behind `docs/macro.md`.
 *
 * Macro here is not "what is the market doing". It is **what the world did to
 * this book**, and the answer is mostly already inside the ledger: a year of
 * dated exchange rates, a cost basis in two currencies, every flow with its own
 * date and currency. So panels 01, 02 and 05 need no network at all; only 03
 * takes outside quotes, and it takes them as an *input* the way `rebalance()`
 * takes `prices` — nothing in this file fetches, reads the store, or formats.
 *
 * Everything is reported in **IDR**, the functional currency. `derive.ts`
 * re-expresses it in whatever the user is looking at.
 */

// ---------------------------------------------------------------------------
// shared facts
// ---------------------------------------------------------------------------

/** IDR value of a native balance. */
const idrOf = (bal: number, cur: Cur | undefined, rate: number) =>
  (cur || "USD") === "USD" ? bal * rate : bal;

/** USD-base market value of a position. */
const posUsd = (p: Position) => p.cur * p.qty;

/**
 * Is this position *currency* exposure to a rupiah owner?
 *
 * An IDX name's price is fixed in rupiah — the USD figure the ledger stores is
 * the derived one, and it moves when the rate moves. Its rupiah value does not.
 * So in a rupiah book IDX holdings are rupiah assets, and only crypto plus
 * foreign listings are dollars. This is the same asymmetry `rebalance.ts` calls
 * `fxSensitive`, read from the other side.
 */
export const isUsdAsset = (p: Position) =>
  p.type === "crypto" || (p.market || "US") !== "IDX";

/** The rate in effect on `date` — the latest entry not after it. */
export function rateOn(rates: FxRate[], date: string, fallback: number): number {
  let r = 0;
  for (const e of rates) {
    if (e.date <= date) r = e.idrPerUsd;
    else break;
  }
  // Before the history starts, the earliest known rate is the best estimate.
  return r || (rates.length ? rates[0].idrPerUsd : 0) || fallback;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const parse = (s: string) => {
  const a = (s || "").split("-").map(Number);
  return new Date(a[0], (a[1] || 1) - 1, a[2] || 1);
};
const addDays = (s: string, n: number) => {
  const d = parse(s);
  return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};
const addMonths = (s: string, n: number) => {
  const d = parse(s);
  return iso(new Date(d.getFullYear(), d.getMonth() + n, d.getDate()));
};
/** Whole months between two dates, inclusive of both ends. */
const monthSpan = (from: string, to: string) => {
  const a = parse(from);
  const b = parse(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
};

// ---------------------------------------------------------------------------
// input / output
// ---------------------------------------------------------------------------

export interface DriverQuote {
  price: number;
  /** 24h move, %. Null when the venue didn't give a previous close. */
  changePct: number | null;
}

export interface MacroInput {
  accounts: Account[];
  wallets: Wallet[];
  capital: Capital[];
  positions: Position[];
  incomes: Income[];
  expenses: Expense[];
  /** IDR per USD, spot — the frozen valuation rate. */
  rate: number;
  /** Dated rate history. Sorted here, so the caller may pass it raw. */
  rates: FxRate[];
  /** IDR cost basis of held USD cash. */
  fxCostIdr: number;
  /** IDR cost basis of the portfolio at the rates it was bought at. */
  pfCostIdr: number;
  /** Cumulative realized FX from conversions, IDR. */
  realizedFxIdr: number;
  /** FX off ⇒ a single-currency ledger ⇒ no revaluation leg exists. */
  fx: boolean;
  /** Investments off ⇒ the portfolio legs are left out, not zeroed. */
  portfolio: boolean;
  /** Live driver quotes keyed by ticker. Missing = the row draws without a move. */
  quotes: Record<string, DriverQuote>;
  /** The app's "today", passed in so the windows are deterministic. */
  today: string;
}

/** 01 · what actually moved the money. */
export interface Attribution {
  from: string;
  to: string;
  openIdr: number;
  closeIdr: number;
  changeIdr: number;
  changePct: number;
  /** The part that is you: dated flows, each at the rate of its own date. */
  flowIdr: number;
  /** The residual — revaluation of what was already held. Zero when FX is off. */
  fxIdr: number;
  /**
   * Always null. No dated price history is stored, so an in-window price leg
   * cannot be proved and is not invented; `life.priceIdr` is the honest
   * substitute, true since each position was opened rather than month by month.
   */
  priceIdr: null;
  /** True when positions are held, i.e. the missing price leg actually matters. */
  priceBlind: boolean;
  /** Since the ledger began — the tense in which the price leg is knowable. */
  life: {
    flowIdr: number;
    priceIdr: number;
    fxRealizedIdr: number;
    fxUnrealCashIdr: number;
    fxUnrealPfIdr: number;
    fxIdr: number;
  };
}

/** 02 · the rate you actually got. */
export interface RateCurve {
  points: FxRate[];
  min: number;
  max: number;
  spot: number;
  /** Average acquisition rate of the USD still held — `fxCostIdr / usdHeld`. */
  avgIdr: number | null;
  usdHeld: number;
  /** Spot vs that average, %. Positive = the dollars are worth more than they cost. */
  gapPct: number | null;
  /** IDR the gap is worth on the cash actually held. */
  gapIdr: number | null;
}

export type DriverKind = "fx" | "index" | "asset";

/** 03 · one outside price that touches something held. */
export interface Driver {
  id: string;
  ticker: string;
  name: string;
  kind: DriverKind;
  /** USD base value of everything this driver touches. */
  valueUsd: number;
  /** That value as a share of net worth. */
  sharePct: number;
  price: number | null;
  changePct: number | null;
  /**
   * What the driver's own move was worth in rupiah — **currency only**. A 1%
   * move in USD/IDR moves the rupiah value of the dollar side by exactly 1% of
   * it, so it is money. Everything else would need a beta, and a beta needs
   * price history this app doesn't store, so it stays null.
   */
  moneyIdr: number | null;
  exact: boolean;
  /** The held symbols behind the row. Empty on the FX row, which also spans cash. */
  touches: string[];
}

/** 05 · earning in one currency and saving in another. */
export interface Mismatch {
  /** Length of the flow window actually used, in months. */
  months: number;
  incomeIdr: number;
  /** Share of income denominated in rupiah. Null when nothing came in. */
  incomeIdrPct: number | null;
  spendIdr: number;
  spendIdrPct: number | null;
  /** The half that bites when the rupiah weakens. */
  spendUsdPct: number | null;
  assetIdr: number;
  /** Share of net worth denominated in dollars. */
  assetUsdPct: number | null;
  /** Cash you could spend without selling anything: wallets + vaults. */
  liquidIdr: number;
  spendPerMonthIdr: number | null;
  runwayMonths: number | null;
}

export interface MacroView {
  attribution: Attribution;
  rateCurve: RateCurve;
  drivers: Driver[];
  mismatch: Mismatch;
  /** Net worth in IDR — the base every share above is a share of. */
  netIdr: number;
  /** The dollar-denominated slice of it, IDR. What a rate move actually moves. */
  usdSideIdr: number;
}

// ---------------------------------------------------------------------------
// 03 · the driver table
//
// A driver earns its row by touching a position. No IDX holdings, no IHSG row;
// buy gold and `GC=F` appears the same day. That rule is the whole discipline of
// the panel — without it this is a market dashboard, which is the thing the
// rework exists to close.
// ---------------------------------------------------------------------------

/** Names whose price *is* the gold price, so the S&P row can't also claim them. */
const GOLD = new Set(["XAU", "XAUUSD", "GC=F", "PAXG", "GLD", "IAU"]);

const isGold = (p: Position) => GOLD.has((p.sym || "").toUpperCase());

interface DriverDef {
  id: string;
  ticker: string;
  name: string;
  kind: DriverKind;
  hits: (p: Position) => boolean;
}

const DRIVERS: DriverDef[] = [
  { id: "btc", ticker: "BTC-USD", name: "Bitcoin", kind: "asset", hits: (p) => p.type === "crypto" && !isGold(p) },
  {
    id: "spx",
    ticker: "^GSPC",
    name: "Pasar AS",
    kind: "index",
    hits: (p) => (p.type === "stock" || p.type === "etf") && (p.market || "US") !== "IDX" && !isGold(p),
  },
  { id: "jkse", ticker: "^JKSE", name: "Pasar Indonesia", kind: "index", hits: (p) => (p.market || "US") === "IDX" },
  { id: "gold", ticker: "GC=F", name: "Emas", kind: "asset", hits: isGold },
];

export const FX_TICKER = "IDR=X";

/** Which tickers a given book needs quoted — what `/api/macro` should ask for. */
export function driverTickers(positions: Position[], fx: boolean): string[] {
  const out = DRIVERS.filter((d) => positions.some(d.hits)).map((d) => d.ticker);
  const usdSide = positions.some(isUsdAsset);
  if (fx && (usdSide || !positions.length)) out.unshift(FX_TICKER);
  return out;
}

// ---------------------------------------------------------------------------
// the engine
// ---------------------------------------------------------------------------

export function macro(input: MacroInput): MacroView {
  const { positions, incomes, expenses, rate, fx, portfolio, quotes, today } = input;
  const rates = (input.rates || [])
    .filter((r) => r && r.date && r.idrPerUsd > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const holders = [...(input.accounts || []), ...(input.wallets || []), ...(input.capital || [])];
  const held = portfolio ? positions : [];

  // Net worth split by what it is *denominated* in, not where it is stored.
  // Positions land on the dollar side only when their price is a dollar price.
  let natUsd = 0;
  let natIdr = 0;
  for (const h of holders) {
    if ((h.currency || "USD") === "USD") natUsd += h.bal;
    else natIdr += h.bal;
  }
  for (const p of held) {
    if (isUsdAsset(p)) natUsd += posUsd(p);
    else natIdr += posUsd(p) * rate; // its rupiah price, which the rate can't move
  }
  const netIdr = natUsd * rate + natIdr;
  const usdSideIdr = natUsd * rate;

  // ---- 01 · attribution ----------------------------------------------------
  // Nothing snapshots past net worth, so the opening balance is rebuilt: undo
  // the flows dated inside the window, natively per currency, and value what was
  // left at the rate in effect then. The move then decomposes into the only two
  // things the ledger can prove — flows at their own date's rate, and FX
  // revaluation as the residual.
  const from = addDays(today, -30);
  const inWin = (d: string) => d > from && d <= today;
  let winUsd = 0;
  let winIdr = 0;
  let flowIdr = 0;
  let lifeFlowIdr = 0;
  for (const i of incomes || []) {
    const at = idrOf(i.amount, i.currency, rateOn(rates, i.date, rate));
    lifeFlowIdr += at;
    if (!inWin(i.date)) continue;
    if ((i.currency || "USD") === "USD") winUsd += i.amount;
    else winIdr += i.amount;
    flowIdr += at;
  }
  for (const e of expenses || []) {
    const at = idrOf(e.amount, e.currency, rateOn(rates, e.date, rate));
    lifeFlowIdr -= at;
    if (!inWin(e.date)) continue;
    if ((e.currency || "USD") === "USD") winUsd -= e.amount;
    else winIdr -= e.amount;
    flowIdr -= at;
  }

  // FX off is a single-currency ledger. Valuing both ends at the same rate makes
  // the revaluation leg zero *by construction* rather than by assertion — the
  // panel then reads as saving vs price, which is still a real split.
  const openRate = fx ? rateOn(rates, from, rate) : rate;
  const openIdr = (natUsd - winUsd) * openRate + (natIdr - winIdr);
  const closeIdr = netIdr;
  const changeIdr = closeIdr - openIdr;

  const pfValueUsd = held.reduce((a, p) => a + posUsd(p), 0);
  const pfCostUsd = held.reduce((a, p) => a + p.avg * p.qty, 0);
  const usdCashHeld = holders.reduce((a, h) => a + ((h.currency || "USD") === "USD" ? h.bal : 0), 0);
  const unrealCashIdr = fx ? usdCashHeld * rate - (input.fxCostIdr || 0) : 0;
  const unrealPfIdr = fx && portfolio ? pfCostUsd * rate - (input.pfCostIdr || 0) : 0;
  const realizedIdr = fx ? input.realizedFxIdr || 0 : 0;

  const attribution: Attribution = {
    from,
    to: today,
    openIdr,
    closeIdr,
    changeIdr,
    changePct: openIdr ? (changeIdr / openIdr) * 100 : 0,
    flowIdr,
    fxIdr: changeIdr - flowIdr,
    priceIdr: null,
    priceBlind: held.length > 0,
    life: {
      flowIdr: lifeFlowIdr,
      priceIdr: (pfValueUsd - pfCostUsd) * rate,
      fxRealizedIdr: realizedIdr,
      fxUnrealCashIdr: unrealCashIdr,
      fxUnrealPfIdr: unrealPfIdr,
      fxIdr: realizedIdr + unrealCashIdr + unrealPfIdr,
    },
  };

  // ---- 02 · the rate you got -----------------------------------------------
  // The curve is a fact the app has had all along and never drawn. The line
  // across it is `cashRate()` — what the dollars still held actually cost. The
  // gap between the two is the whole answer to "did I buy dollars well".
  //
  // Individual conversions can't be marked: cross-currency moves accumulate into
  // the scalar `realizedFxIdr` and vanish as events. That needs a transfer log,
  // which is a separate decision with its own storage cost.
  const avgIdr = fx && usdCashHeld > 1e-9 ? (input.fxCostIdr || 0) / usdCashHeld : null;
  const rateCurve: RateCurve = {
    points: rates,
    min: rates.length ? Math.min(...rates.map((r) => r.idrPerUsd), rate) : rate,
    max: rates.length ? Math.max(...rates.map((r) => r.idrPerUsd), rate) : rate,
    spot: rate,
    avgIdr,
    usdHeld: usdCashHeld,
    gapPct: avgIdr && avgIdr > 0 ? ((rate - avgIdr) / avgIdr) * 100 : null,
    gapIdr: avgIdr && avgIdr > 0 ? usdCashHeld * (rate - avgIdr) : null,
  };

  // ---- 03 · exposure that pays rent ----------------------------------------
  const q = (t: string) => quotes[t] || quotes[t.toUpperCase()] || null;
  const drivers: Driver[] = [];
  if (fx && natUsd > 1e-9) {
    const hit = q(FX_TICKER);
    drivers.push({
      id: "idr",
      ticker: FX_TICKER,
      name: "Rupiah vs dolar",
      kind: "fx",
      valueUsd: natUsd,
      sharePct: netIdr ? (usdSideIdr / netIdr) * 100 : 0,
      price: hit ? hit.price : null,
      changePct: hit ? hit.changePct : null,
      // Exact, and the only row that may be shown as money.
      moneyIdr: hit && hit.changePct != null ? (usdSideIdr * hit.changePct) / 100 : null,
      exact: true,
      touches: held.filter(isUsdAsset).map((p) => p.sym),
    });
  }
  for (const d of DRIVERS) {
    const mine = held.filter(d.hits);
    if (!mine.length) continue;
    const valueUsd = mine.reduce((a, p) => a + posUsd(p), 0);
    if (!(valueUsd > 0)) continue;
    const hit = q(d.ticker);
    drivers.push({
      id: d.id,
      ticker: d.ticker,
      name: d.name,
      kind: d.kind,
      valueUsd,
      sharePct: netIdr ? ((valueUsd * rate) / netIdr) * 100 : 0,
      price: hit ? hit.price : null,
      changePct: hit ? hit.changePct : null,
      // The driver's own move and the weight behind it, and stop. Implying a
      // portfolio delta from an index move needs a beta this app can't compute.
      moneyIdr: null,
      exact: false,
      touches: mine.map((p) => p.sym),
    });
  }

  // ---- 05 · mismatch & runway ----------------------------------------------
  // The portfolio is not the exposure. Earning rupiah, spending rupiah and
  // saving dollars is a currency position whether or not you think of it as one.
  const winFrom = addMonths(today, -12);
  const recent = (d: string) => d > winFrom && d <= today;
  let incAll = 0;
  let incIdrOnly = 0;
  let expAll = 0;
  let expIdrOnly = 0;
  let firstExp = "";
  for (const i of incomes || []) {
    if (!recent(i.date)) continue;
    const v = idrOf(i.amount, i.currency, rateOn(rates, i.date, rate));
    incAll += v;
    if ((i.currency || "USD") !== "USD") incIdrOnly += v;
  }
  for (const e of expenses || []) {
    if (!recent(e.date)) continue;
    const v = idrOf(e.amount, e.currency, rateOn(rates, e.date, rate));
    expAll += v;
    if ((e.currency || "USD") !== "USD") expIdrOnly += v;
    if (!firstExp || e.date < firstExp) firstExp = e.date;
  }
  // Divide by the months the data actually covers, not by the window: three
  // months of spending averaged over twelve is a runway that doesn't exist.
  const months = firstExp ? Math.min(12, Math.max(1, monthSpan(firstExp, today))) : 0;
  const perMonth = months && expAll > 0 ? expAll / months : null;
  const liquidIdr = [...(input.accounts || []), ...(input.wallets || [])].reduce(
    (a, h) => a + idrOf(h.bal, h.currency, rate),
    0
  );

  const mismatch: Mismatch = {
    months,
    incomeIdr: incAll,
    incomeIdrPct: incAll > 0 ? (incIdrOnly / incAll) * 100 : null,
    spendIdr: expAll,
    spendIdrPct: expAll > 0 ? (expIdrOnly / expAll) * 100 : null,
    spendUsdPct: expAll > 0 ? ((expAll - expIdrOnly) / expAll) * 100 : null,
    assetIdr: netIdr,
    assetUsdPct: netIdr ? (usdSideIdr / netIdr) * 100 : null,
    liquidIdr,
    spendPerMonthIdr: perMonth,
    runwayMonths: perMonth && perMonth > 0 ? liquidIdr / perMonth : null,
  };

  return { attribution, rateCurve, drivers, mismatch, netIdr, usdSideIdr };
}

// ---------------------------------------------------------------------------
// 06 · the log, measured
//
// The app scores nothing. `impact: 84` was a number with no source; *you wrote
// this on 11 Jul, BTC is +2.4% since* is a measurement. The move itself comes
// from the same Yahoo chart endpoint the quote path already calls, so it arrives
// as an input here — this only does the join.
// ---------------------------------------------------------------------------

export interface NoteSymMove {
  sym: string;
  /** Move since the note's date, %. Null when the fetch had nothing that far back. */
  pct: number | null;
  /** False when the symbol is no longer held — the tag stays, the claim softens. */
  held: boolean;
}

export interface NoteView {
  note: MacroNote;
  days: number;
  syms: NoteSymMove[];
}

export function measureNotes(
  notes: MacroNote[],
  positions: Position[],
  /** `sym → % since the note's date`, keyed `SYM@YYYY-MM-DD`. */
  moves: Record<string, number | null>,
  today: string
): NoteView[] {
  const owned = new Set(positions.map((p) => (p.sym || "").toUpperCase()));
  const day = 86400000;
  return (notes || [])
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((n) => ({
      note: n,
      days: Math.max(0, Math.round((parse(today).getTime() - parse(n.date).getTime()) / day)),
      syms: (n.syms || []).map((s) => {
        const sym = (s || "").toUpperCase();
        const v = moves[sym + "@" + n.date];
        return { sym, pct: v == null ? null : v, held: owned.has(sym) };
      }),
    }));
}
