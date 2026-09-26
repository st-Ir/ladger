import { type Broker, brokerById, feeFor, feeNote } from "./brokers";
import type {
  Band,
  Capital,
  Cur,
  Market,
  PosType,
  Position,
  Sleeve,
  TargetBook,
  TargetLock,
} from "./types";

/**
 * The rebalancing engine — pure, and the whole of `docs/rebalancing.md`'s
 * five ordered steps. Nothing here reads or writes the store; `derive.ts` calls
 * it and formats the result, `store.ts` turns a move into a prefilled order.
 *
 * The order of the steps is the point:
 *
 *   1. drift vs an **asymmetric** band — trimming pays tax, topping up doesn't
 *   2. **cash first**, in the account that can actually spend it
 *   3. sell only the remainder cash couldn't cover
 *   4. round to what the venue will actually trade (IDX lots of 100)
 *   5. price the plan through the real broker schedule and show the bill
 *
 * There is deliberately no cost gate. Broker fees are proportional, so
 * `cost ÷ move` is a constant and such a test either passes for every move at a
 * venue or fails for all of them. The band already decides what is worth
 * correcting; the only size rule that survives is feasibility, in step 4.
 */

/** IDX trades in lots of 100 shares. Everything else is fractional here. */
export const LOT = 100;

export interface RebalInput {
  book: TargetBook | null;
  positions: Position[];
  capital: Capital[];
  /** IDR per USD, spot. */
  rate: number;
  cashFirst: boolean;
  /** False when the feed is down or a held name has no quote — plan is
   *  information only, never executable. */
  priced: boolean;
  /** Live prices in the USD base, for symbols targeted but not yet held. */
  prices: Record<string, number>;
  /** FX effect on. Off ⇒ single currency ⇒ the decomposition is zero. */
  fx: boolean;
}

export type NodeKind = "sleeve" | "asset" | "untargeted";

export interface RebalNode {
  id: string;
  kind: NodeKind;
  sleeveId: string;
  name: string;
  color: string;
  /** USD base. */
  value: number;
  /** % of the portfolio for a sleeve, % of its own sleeve for an asset. */
  now: number;
  /** null on an untargeted holding — the book has no opinion about it. */
  target: number | null;
  drift: number | null;
  band: Band | null;
  /** The correction the band justifies, USD base. >0 buy, <0 trim, 0 in band. */
  need: number;
  inBand: boolean;
  lock?: TargetLock;
  /** pp of `drift` the currency moved rather than the user. null = not computable. */
  fxDrift: number | null;
  /** Sleeve rows only: how many holdings sit under it. */
  holdings: number;
}

export type MoveKind = "buy" | "sell" | "transfer";

export interface RebalMove {
  id: string;
  kind: MoveKind;
  sym: string;
  sleeveId: string;
  sleeveName: string;
  color: string;
  /** The capital account this executes in. */
  account: string;
  /** Transfers only — where the money has to come from. */
  from?: string;
  /** USD base notional, after lot rounding. */
  amount: number;
  price: number;
  qty: number;
  market?: Market;
  type?: PosType;
  fee: number;
  feeNote: string;
  /** What lot rounding left behind, USD base. */
  remainder: number;
  /** False when the move is smaller than one tradable unit. */
  tradable: boolean;
  /** USD price of one lot, when lots apply. */
  lotValue: number;
  /** True when the funding had to cross capital accounts. */
  cross: boolean;
  note: string;
}

/** An underweight nothing in its account can fund — a fundable problem, stated. */
export interface RebalGap {
  sleeveId: string;
  name: string;
  account: string;
  /** USD base. */
  amount: number;
  reason: string;
}

export interface RebalUnassigned {
  sym: string;
  value: number;
  now: number;
  type: PosType;
  /** The role the heuristic points at — a rule of thumb, printed with its reason. */
  role: string;
  reason: string;
  /** A sleeve in this book whose name matches that role, when one exists. */
  sleeveId: string;
}

export interface RebalGroup {
  account: string;
  broker?: Broker;
  moves: RebalMove[];
  /** USD base. */
  cost: number;
}

export type RebalState =
  | "nobook"
  | "empty"
  | "notpriced"
  | "ontarget"
  | "nottradable"
  | "moves";

