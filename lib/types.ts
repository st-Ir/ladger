export type Cur = "USD" | "IDR";
export type Section = "dashboard" | "cash" | "flow" | "portfolio";
export type PfTab = "pnl" | "strategy" | "rebalance" | "macro";
/** A category id is any string now that categories are user-managed. */
export type ExpenseCat = string;
export type PosType = "crypto" | "stock" | "etf" | "hedge";
/** Which exchange a stock/ETF trades on. Decides the quote ticker and its
 *  currency: US names quote in USD, IDX names are `XXXX.JK` quoted in IDR. */
export type Market = "US" | "IDX";
export type ThemeId = "dark" | "light" | "midnight";
export type Side = "Long" | "Short";
export type TradeResult = "WIN" | "LOSS";
export type PresetMode = "tap" | "recurring";
export type PresetKind = "expense" | "income" | "transfer";
export type Freq = "daily" | "weekly" | "monthly";
export type Sentiment = "bullish" | "bearish" | "neutral";
export type PlanStatus =
  | "waiting"
  | "active"
  | "hit"
  | "stopped"
  | "cancelled"
  | "closed";

export interface Category {
  id: string;
  name: string;
}

/** A dated USD→IDR exchange rate (IDR per 1 USD). */
export interface FxRate {
  date: string;
  idrPerUsd: number;
}

// `currency` on holders/transactions is the native denomination. Optional for
// migration safety — a missing value is treated as USD (the legacy base).
export interface Account {
  name: string;
  bal: number;
  currency?: Cur;
}

export interface Wallet {
  name: string;
  bal: number;
  tag: string;
  badge: string;
  currency?: Cur;
}

export interface Capital {
  name: string;
  bal: number;
  currency?: Cur;
  /**
   * Which venue this capital trades at, as a `Broker` id. Set here rather than
   * per-trade because every buy already picks the capital it spends, so the
   * venue comes along for free. Missing = fees stay hand-entered.
   */
  broker?: string;
}

export interface Expense {
  name: string;
  cat: ExpenseCat;
  amount: number;
  wallet: string;
  date: string;
  currency?: Cur;
}

export interface Goal {
  name: string;
  saved: number;
  target: number;
  date: string;
  currency?: Cur;
}

export interface Income {
  name: string;
  account: string;
  amount: number;
  date: string;
  currency?: Cur;
}

export interface Position {
  sym: string;
  type: PosType;
  qty: number;
  avg: number;
  cur: number;
  /** Missing = "US" (the legacy assumption). Ignored for crypto. */
  market?: Market;
  /**
   * The day this position was first opened. Averaging in later keeps the
   * original date — the holding period answers "how long have I been in this
   * name", not "how old is the last lot". Missing on positions opened before
   * the date was recorded.
   */
  opened?: string;
  /**
   * The capital account that funded it — the only way a later sell can tell
   * which venue's fee applies. `dest` won't do: that is where the money goes
   * next, not where the position lives. Missing on pre-broker positions.
   */
  src?: string;
}

export interface JournalEntry {
  date: string;
  sym: string;
  side: string;
  entry: number;
  exit: number;
  /** Realized PnL, already net of `fee`. */
  pnl: number;
  result: TradeResult;
  note: string;
  /** Units closed. Missing on entries written before size was recorded. */
  qty?: number;
  /** Which exchange the entry/exit prices belong to — IDX ones are shown in rupiah. */
  market?: Market;
  /** Copied off the position when it was closed, so the holding period survives it. */
  opened?: string;
  /** Commission/fee paid on the exit, in the USD base. Missing = not recorded. */
  fee?: number;
}

export interface Plan {
  id: string;
  asset: string;
  type?: PosType;
  market?: Market;
  side: Side;
  thesis: string;
  entry: number;
  tp: number;
  sl: number;
  ref: number;
  price: number;
  amount?: number;
  qty?: number;
  src?: string;
  status: PlanStatus;
  created: string;
}

export interface Preset {
  id: string;
  mode: PresetMode;
  label: string;
  kind: PresetKind;
  amount: number;
  currency?: Cur;
  cat?: ExpenseCat;
  wallet?: string;
  account?: string;
  from?: string;
  to?: string;
  freq?: Freq;
  day?: number;
  lastRun?: string | null;
  created?: string;
}

export interface CycleProfile {
  crypto: number;
  stock: number;
  etf: number;
  hedge: number;
}

export interface CycleProfiles {
  bull: CycleProfile;
  neutral: CycleProfile;
  bear: CycleProfile;
}

// ---------------------------------------------------------------------------
// The target book — what the rebalancer measures against.
//
// It replaces the four hardcoded asset classes and three hardcoded cycles. The
// unit is a *sleeve*: a role the money plays (compound / take risk / stay dry),
// not a fact about the instrument. "What is this?" never told anyone how much
// to hold; "what is this for?" does. See `docs/rebalancing.md`.
// ---------------------------------------------------------------------------

