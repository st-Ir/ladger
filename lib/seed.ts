import { RATE } from "./config";
import { ANON_KEY } from "./storage";
import type { CycleProfiles, FxRate, LedgerState, PosType, Sleeve, TargetBook } from "./types";

/**
 * Dated USD→IDR history (IDR per 1 USD). Flows are valued at the rate of their
 * transaction date, so a June expense stays worth what it was worth in June no
 * matter where the rate goes later. Live quotes append to this list.
 */
export const SEED_RATES: FxRate[] = [
  { date: "2025-10-01", idrPerUsd: 15600 },
  { date: "2025-11-01", idrPerUsd: 15650 },
  { date: "2025-12-01", idrPerUsd: 15720 },
  { date: "2026-01-01", idrPerUsd: 15800 },
  { date: "2026-02-01", idrPerUsd: 15920 },
  { date: "2026-03-01", idrPerUsd: 16040 },
  { date: "2026-04-01", idrPerUsd: 15980 },
  { date: "2026-05-01", idrPerUsd: 16120 },
  { date: "2026-06-01", idrPerUsd: 16180 },
  { date: "2026-07-01", idrPerUsd: RATE },
];

/**
 * Produces the pristine initial state (before persisted prefs are merged in):
 * the scaffolding, none of the money.
 *
 * There is deliberately **no demo ledger** — no accounts, no wallets, no capital,
 * no transactions or positions. Every holder in this app is created by the
 * first-run wizard (`components/Setup.tsx`), so nobody ever has to tell seeded
 * money apart from their own. What survives is reference data, not finances: the
 * three expense categories (an expense needs one to be filed under) and the
 * USD→IDR history (a fact about the world).
 */
export function createInitialState(): LedgerState {
  return {
    // Both on by default: a ledger saved before features existed must look
    // exactly as it did, and the wizard opens on this as its starting position.
    features: { portfolio: true, fx: true },
    profile: { photo: "", bg: "" },
    // Empty books can't be used, so the wizard comes first. A blob saved before
    // the wizard existed has no `setupDone`, and `hydrate` leaves it as it was
    // stored — only a genuinely new ledger lands on this `false`.
    setupDone: false,
    userKey: ANON_KEY,
    hydrated: false,
    cur: "USD",
    section: "dashboard",
    pfTab: "pnl",
    filter: "all",
    q: "",
    planFilter: "all",
    // No target book is seeded, for the same reason no money is: a book is one
    // person's strategy, and the roles the wizard offers on a blank ledger are
    // named but never weighted. See `docs/rebalancing.md`.
    books: [],
    bookId: "",
    cashFirst: true,
    modal: null,
    form: {},
    navOpen: false,
    themeOpen: false,
    theme: "dark",
    overrides: {},
    presets: [],
    qView: "hub",
    toast: null,
    pfPass: "1234",
    pfBg: "",
    pfUnlocked: false,
    lockInput: "",
    lockErr: false,
    categories: [
      { id: "fixed", name: "Fixed" },
      { id: "daily", name: "Daily" },
      { id: "misc", name: "Misc" },
    ],
    // Every money-bearing list starts empty — the wizard fills the first three.
    accounts: [],
    wallets: [],
    capital: [],
    expenses: [],
    goals: [],
    prevMonth: { fixed: 0, daily: 0, misc: 0 },
    realizedFxIdr: 0,
    fxCostIdr: 0,
    pfCostIdr: 0,
    fxRate: RATE,
    rates: SEED_RATES,
    incomes: [],
    positions: [],
    journal: [],
    plans: [],
    // The macro log starts empty and stays empty until you write something. It
    // is the one panel that can't be seeded: a borrowed opinion measures nothing.
    mlog: [],
    shock: { crypto: 0, equities: 0, rate: 0 },
    livePrices: {},
    macroQuotes: {},
    macroMoves: {},
    macroStatus: "idle",
    macroAt: 0,
    priceStatus: "idle",
    pricesAt: 0,
    priceMissing: [],
    fxLive: null,
    fxChangePct: null,
    fxStatus: "idle",
    fxAt: 0,
  };
}

/** Keys that are persisted to localStorage (mirrors the original app). */
export const PERSIST_KEYS = [
  "theme", "overrides", "presets", "categories", "accounts", "wallets", "expenses", "incomes",
  "goals", "positions", "journal", "pfPass", "pfBg", "plans", "capital",
  // `cycle`/`cycleProfiles` are still read so an old blob can be migrated, and
  // still written so downgrading doesn't lose anyone's targets.
  "cycle", "cycleProfiles", "books", "bookId", "cashFirst",
  "realizedFxIdr", "fxCostIdr", "pfCostIdr",
  "fxRate", "rates", "features", "profile", "setupDone", "cur",
  // `shock` is deliberately absent: a what-if you are dragging right now is not a
  // preference, and persisting it would write to storage on every slider tick.
  "mlog",
] as const;

const CLASS_META: Record<PosType, { name: string; color: string }> = {
  crypto: { name: "Crypto", color: "#e8973b" },
  stock: { name: "Stocks", color: "#5b9bff" },
  etf: { name: "ETF", color: "var(--pnl-up)" },
  hedge: { name: "SGOV Hedge", color: "#9aa6bc" },
};

const CYCLE_LABEL: Record<string, string> = { bull: "Bull", neutral: "Neutral", bear: "Bear" };

/**
 * The old fixed model, carried forward rather than thrown away.
 *
 * Each of the three cycle profiles becomes a target book of four sleeves matched
 * **by type**, holding the same percentages. Today's blanket ±2 pp arrives as an
 * explicit symmetric `{ buy: 2, sell: 2 }` — widening the sell side on someone's
 * behalf would be the app changing their strategy during an upgrade. A user who
 * never opens the new step keeps exactly the targets they had, and gains the
 * cash-first, lot-rounding and cost-disclosure parts of the plan for free.
 *
 * Returns `null` when there is nothing to migrate, so a fresh ledger stays
 * bookless and lands in the wizard instead.
 */
export function migrateBooks(
  profiles: CycleProfiles | undefined,
  cycle: string | undefined,
  rate: number
): { books: TargetBook[]; bookId: string } | null {
  if (!profiles) return null;
  const ids = (["bull", "neutral", "bear"] as const).filter((k) => profiles[k]);
  if (!ids.length) return null;
  const books: TargetBook[] = ids.map((k) => {
    const p = profiles[k];
    const sleeves: Sleeve[] = (["crypto", "stock", "etf", "hedge"] as PosType[]).map((t) => ({
      id: k + "-" + t,
      name: CLASS_META[t].name,
      color: CLASS_META[t].color,
      target: (p as any)[t] || 0,
      band: { buy: 2, sell: 2 },
      match: { kind: "type", type: t },
      targets: [],
    }));
    return { id: "bk-" + k, name: CYCLE_LABEL[k] || k, sleeves, rate, saved: "" };
  });
  const want = "bk-" + (cycle || "neutral");
  return { books, bookId: books.some((b) => b.id === want) ? want : books[0].id };
}