export interface RebalPlan {
  state: RebalState;
  nodes: RebalNode[];
  unassigned: RebalUnassigned[];
  moves: RebalMove[];
  groups: RebalGroup[];
  gaps: RebalGap[];
  /** USD base. */
  pfValue: number;
  cost: number;
  /** Plan cost as a % of the portfolio. */
  costPct: number;
  /** Sum of the sleeve weights — 100 when the book is well formed. */
  weightSum: number;
  /** True when at least one sleeve's drift decomposes into an FX share. */
  hasFx: boolean;
}

/**
 * What the app suggests a position is *for*, from the only two facts it has —
 * the class and the venue. A rule of thumb about volatility, never applied
 * silently, and it is free to be wrong: someone whose BTC is their longest-held
 * position files it as Core and the app never argues again.
 */
export const ROLE_HINTS: Record<PosType, { role: string; reason: string }> = {
  hedge: { role: "Buffer", reason: "A cash equivalent is only useful as a buffer." },
  etf: { role: "Core", reason: "A broad basket is the archetypal hold-and-forget position." },
  stock: { role: "Core", reason: "Single names bought through a broker are usually held, not traded." },
  crypto: { role: "Growth", reason: "The most volatile class in the ledger — treating it as core hides real risk." },
};

/** The roles a blank book is offered, with the band each one's turnover implies. */
export const ROLE_SEED: { name: string; color: string; band: Band; note: string }[] = [
  { name: "Core", color: "#5b9bff", band: { buy: 2, sell: 5 }, note: "Tidak diperdagangkan. Berubah karena pikiran berubah, bukan karena harga." },
  { name: "Growth", color: "#e8973b", band: { buy: 3, sell: 6 }, note: "Bagian yang sengaja ambil risiko. Drift di sini yang paling berarti." },
  { name: "Buffer", color: "#9aa6bc", band: { buy: 1, sell: 3 }, note: "Harus tetap ada saat yang lain turun. Ini yang bikin beli dip jadi mungkin." },
];

const usdOf = (bal: number, cur: Cur | undefined, rate: number) =>
  (cur || "USD") === "USD" ? bal : bal / rate;

const posVal = (p: Position) => p.cur * p.qty;

/** IDX names are the FX-sensitive ones: their rupiah price is what's fixed, so
 *  the USD figure the ledger stores moves with the rate on its own. */
const fxSensitive = (p: Position) => (p.market || "US") === "IDX";

/** Which sleeve a position belongs to. A ticker filed by hand outranks a whole
 *  class filed by type — the precise answer wins over the broad one. */
export function sleeveFor(p: Position, sleeves: Sleeve[]): Sleeve | undefined {
  const sym = (p.sym || "").toUpperCase();
  const byName = sleeves.find(
    (s) => s.match.kind === "syms" && s.match.syms.some((x) => (x || "").toUpperCase() === sym)
  );
  if (byName) return byName;
  return sleeves.find((s) => s.match.kind === "type" && s.match.type === p.type);
}

const inBandOf = (drift: number, band: Band) => drift >= -band.buy && drift <= band.sell;

/** One raw correction before funding, rounding or pricing. */
interface Leg {
  sym: string;
  sleeveId: string;
  sleeveName: string;
  color: string;
  account: string;
  /** Signed USD base. */
  amount: number;
  price: number;
  market?: Market;
  type?: PosType;
}