/**
 * Two tolerances, because topping up and trimming are not the same price.
 * Correcting an underweight pays a buy fee; correcting an overweight pays a buy
 * fee *plus* the 0.1–0.21% final tax in `lib/brokers.ts`. The sell side is
 * therefore the wider one by default. Equal sides are still allowed — that's
 * the textbook symmetric band, kept as a choice rather than the default.
 */
export interface Band {
  /** pp below target before a buy is proposed. */
  buy: number;
  /** pp above target before a sell is. */
  sell: number;
}

/** What a position may never be used for, when the user has said so. */
export type TargetLock = "hold" | "no-sell" | "no-buy";

/**
 * A target *inside* a sleeve. Weights are relative to the sleeve, not the
 * portfolio — that's what makes them editable: retuning Core from 60/40 to
 * 70/30 never touches Growth or Buffer, and the sleeve totals still add to 100.
 */
export interface AssetTarget {
  sym: string;
  /** % of the sleeve. */
  target: number;
  /** Inherits the sleeve's band when unset. */
  band?: Band;
  lock?: TargetLock;
}

/**
 * How positions land in a sleeve. `syms` is the precise form written by filing
 * a holding by hand; `type` files a whole asset class at once and is what the
 * old `cycleProfiles` migrate into.
 */
export type SleeveMatch =
  | { kind: "syms"; syms: string[] }
  | { kind: "type"; type: PosType };

/** A named bucket. Any number of them; the weights must total 100. */
export interface Sleeve {
  id: string;
  name: string;
  color: string;
  /** % of the portfolio. */
  target: number;
  band: Band;
  match: SleeveMatch;
  /** Optional second level. Empty = the sleeve is balanced as one lump. */
  targets: AssetTarget[];
}

/**
 * One saved copy of the whole book — the replacement for `CycleProfiles`.
 * Switching books swaps every sleeve, not four numbers.
 */
export interface TargetBook {
  id: string;
  /** The user's word — "Neutral", "Musim dingin", anything. */
  name: string;
  sleeves: Sleeve[];
  /**
   * USD→IDR spot when this book was last saved. It is the baseline for the FX
   * decomposition: revaluing today's holdings at this rate separates drift the
   * user caused from drift the currency did. Missing = no decomposition shown.
   */
  rate?: number;
  saved?: string;
}

// ---------------------------------------------------------------------------
// Macro — see `docs/macro.md`. What the world did to this book, in four tenses.
// ---------------------------------------------------------------------------

/**
 * One entry in your own macro log — the replacement for the invented news feed.
 *
 * `date` is not decoration: it is the measurement baseline. The app scores
 * nothing and forecasts nothing; it reports what the tagged symbols did since
 * the day you wrote the note, which is the only way a read can be shown to have
 * been right. `read` is labelled as *yours*, never as the app's.
 */
export interface MacroNote {
  id: string;
  /** When it was written, YYYY-MM-DD. */
  date: string;
  title: string;
  source?: string;
  read: Sentiment;
  body?: string;
  /** Only symbols actually held — a tag on something you don't own measures nothing. */
  syms: string[];
}

/**
 * The shock test's inputs, in % moves. Three sliders cover most books; one per
 * driver would scale with holdings but turns a mechanism check into a control
 * panel. They are the user's assumption, never a probability the app assigns.
 */
export interface Shock {
  /** Applies to `crypto` positions. */
  crypto: number;
  /** Applies to `stock` and `etf`, both markets. `hedge` is left alone. */
  equities: number;
  /** USD→IDR. Positive = a weaker rupiah. */
  rate: number;
}

export interface ThemeColors {
  bg: string;
  surf: string;
  surf2: string;
  brd: string;
  tx: string;
  mut: string;
  acc: string;
  acctx: string;
}

/**
 * The dashboard identity banner. Both are image sources — an uploaded picture is
 * stored as a downscaled data URL, a pasted link is kept as-is. Empty falls back
 * to the Google avatar (photo) and a themed pattern (bg).
 */
export interface Profile {
  photo: string;
  bg: string;
}

/**
 * Optional halves of the app. Off = hidden, never deleted — the underlying data
 * (positions, native currencies, FX cost basis) keeps being tracked so turning a
 * feature back on restores it exactly.
 */
export interface Features {
  /** Investments: the Portfolio section and its share of net worth / allocation. */
  portfolio: boolean;
  /** Multi-currency: USD/IDR toggle, live rate chip, realized & unrealized FX. */
  fx: boolean;
}

/** One holder as typed in the first-run wizard — `bal` is still raw input. */
export interface SetupHolder {
  name: string;
  currency: Cur;
  bal: string;
  /** Capital rows only — the venue this account trades at. */
  broker?: string;
}

/**
 * Everything the first-run wizard collects, applied in one shot by `applySetup`.
 * It only ever *adds* — re-running it later tops up a ledger, never replaces one.
 */
export interface SetupConfig {
  features: Features;
  theme: ThemeId;
  /** Which currency the numbers are shown in. Ignored while FX is off (IDR). */
  cur: Cur;
  vaults: SetupHolder[];
  wallets: SetupHolder[];
  capital: SetupHolder[];
  categories: Category[];
  /** PIN that locks the Portfolio section. Ignored when portfolio is off. */
  pfPass: string;
  /** The first target book, if one was built. Null is a real answer — a book is
   *  a strategy, and demanding one on day one is its own kind of invention. */
  book: TargetBook | null;
  /** Optional recurring salary, so the ledger starts with its engine running. */
  income: { label: string; amount: string; account: string; day: number } | null;
}