export function rebalance(input: RebalInput): RebalPlan {
  const { book, positions, capital, rate, cashFirst, priced, prices, fx } = input;
  const sleeves = book ? book.sleeves : [];
  const pfValue = positions.reduce((a, p) => a + posVal(p), 0);
  const weightSum = sleeves.reduce((a, s) => a + (s.target || 0), 0);
  const fallbackAccount = (capital[0] || ({} as Capital)).name || "";
  const accountOf = (p?: Position) => (p && p.src) || fallbackAccount;

  const blank = (state: RebalState): RebalPlan => ({
    state,
    nodes: [],
    unassigned: [],
    moves: [],
    groups: [],
    gaps: [],
    pfValue,
    cost: 0,
    costPct: 0,
    weightSum,
    hasFx: false,
  });

  if (!book || !sleeves.length) return blank("nobook");
  if (!(pfValue > 0)) return blank("empty");

  // ---- filing --------------------------------------------------------------
  const filed = new Map<string, Position[]>();
  const loose: Position[] = [];
  for (const p of positions) {
    const s = sleeveFor(p, sleeves);
    // Nothing is auto-filed. A position no sleeve claims keeps its real weight
    // and says so — a rebalancer that quietly guesses is one that lies.
    if (!s) loose.push(p);
    else (filed.get(s.id) || filed.set(s.id, []).get(s.id)!).push(p);
  }

  const unassigned: RebalUnassigned[] = loose.map((p) => {
    const hint = ROLE_HINTS[p.type] || ROLE_HINTS.stock;
    const match = sleeves.find((s) => s.name.trim().toLowerCase() === hint.role.toLowerCase());
    return {
      sym: p.sym,
      value: posVal(p),
      now: (posVal(p) / pfValue) * 100,
      type: p.type,
      role: hint.role,
      reason: hint.reason,
      sleeveId: match ? match.id : "",
    };
  });

  // ---- step 1 · drift vs an asymmetric band --------------------------------
  // The FX baseline: the same holdings valued at the rate stored when the book
  // was saved. Any weight that moved between the two is a weight the currency
  // moved, not the user.
  const fxBase = fx && book.rate && book.rate > 0 ? book.rate : 0;
  const atSaved = (p: Position) =>
    fxBase && fxSensitive(p) ? (posVal(p) * rate) / fxBase : posVal(p);
  const pfAtSaved = fxBase ? positions.reduce((a, p) => a + atSaved(p), 0) : 0;

  const nodes: RebalNode[] = [];
  const legs: Leg[] = [];
  const gaps: RebalGap[] = [];
  /** Overweight the band was willing to leave alone — only textbook mode sells it. */
  const spareCands: { drift: number; sleeve: Sleeve; held: Position[]; slack: number }[] = [];

  for (const s of sleeves) {
    const held = filed.get(s.id) || [];
    const value = held.reduce((a, p) => a + posVal(p), 0);
    const now = (value / pfValue) * 100;
    const drift = now - s.target;
    const inBand = inBandOf(drift, s.band);
    const need = inBand ? 0 : (s.target / 100) * pfValue - value;

    let fxDrift: number | null = null;
    if (fxBase && pfAtSaved > 0) {
      const wasNow = (held.reduce((a, p) => a + atSaved(p), 0) / pfAtSaved) * 100;
      fxDrift = +(now - wasNow).toFixed(2);
    }

    nodes.push({
      id: s.id,
      kind: "sleeve",
      sleeveId: s.id,
      name: s.name,
      color: s.color,
      value,
      now,
      target: s.target,
      drift,
      band: s.band,
      need,
      inBand,
      fxDrift,
      holdings: held.length,
    });

    // A sleeve sitting overweight *inside* its band is exactly what the default
    // refuses to touch. Textbook mode wants it as funding, so its slack is
    // recorded here and only ever drawn on when `cashFirst` is off.
    if (!cashFirst && inBand && held.length) {
      const slack = value - (s.target / 100) * pfValue;
      if (slack > 1e-9) spareCands.push({ drift, sleeve: s, held, slack });
    }

    if (!s.targets.length) {
      // Balanced as one lump: the correction is spread across what's actually
      // in the sleeve, pro rata, so its internal mix survives the trade.
      if (Math.abs(need) < 1e-9) continue;
      if (!held.length) {
        gaps.push({
          sleeveId: s.id,
          name: s.name,
          account: fallbackAccount,
          amount: need,
          reason: "Belum ada posisi di sleeve ini — pilih aset dulu.",
        });
        continue;
      }
      for (const p of held) {
        const share = value > 0 ? posVal(p) / value : 1 / held.length;
        legs.push({
          sym: p.sym,
          sleeveId: s.id,
          sleeveName: s.name,
          color: s.color,
          account: accountOf(p),
          amount: need * share,
          price: p.cur,
          market: p.market,
          type: p.type,
        });
      }
      continue;
    }

    // Second level. Weights inside a sleeve are relative to the sleeve, and the
    // base they measure against is the sleeve *after* its own correction — so a
    // sleeve-level move and an asset-level one compose instead of fighting.
    const base = value + need;
    const claimed = new Set(s.targets.map((t) => (t.sym || "").toUpperCase()));
    for (const t of s.targets) {
      const sym = (t.sym || "").toUpperCase();
      const mine = held.filter((p) => (p.sym || "").toUpperCase() === sym);
      const val = mine.reduce((a, p) => a + posVal(p), 0);
      const band = t.band || s.band;
      const nowPct = base > 0 ? (val / base) * 100 : 0;
      const d = nowPct - t.target;
      const ok = inBandOf(d, band);
      let want = ok ? 0 : (t.target / 100) * base - val;
      // A lock is the user overruling the band, so it wins outright.
      if (t.lock === "hold" || (t.lock === "no-buy" && want > 0) || (t.lock === "no-sell" && want < 0)) want = 0;

      nodes.push({
        id: s.id + ":" + sym,
        kind: "asset",
        sleeveId: s.id,
        name: sym,
        color: s.color,
        value: val,
        now: nowPct,
        target: t.target,
        drift: d,
        band,
        need: want,
        inBand: ok,
        lock: t.lock,
        fxDrift: null,
        holdings: mine.length,
      });

      if (Math.abs(want) < 1e-9) continue;
      const lead = mine[0];
      const price = lead ? lead.cur : prices[sym] || 0;
      if (!(price > 0)) {
        gaps.push({
          sleeveId: s.id,
          name: sym,
          account: fallbackAccount,
          amount: want,
          reason: "Belum ada harga untuk " + sym + " — tambahkan posisinya dulu.",
        });
        continue;
      }
      legs.push({
        sym,
        sleeveId: s.id,
        sleeveName: s.name,
        color: s.color,
        account: accountOf(lead),
        amount: want,
        price,
        market: lead ? lead.market : undefined,
        type: lead ? lead.type : undefined,
      });
    }

    // Held inside the sleeve but named by no target: shown with its real weight
    // and left alone. The book has no opinion, so the engine states none.
    for (const p of held) {
      if (claimed.has((p.sym || "").toUpperCase())) continue;
      nodes.push({
        id: s.id + ":" + p.sym + ":free",
        kind: "untargeted",
        sleeveId: s.id,
        name: p.sym,
        color: s.color,
        value: posVal(p),
        now: base > 0 ? (posVal(p) / base) * 100 : 0,
        target: null,
        drift: null,
        band: null,
        need: 0,
        inBand: true,
        fxDrift: null,
        holdings: 1,
      });
    }
  }

  // ---- steps 2 & 3 · cash first, then the remainder ------------------------
  // Free capital, per account, in the USD base. Only the account that holds the
  // money can spend it; everything else is a transfer, and transfers are said
  // out loud rather than pretended away.
  const cash = new Map<string, number>();
  for (const c of capital) cash.set(c.name, (cash.get(c.name) || 0) + Math.max(0, usdOf(c.bal, c.currency, rate)));

  const buys = legs.filter((l) => l.amount > 1e-9).sort((a, b) => b.amount - a.amount);
  const sells = legs.filter((l) => l.amount < -1e-9).sort((a, b) => a.amount - b.amount);

  // Sells the bands asked for happen regardless; what the funding pass decides
  // is how much of each *buy* can actually be paid for, and whether the money
  // had to travel to get there.
  const proceeds = new Map<string, number>();
  for (const s of sells) proceeds.set(s.account, (proceeds.get(s.account) || 0) + -s.amount);

  // Textbook funding: one entry per sellable position inside an overweight the
  // band left alone. Never a name that is also being bought — proposing both
  // sides of the same ticker is not a plan, it's a round trip with a fee.
  const buyingSyms = new Set(buys.map((b) => b.sym.toUpperCase()));
  const spares: { drift: number; leg: Leg; cap: number; taken: number }[] = [];
  for (const c of spareCands) {
    const sellable = c.held.filter((p) => {
      const sym = (p.sym || "").toUpperCase();
      if (buyingSyms.has(sym)) return false;
      const lk = c.sleeve.targets.find((t) => (t.sym || "").toUpperCase() === sym)?.lock;
      return lk !== "hold" && lk !== "no-sell";
    });
    const base = sellable.reduce((a, p) => a + posVal(p), 0);
    if (!(base > 0)) continue;
    const cap = Math.min(c.slack, base);
    for (const p of sellable)
      spares.push({
        drift: c.drift,
        cap: cap * (posVal(p) / base),
        taken: 0,
        leg: {
          sym: p.sym,
          sleeveId: c.sleeve.id,
          sleeveName: c.sleeve.name,
          color: c.sleeve.color,
          account: accountOf(p),
          amount: 0,
          price: p.cur,
          market: p.market,
          type: p.type,
        },
      });
  }

  const moves: RebalMove[] = [];
  const transfers: { to: string; from: string; amount: number }[] = [];
  let seq = 0;

  const drawFrom = (pot: Map<string, number>, account: string, want: number) => {
    const have = pot.get(account) || 0;
    const take = Math.min(have, want);
    if (take > 0) pot.set(account, have - take);
    return take;
  };
  /** Anything left in the other accounts, cheapest to reach first (biggest pot). */
  const drawElsewhere = (pot: Map<string, number>, account: string, want: number) => {
    let left = want;
    const others = [...pot.entries()].filter(([k, v]) => k !== account && v > 1e-9).sort((a, b) => b[1] - a[1]);
    const used: { from: string; amount: number }[] = [];
    for (const [name] of others) {
      if (left <= 1e-9) break;
      const take = drawFrom(pot, name, left);
      if (take > 1e-9) {
        used.push({ from: name, amount: take });
        left -= take;
      }
    }
    return { taken: want - left, used };
  };

  /** Draw on overweights the band spared, most-overweight first. */
  const drawSpare = (account: string, want: number, remote: boolean) => {
    let left = want;
    const list = spares
      .filter((s) => s.cap - s.taken > 1e-9 && (remote ? s.leg.account !== account : s.leg.account === account))
      .sort((a, b) => b.drift - a.drift);
    for (const s of list) {
      if (left <= 1e-9) break;
      const take = Math.min(s.cap - s.taken, left);
      s.taken += take;
      left -= take;
      if (remote) transfers.push({ to: account, from: s.leg.account, amount: take });
    }
    return want - left;
  };

  for (const b of buys) {
    let left = b.amount;
    let crossed = false;
    // Cash before a sell: a buy pays a fee and no tax at all, while reaching for
    // a sell with money sitting right there burns 0.1–0.21% for nothing.
    //
    // Turning `cashFirst` off asks for the textbook rebalancer instead — fund
    // from sells, reaching into overweights the band was content to leave alone,
    // and leave the idle cash exactly where it is. That is the whole difference
    // the switch makes: without the `spare` step it would only reshuffle which
    // pot paid, and the plan would come out identical either way.
    const order: ("cash" | "proceeds" | "spare")[] = cashFirst
      ? ["cash", "proceeds"]
      : ["proceeds", "spare", "cash"];
    const draw = (kind: "cash" | "proceeds" | "spare", want: number, remote: boolean) => {
      if (kind === "spare") return drawSpare(b.account, want, remote);
      const pot = kind === "cash" ? cash : proceeds;
      if (!remote) return drawFrom(pot, b.account, want);
      const { taken, used } = drawElsewhere(pot, b.account, want);
      for (const u of used) transfers.push({ to: b.account, from: u.from, amount: u.amount });
      return taken;
    };

    for (const k of order) left -= draw(k, left, false);
    for (const k of order) {
      if (left <= 1e-9) break;
      const taken = draw(k, left, true);
      if (taken > 1e-9) {
        crossed = true;
        left -= taken;
      }
    }
    const funded = b.amount - Math.max(0, left);
    if (left > 1e-9) {
      gaps.push({
        sleeveId: b.sleeveId,
        name: b.sym,
        account: b.account,
        amount: left,
        reason: "Tidak ada kas atau posisi overweight yang bisa mendanainya.",
      });
    }
    if (funded > 1e-9) moves.push(makeMove(++seq, "buy", b, funded, crossed, capital, rate));
  }

  // One row per ticker per account, whether the sell came from a band or from
  // funding. Two "Trim BTC" lines in the same account is one order, split in
  // half for the reader's benefit and nobody else's.
  const sellTot = new Map<string, { leg: Leg; amount: number }>();
  const addSell = (leg: Leg, amount: number) => {
    if (!(amount > 1e-9)) return;
    const key = leg.sym.toUpperCase() + "|" + leg.account;
    const hit = sellTot.get(key);
    if (hit) hit.amount += amount;
    else sellTot.set(key, { leg, amount });
  };
  for (const s of sells) addSell(s, -s.amount);
  for (const s of spares) addSell(s.leg, s.taken);
  for (const { leg, amount } of sellTot.values()) moves.push(makeMove(++seq, "sell", leg, amount, false, capital, rate));

  // A cross-account leg settles slowly and can't be done in one sitting, so it
  // gets its own row instead of the plan pretending the money teleports.
  const merged = new Map<string, number>();
  for (const t of transfers) merged.set(t.from + "→" + t.to, (merged.get(t.from + "→" + t.to) || 0) + t.amount);
  for (const [key, amount] of merged) {
    const [from, to] = key.split("→");
    const fc = (capital.find((c) => c.name === from) || ({} as Capital)).currency || "USD";
    const tc = (capital.find((c) => c.name === to) || ({} as Capital)).currency || "USD";
    moves.push({
      id: "m" + ++seq,
      kind: "transfer",
      sym: "",
      sleeveId: "",
      sleeveName: "",
      color: "var(--mut)",
      account: to,
      from,
      amount,
      price: 0,
      qty: 0,
      fee: 0,
      feeNote: "",
      remainder: 0,
      tradable: true,
      lotValue: 0,
      cross: true,
      note: fc !== tc ? "Beda mata uang — kursnya biaya tersendiri." : "Settle dulu sebelum leg berikutnya.",
    });
  }

  // ---- step 5 · the bill ---------------------------------------------------
  const cost = moves.reduce((a, m) => a + m.fee, 0);
  const byAccount = new Map<string, RebalMove[]>();
  for (const m of moves) (byAccount.get(m.account) || byAccount.set(m.account, []).get(m.account)!).push(m);
  const groups: RebalGroup[] = [...byAccount.entries()].map(([account, list]) => ({
    account,
    broker: brokerById((capital.find((c) => c.name === account) || ({} as Capital)).broker),
    moves: list,
    cost: list.reduce((a, m) => a + m.fee, 0),
  }));

  const tradableMoves = moves.filter((m) => m.tradable);
  const state: RebalState = !priced
    ? "notpriced"
    : !moves.length && !gaps.length
    ? "ontarget"
    : moves.length && !tradableMoves.length
    ? "nottradable"
    : "moves";

  return {
    state,
    nodes,
    unassigned,
    moves,
    groups,
    gaps,
    pfValue,
    cost,
    costPct: pfValue > 0 ? (cost / pfValue) * 100 : 0,
    weightSum,
    hasFx: nodes.some((n) => n.fxDrift != null && Math.abs(n.fxDrift) >= 0.05),
  };
}