/** Free-form modal form values. */
export type FormState = Record<string, any>;

export type PriceStatus = "idle" | "loading" | "live" | "error";

/** What `/api/prices/resolve` found out about a typed ticker. */
export interface MarketProbe {
  sym: string;
  us: { currency: string } | null;
  idx: { currency: string } | null;
  /** The exchange to preselect, or null when neither or both list the name. */
  suggest: "US" | "IDX" | null;
  /** Listed on both (e.g. `BBCA` the US ETF vs `BBCA.JK` the bank) — user picks. */
  ambiguous: boolean;
}

export interface LivePrice {
  price: number;
  changePct: number | null;
  /** Currency the venue quotes in. Quotes are normalised to USD before they
   *  reach the store, so this is only ever set on the wire. */
  currency?: Cur;
}

export interface LedgerState {
  /** Which optional features this account has enabled. */
  features: Features;
  /** Avatar + cover image shown on the dashboard. */
  profile: Profile;
  /** False only on a ledger that has never been set up — the wizard's gate. */
  setupDone: boolean;
  /** Whose ledger is loaded — the storage namespace. Runtime only. */
  userKey: string;
  /** True once stored prefs have been merged in. Runtime only; gates the feeds
   *  so they don't fire against seed defaults the user may have turned off. */
  hydrated: boolean;
  cur: Cur;
  section: Section;
  pfTab: PfTab;
  filter: string;
  q: string;
  planFilter: string;
  /**
   * The old rebalancing model. Kept on the type so a stored blob can still be
   * read and migrated into `books` — nothing writes them any more.
   * @deprecated superseded by `books` / `bookId`.
   */
  cycle?: keyof CycleProfiles;
  /** @deprecated superseded by `books` / `bookId`. */
  cycleProfiles?: CycleProfiles;
  /** Every saved target book. Empty until the user builds one — no book is
   *  seeded, for the same reason no money is. */
  books: TargetBook[];
  /** Which book the Rebalancing tab measures against. "" = none chosen yet. */
  bookId: string;
  /**
   * Spend idle capital before proposing a sell. On by default: a buy pays a fee
   * and no tax, while reaching for a sell with cash sitting right there burns
   * 0.1–0.21% for nothing. Off makes the engine a textbook rebalancer.
   */
  cashFirst: boolean;
  modal: string | null;
  form: FormState;
  navOpen: boolean;
  themeOpen: boolean;
  theme: ThemeId;
  overrides: Partial<Record<ThemeId, Partial<ThemeColors>>>;
  presets: Preset[];
  qView: "hub" | "choose" | "new";
  toast: string | null;
  pfPass: string;
  pfBg: string;
  pfUnlocked: boolean;
  lockInput: string;
  lockErr: boolean;
  categories: Category[];
  accounts: Account[];
  wallets: Wallet[];
  capital: Capital[];
  expenses: Expense[];
  goals: Goal[];
  prevMonth: { fixed: number; daily: number; misc: number };
  /** Cumulative realized FX gain/loss from cross-currency conversions, in IDR. */
  realizedFxIdr: number;
  /** IDR cost basis of currently-held USD cash (for unrealized FX on cash). */
  fxCostIdr: number;
  /** IDR cost basis of the portfolio at the rates positions were bought (dual P&L). */
  pfCostIdr: number;
  /** Valuation USD→IDR spot rate (IDR per USD) — frozen until you adopt a new one. */
  fxRate: number;
  /** Dated rate history for as-of valuation. */
  rates: FxRate[];
  incomes: Income[];
  positions: Position[];
  journal: JournalEntry[];
  plans: Plan[];
  /** Your own macro log. Empty on day one, and that is the honest state. */
  mlog: MacroNote[];
  /** The shock test's sliders. Session-only — a what-if isn't a setting. */
  shock: Shock;
  // --- live market data (runtime only, not persisted) ---
  livePrices: Record<string, LivePrice>;
  priceStatus: PriceStatus;
  pricesAt: number;
  /**
   * Held symbols the last poll came back without a quote for — usually a name
   * tagged to the wrong exchange (a bare `BBRI` doesn't exist on Yahoo, only
   * `BBRI.JK` does). Surfaced so a stuck price isn't mistaken for a flat one.
   */
  priceMissing: string[];
  /** Driver quotes for the Macro tab, keyed by ticker (`IDR=X`, `BTC-USD`, …). */
  macroQuotes: Record<string, LivePrice>;
  /** `SYM@YYYY-MM-DD → % since that date` — what each logged note's tags did. */
  macroMoves: Record<string, number | null>;
  macroStatus: PriceStatus;
  macroAt: number;
  /** Latest live USD/IDR quote — shown alongside the frozen valuation rate. */
  fxLive: number | null;
  fxChangePct: number | null;
  fxStatus: PriceStatus;
  fxAt: number;
}