/**
 * Step 4 + 5 for one leg: round it to something the venue will actually accept,
 * then price it through the real schedule.
 *
 * IDX rounds **down** to whole lots — under-correcting is safe, over-correcting
 * is not, and whatever is left stays inside the band by construction whenever
 * the band is wider than one lot. Crypto is fractional and is left alone; no
 * venue minimum is recorded anywhere in the ledger to round it against.
 */
function makeMove(
  seq: number,
  kind: "buy" | "sell",
  leg: Leg,
  gross: number,
  cross: boolean,
  capital: Capital[],
  rate: number
): RebalMove {
  const lots = (leg.market || "US") === "IDX" && leg.type !== "crypto";
  const lotValue = lots ? LOT * leg.price : 0;
  let amount = gross;
  let remainder = 0;
  let tradable = gross > 1e-9;
  let qty = leg.price > 0 ? gross / leg.price : 0;

  if (lots && leg.price > 0) {
    const whole = Math.floor(qty / LOT);
    if (whole < 1) {
      // Not expensive — impossible. Listed with its lot price rather than
      // silently dropped, which is how a small book used to read "nothing to
      // rebalance" forever while quietly drifting.
      tradable = false;
      remainder = gross;
      qty = 0;
      amount = 0;
    } else {
      qty = whole * LOT;
      amount = qty * leg.price;
      remainder = gross - amount;
    }
  }

  const broker = brokerById((capital.find((c) => c.name === leg.account) || ({} as Capital)).broker);
  const fee = tradable ? feeFor(broker, kind, amount, rate) : 0;
  return {
    id: "m" + seq,
    kind,
    sym: leg.sym,
    sleeveId: leg.sleeveId,
    sleeveName: leg.sleeveName,
    color: leg.color,
    account: leg.account,
    amount,
    price: leg.price,
    qty,
    market: leg.market,
    type: leg.type,
    fee,
    feeNote: tradable ? feeNote(broker, kind, amount, rate) : "",
    remainder,
    tradable,
    lotValue,
    cross,
    note: "",
  };
}

/** A sleeve's default band, from the role its name implies. */
export function bandForRole(name: string): Band {
  const hit = ROLE_SEED.find((r) => r.name.toLowerCase() === (name || "").trim().toLowerCase());
  return hit ? { ...hit.band } : { buy: 2, sell: 5 };
}
