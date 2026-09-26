"use client";

import { create } from "zustand";
import { PERSIST_KEYS, createInitialState, migrateBooks } from "./seed";
import { THEMES, TODAY, currentRate, syncRates } from "./config";
import { ANON_KEY, getStorage } from "./storage";
import { convert, fmtIn, fmtRate, makeFormat, parseAmount, roundIn, toFunctional } from "./format";
import { dueOccurrences, evalStatus } from "./recurring";
import { type Broker, brokerById, feeFor } from "./brokers";
import type { RebalMove } from "./rebalance";
import type {
  Cur,
  Features,
  FormState,
  LedgerState,
  LivePrice,
  MacroNote,
  MarketProbe,
  PfTab,
  PosType,
  PriceStatus,
  Profile,
  Section,
  SetupConfig,
  SetupHolder,
  Shock,
  TargetBook,
  ThemeColors,
  ThemeId,
} from "./types";

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function balOf(s: LedgerState, name?: string): number {
  const a = (s.accounts || []).find((x) => x.name === name);
  if (a) return a.bal;
  const w = (s.wallets || []).find((x) => x.name === name);
  if (w) return w.bal;
  const c = (s.capital || []).find((x) => x.name === name);
  return c ? c.bal : 0;
}

/** Native currency of a holder (account/wallet/capital). Missing = USD (legacy). */
function curOf(s: LedgerState, name?: string): Cur {
  const a = (s.accounts || []).find((x) => x.name === name);
  if (a) return a.currency || "USD";
  const w = (s.wallets || []).find((x) => x.name === name);
  if (w) return w.currency || "USD";
  const c = (s.capital || []).find((x) => x.name === name);
  return (c && c.currency) || "USD";
}

/** The venue a capital account trades at, if it has been told which. */
function brokerOf(s: LedgerState, name?: string): Broker | undefined {
  const c = (s.capital || []).find((x) => x.name === name);
  return brokerById(c && c.broker);
}

/** Parse a raw amount string as a native number (no currency conversion).
 *  Tolerates Indonesian and US grouping — "16.250" and "16,250" both mean 16250. */
function nat(v: any): number {
  return parseAmount(v);
}

/** Convert into `to`'s currency and round once, at the point it becomes a balance. */
function recvIn(amount: number, from: Cur, to: Cur, rate: number): number {
  return roundIn(convert(amount, from, to, rate), to);
}

/** True when a holder is referenced by any transaction, preset or open order —
 *  such a holder may be renamed but its currency is locked and it can't be deleted. */
function holderUsed(s: LedgerState, name?: string): boolean {
  if (!name) return false;
  return (
    (s.expenses || []).some((e) => e.wallet === name) ||
    (s.incomes || []).some((i) => i.account === name) ||
    (s.presets || []).some((p) => p.wallet === name || p.account === name || p.from === name || p.to === name) ||
    (s.plans || []).some((p) => p.src === name)
  );
}

/** Repoint every reference when a holder is renamed, so history stays linked. */
function renameRefs(s: LedgerState, from: string, to: string): Partial<LedgerState> {
  if (!from || from === to) return {};
  return {
    expenses: s.expenses.map((e) => (e.wallet === from ? { ...e, wallet: to } : e)),
    incomes: s.incomes.map((i) => (i.account === from ? { ...i, account: to } : i)),
    presets: s.presets.map((p) =>
      p.wallet === from || p.account === from || p.from === from || p.to === from
        ? { ...p, ...(p.wallet === from ? { wallet: to } : {}), ...(p.account === from ? { account: to } : {}), ...(p.from === from ? { from: to } : {}), ...(p.to === from ? { to: to } : {}) }
        : p
    ),
    plans: s.plans.map((p) => (p.src === from ? { ...p, src: to } : p)),
  };
}

/** Total USD-denominated cash held (accounts + wallets + capital). */
function usdCash(s: LedgerState): number {
  const sum = (arr: any[]) => (arr || []).reduce((a, x) => a + ((x.currency || "USD") === "USD" ? x.bal : 0), 0);
  return sum(s.accounts) + sum(s.wallets) + sum(s.capital);
}

/** Average IDR cost rate of held USD cash (falls back to spot when none held). */
function cashRate(s: LedgerState): number {
  const held = usdCash(s);
  return held > 1e-9 ? (s.fxCostIdr || 0) / held : currentRate();
}

/**
 * Positions are priced in the USD base, holders keep native balances — so every
 * flow between the two has to be restated before it touches a balance, or a
 * rupiah account gets debited by a dollar figure. A holder already in USD is
 * left exactly as-is; a real conversion lands on whole rupiah.
 */
function inCur(usd: number, cur: Cur): number {
  return cur === "USD" ? usd : roundIn(usd * currentRate(), "IDR");
}

/**
 * The currency the user is actually typing/reading in. With FX off the app is a
 * single-currency (IDR) ledger, so the USD/IDR toggle is ignored — mirrors the
 * `dispCur` in `derive.ts`.
 */
function dispCur(s: LedgerState): Cur {
  return s.features?.fx === false ? "IDR" : s.cur;
}

/** Prefill a share-price input: IDX names are typed in rupiah, everything else
 *  in whatever currency the app is displaying. Mirrors `px` in `submit`. */
function pxField(s: LedgerState, usd: number, market?: string): string {
  if (market === "IDX") return String(Math.round(usd * currentRate()));
  return String(makeFormat(dispCur(s)).curNum(usd));
}

function arrKey(kind: string): "accounts" | "capital" | "wallets" {
  return kind === "account" ? "accounts" : kind === "capital" ? "capital" : "wallets";
}

export interface LedgerActions {
  hydrate: () => Promise<void>;
  persist: () => void;
  activeColors: () => ThemeColors;

  /** Point the store at an account's stored ledger. Call before `hydrate`. */
  setUserKey: (key: string) => void;
  toggleFeature: (key: keyof Features) => void;

  /** Commit the first-run wizard. Additive: it never deletes existing holders. */
  applySetup: (cfg: SetupConfig) => void;
  /** Re-open the wizard later, from the profile sheet. Not persisted. */
  startSetup: () => void;
  /** Set (or clear, with "") the avatar or the cover image. */
  setProfileImage: (key: keyof Profile, src: string) => void;

  go: (id: Section) => void;
  goHome: () => void;
  goExpense: () => void;
  setCur: (id: Cur) => void;
  setPf: (id: PfTab) => void;
  /** Switch the target book the rebalancer measures against. */
  setBook: (id: string) => void;
  /** Upsert a book from the Target-book editor and make it the active one. */
  saveBook: (book: TargetBook) => void;
  delBook: (id: string) => void;
  /** File a loose holding into a sleeve — the user's answer, never a guess. */
  fileSymbol: (sym: string, sleeveId: string) => void;
  toggleCashFirst: () => void;
  /** Open the Buy/Sell/Transfer modal prefilled from a plan row. */
  execMove: (m: RebalMove) => void;
  openBookEdit: () => void;
  setFilter: (id: string) => void;
  onQ: (v: string) => void;

  toggleNav: () => void;
  closeNav: () => void;
  openTheme: () => void;
  closeTheme: () => void;
  setTheme: (id: ThemeId) => void;
  setColor: (token: string, val: string) => void;
  resetColors: () => void;

  open: (type: string) => void;
  openBtn: (id: string) => void;
  close: () => void;
  onField: (name: string, value: any) => void;
  setMarket: (m: string) => void;
  applyMarketProbe: (sym: string, res: MarketProbe) => void;
  setFormCat: (v: string) => void;
  setSide: (v: string) => void;
  setPosType: (v: string) => void;
  setSellMode: (v: string) => void;

  openTransfer: (from?: string) => void;
  openPlace: (kind: string, idx: number | null) => void;
  delPlace: (kind: string, idx: number) => void;

  openCategories: () => void;
  addCategory: (name: string) => void;
  renameCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;

  openQuick: () => void;
  newPreset: () => void;
  chooseMode: (mode: string) => void;
  qBack: () => void;
  setBuilderKind: (v: string) => void;
  setFreq: (v: string) => void;
  savePreset: () => void;
  delPreset: (id: string) => void;
  quickLog: (id: string) => void;
  processRecurring: () => void;

  onLockInput: (v: string) => void;
  tryUnlock: () => void;
  lockNow: () => void;
  /** Lock settings live in the profile sheet, so they're set directly. */
  setLock: (pass: string, bg: string) => void;

  openPlan: () => void;
  openOrder: () => void;
  /** `fee` is USD-base, as collected by the close-order modal. */
  closeOrder: (id: string, fee?: number) => void;
  openCloseOrder: (id: string) => void;
  openPlanEval: (id: string) => void;
  cancelPlan: (id: string) => void;
  delPlan: (id: string) => void;
  setPlanFilter: (id: string) => void;

  openInvest: () => void;
  openSell: () => void;
  openPosPrice: (sym: string) => void;

  primary: () => void;
  submit: () => void;
  toastMsg: (msg: string) => void;

  /** Move one shock slider. The other two stay put — they are independent by design. */
  setShock: (patch: Partial<Shock>) => void;
  resetShock: () => void;
  /** Open the macro-log editor, on a new note or an existing one. */
  openNote: (id?: string) => void;
  delNote: (id: string) => void;

  setPriceStatus: (s: PriceStatus) => void;
  applyPrices: (map: Record<string, LivePrice>) => void;
  setMacroStatus: (s: PriceStatus) => void;
  applyMacro: (
    quotes: Record<string, LivePrice>,
    moves: Record<string, number | null>
  ) => void;
  setFxStatus: (s: PriceStatus) => void;
  applyFxQuote: (rate: number, changePct: number | null) => void;
  adoptFxRate: () => void;
  editGoal: (index: number, patch: Partial<{ name: string; saved: number; target: number }>) => void;
}

export type Store = LedgerState & LedgerActions;

export const useLedger = create<Store>((set, get) => {
  const seeded = createInitialState();
  syncRates(seeded.fxRate, seeded.rates);

  const persist = () => {
    const s = get();
    const out: Record<string, unknown> = {};
    for (const k of PERSIST_KEYS) out[k] = (s as any)[k];
    // Fire-and-forget: the adapter swallows its own failures (see lib/storage.ts).
    void getStorage(s.userKey).save(s.userKey, out);
  };

  const save = (patch: Partial<LedgerState>) => {
    set(patch as any);
    persist();
  };

  const toastMsg = (msg: string) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 2400);
  };

  const open = (type: string) => {
    const s = get();
    const defs: Record<string, FormState> = {
      expense: { cat: (s.categories[0] || ({} as any)).id || "daily", wallet: (s.wallets[0] || ({} as any)).name },
      income: { account: (s.accounts[0] || ({} as any)).name },
      transfer: {
        from: (s.accounts[0] || ({} as any)).name,
        to: (s.wallets[0] || ({} as any)).name,
      },
      plan: { side: "Long" },
      order: { src: (s.capital[0] || ({} as any)).name, type: "crypto", market: "US", side: "Long" },
      invest: { src: (s.capital[0] || ({} as any)).name, type: "crypto", market: "US" },
      sell: {
        posSym: (s.positions[0] || ({} as any)).sym,
        dest: (s.capital[0] || ({} as any)).name,
        sellAll: true,
      },
      goal: {},
    };
    set({ modal: type, form: { ...(defs[type] || {}) } });
  };

  const processRecurring = () => {
    let ran = 0;
    const s = get();
    let changed = false;
    const wallets = s.wallets.map((w) => ({ ...w }));
    const accounts = s.accounts.map((a) => ({ ...a }));
    const capital = (s.capital || []).map((c) => ({ ...c }));
    const expenses = [...s.expenses];
    const incomes = [...s.incomes];
    const presets = s.presets.map((p) => {
      if (p.mode !== "recurring") return p;
      const occ = dueOccurrences(p);
      if (!occ.length) return p;
      occ.forEach((date) => {
        if (p.kind === "expense") {
          const wal = p.wallet || (wallets[0] || ({} as any)).name;
          expenses.unshift({ name: p.label, cat: p.cat || "fixed", amount: p.amount, wallet: wal, date, currency: p.currency || curOf(s, wal) });
          const w = wallets.find((x) => x.name === wal);
          if (w) w.bal -= p.amount;
        } else if (p.kind === "transfer") {
          const from = p.from;
          const to = p.to;
          if (from && to && from !== to) {
            const recv = recvIn(p.amount, curOf(s, from), curOf(s, to), currentRate());
            const af = accounts.find((x) => x.name === from);
            if (af) af.bal -= p.amount;
            const at = accounts.find((x) => x.name === to);
            if (at) at.bal += recv;
            const wf = wallets.find((x) => x.name === from);
            if (wf) wf.bal -= p.amount;
            const wt = wallets.find((x) => x.name === to);
            if (wt) wt.bal += recv;
            const cf = capital.find((x) => x.name === from);
            if (cf) cf.bal -= p.amount;
            const ct = capital.find((x) => x.name === to);
            if (ct) ct.bal += recv;
          }
        } else {
          const acct = p.account || (accounts[0] || ({} as any)).name;
          incomes.unshift({ name: p.label, account: acct, amount: p.amount, date, currency: p.currency || curOf(s, acct) });
          const a = accounts.find((x) => x.name === acct);
          if (a) a.bal += p.amount;
        }
        ran++;
      });
      changed = true;
      return { ...p, lastRun: occ[occ.length - 1] };
    });
    if (!changed) return;
    set({ presets, wallets, accounts, capital, expenses, incomes });
    persist();
    if (ran)
      toastMsg(
        ran + " recurring " + (ran > 1 ? "transactions" : "transaction") + " auto-logged"
      );
  };

  return {
    ...seeded,

    hydrate: async () => {
      const userKey = get().userKey;
      const saved: any = await getStorage(userKey).load(userKey);
      // Nothing stored = first time in, and the base state is already empty
      // books awaiting the wizard — signed in or guest, both start the same way.
      const base = createInitialState();
      const merged: any = { ...base, userKey, hydrated: true };
      for (const k of PERSIST_KEYS) {
        if (saved[k] !== undefined && saved[k] !== null) merged[k] = saved[k];
      }
      // A blob written before `setupDone` was persisted has none — infer it from
      // whether that ledger already has somewhere to keep money, or the wizard
      // would reopen on top of a furnished ledger.
      if (saved.setupDone === undefined)
        merged.setupDone = ((saved.accounts || []).length + (saved.wallets || []).length) > 0;
      // A blob written before features existed has no `features` — the spread of
      // `base` already left both on, which is what those ledgers expect.
      merged.features = { ...base.features, ...(saved.features || {}) };
      merged.profile = { ...base.profile, ...(saved.profile || {}) };
      // A ledger saved under the old rebalancing model has cycle profiles and no
      // books. Carry the targets forward instead of dropping them — nobody loses
      // a strategy to an upgrade. Runs once: after this, `books` is non-empty.
      if (!(merged.books || []).length) {
        const mig = migrateBooks(saved.cycleProfiles, saved.cycle, merged.fxRate || base.fxRate);
        if (mig) {
          merged.books = mig.books;
          merged.bookId = merged.bookId || mig.bookId;
        }
      }
      // The pure format/derive modules read the rate from config — point them at
      // the restored valuation rate + history before anything renders.
      syncRates(merged.fxRate, merged.rates);
      set(merged);
      processRecurring();
    },

    persist,

    setUserKey: (key) => {
      const next = key || ANON_KEY;
      // Switching accounts invalidates what's on screen: mark it unloaded so the
      // shell waits instead of showing (and possibly re-saving) the old ledger
      // while the new one is still in flight.
      set(next === get().userKey ? { userKey: next } : { userKey: next, hydrated: false });
    },

    toggleFeature: (key) => {
      const s = get();
      const on = !s.features[key];
      const next = { ...s.features, [key]: on };
      // Leaving a section that just got hidden, so the shell can't show a blank.
      const section = !next.portfolio && s.section === "portfolio" ? "dashboard" : s.section;
      save({ features: next, section });
      toastMsg(
        (key === "portfolio" ? "Portfolio" : "FX effect") + (on ? " dinyalakan" : " dimatikan")
      );
    },

    applySetup: (cfg) => {
      const s = get();
      const rate = currentRate();
      // A holder's name is the join key for every transaction that touches it, so
      // a duplicate would silently merge two histories. Blanks and names already
      // in the ledger are dropped rather than renamed.
      const taken = new Set([...s.accounts, ...s.wallets, ...s.capital].map((h) => h.name));
      const clean = (list: SetupHolder[]) => {
        const out: { name: string; bal: number; currency: Cur; broker?: string }[] = [];
        for (const h of list || []) {
          const name = (h.name || "").trim();
          if (!name || taken.has(name)) continue;
          taken.add(name);
          // FX off = one currency, so a stray USD pick can't leak in.
          const currency: Cur = cfg.features.fx ? h.currency || "IDR" : "IDR";
          out.push({ name, bal: roundIn(Math.max(0, nat(h.bal)), currency), currency, broker: h.broker || undefined });
        }
        return out;
      };
      const vaults = clean(cfg.vaults);
      const newWallets = clean(cfg.wallets);
      const newCapital = cfg.features.portfolio ? clean(cfg.capital) : [];

      // An opening balance is money you already had, not income — it is never
      // logged as a flow. USD openings still get an IDR cost basis at today's
      // rate, so the ledger starts at zero unrealized FX, not a phantom gain.
      const usdOpened = [...vaults, ...newWallets, ...newCapital].reduce(
        (a, h) => a + (h.currency === "USD" ? h.bal : 0),
        0
      );

      const tags = ["t-st", "t-et", "t-cr"];
      const wallets = [
        ...s.wallets,
        ...newWallets.map((w, i) => ({
          ...w,
          tag: tags[(s.wallets.length + i) % 3],
          badge: w.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "W",
        })),
      ];

      // Categories come back edited in place: a rename keeps its id so filed
      // expenses follow it, and one that still has expenses survives removal.
      const edited = cfg.categories.map((c) => ({ id: c.id, name: (c.name || "").trim() })).filter((c) => c.name);
      const stillUsed = s.categories.filter(
        (c) => s.expenses.some((e) => e.cat === c.id) && !edited.some((k) => k.id === c.id)
      );
      const categories = [...edited, ...stillUsed];

      const accounts = [...s.accounts, ...vaults];
      const inc = cfg.income;
      const incAmount = inc ? Math.max(0, nat(inc.amount)) : 0;
      const incAccount = inc && accounts.some((a) => a.name === inc.account) ? inc.account : (accounts[0] || ({} as any)).name;
      const presets =
        inc && incAmount > 0 && incAccount
          ? [
              ...s.presets,
              {
                id: "r" + Date.now().toString(36),
                mode: "recurring" as const,
                label: (inc.label || "").trim() || "Gaji",
                kind: "income" as const,
                account: incAccount,
                amount: incAmount,
                currency: (accounts.find((a) => a.name === incAccount) || ({} as any)).currency || "IDR",
                freq: "monthly" as const,
                day: Math.min(28, Math.max(1, +inc.day || 1)),
                // Runs from today onward: a preset created now must not back-fill
                // months of salary this ledger never received.
                lastRun: TODAY,
                created: TODAY,
              },
            ]
          : s.presets;

      // A target book built in the wizard is stamped the same way `saveBook`
      // stamps one, so its FX baseline starts from the day it was written.
      const wizBook = cfg.features.portfolio && cfg.book ? { ...cfg.book, rate, saved: TODAY } : null;

      save({
        features: cfg.features,
        theme: cfg.theme,
        cur: cfg.features.fx ? cfg.cur : "IDR",
        books: wizBook ? [...s.books, wizBook] : s.books,
        bookId: wizBook ? wizBook.id : s.bookId,
        accounts,
        wallets,
        capital: [...s.capital, ...newCapital],
        categories: categories.length ? categories : s.categories,
        presets,
        fxCostIdr: (s.fxCostIdr || 0) + usdOpened * rate,
        pfPass: cfg.features.portfolio ? (cfg.pfPass || "").trim() || s.pfPass : s.pfPass,
        section: "dashboard",
        setupDone: true,
      });
      toastMsg("Penyiapan selesai — selamat datang");
    },

    // Deliberately not persisted: closing the tab mid-setup shouldn't leave a
    // furnished ledger stuck behind the wizard on the next visit.
    startSetup: () => set({ setupDone: false, modal: null }),

    setProfileImage: (key, src) => {
      const s = get();
      save({ profile: { ...s.profile, [key]: src } });
      const what = key === "photo" ? "Foto profil" : "Background";
      toastMsg(what + (src ? " diperbarui" : " dihapus"));
    },

    activeColors: () => {
      const s = get();
      const base = THEMES[s.theme] || THEMES.dark;
      return { ...base, ...((s.overrides || {})[s.theme] || {}) };
    },

    go: (id) =>
      set({
        // A hidden section stays unreachable even from stale state or a stray call.
        section: id === "portfolio" && !get().features.portfolio ? "dashboard" : id,
        navOpen: false,
      }),
    goHome: () => set({ section: "dashboard" }),
    goExpense: () => set({ section: "flow" }),
    setCur: (id) => set({ cur: id }),
    setPf: (id) => set({ pfTab: id }),

    setBook: (id) => {
      save({ bookId: id });
      const b = get().books.find((x) => x.id === id);
      if (b) toastMsg("Target book: " + b.name);
    },

    saveBook: (book) => {
      const s = get();
      // Stamp the rate the book was saved at: it is the baseline the FX
      // decomposition measures against, so "this drift isn't mine" stays
      // answerable later. Re-saving re-bases it, which is the intent.
      const stamped: TargetBook = { ...book, rate: currentRate(), saved: TODAY };
      const exists = s.books.some((b) => b.id === book.id);
      save({
        books: exists ? s.books.map((b) => (b.id === book.id ? stamped : b)) : [...s.books, stamped],
        bookId: book.id,
        modal: null,
      });
      toastMsg("Target book disimpan · " + stamped.name);
    },

    delBook: (id) => {
      const s = get();
      const books = s.books.filter((b) => b.id !== id);
      save({ books, bookId: s.bookId === id ? (books[0] || ({} as TargetBook)).id || "" : s.bookId });
      toastMsg("Target book dihapus");
    },

    fileSymbol: (sym, sleeveId) => {
      const s = get();
      const book = s.books.find((b) => b.id === s.bookId);
      if (!book) return;
      const up = (sym || "").toUpperCase();
      let converted = "";
      const sleeves = book.sleeves.map((sl) => {
        if (sl.id !== sleeveId) {
          // A ticker belongs to exactly one sleeve, so filing it here takes it
          // off every other list rather than leaving it counted twice.
          if (sl.match.kind !== "syms") return sl;
          const syms = sl.match.syms.filter((x) => (x || "").toUpperCase() !== up);
          return syms.length === sl.match.syms.length ? sl : { ...sl, match: { kind: "syms" as const, syms } };
        }
        if (sl.match.kind === "syms") {
          return sl.match.syms.some((x) => (x || "").toUpperCase() === up)
            ? sl
            : { ...sl, match: { kind: "syms" as const, syms: [...sl.match.syms, up] } };
        }
        // Filing by hand into a class-matched sleeve turns it into a ticker
        // list, expanded to everything it holds today so nothing it already
        // claims is orphaned. New names of that class land in Unassigned after
        // this — which is the rule anyway: nothing is auto-filed.
        const t = sl.match.type as PosType;
        const held = s.positions.filter((p) => p.type === t).map((p) => (p.sym || "").toUpperCase());
        converted = sl.name;
        return { ...sl, match: { kind: "syms" as const, syms: [...new Set([...held, up])] } };
      });
      save({ books: s.books.map((b) => (b.id === book.id ? { ...b, sleeves } : b)) });
      const target = sleeves.find((x) => x.id === sleeveId);
      toastMsg(
        up + " → " + (target ? target.name : "sleeve") + (converted ? " · " + converted + " kini per ticker" : "")
      );
    },

    toggleCashFirst: () => {
      const on = !get().cashFirst;
      save({ cashFirst: on });
      toastMsg(on ? "Pakai kas dulu sebelum jual" : "Rebalance ala textbook — boleh jual walau ada kas");
    },

    execMove: (m) => {
      const s = get();
      if (m.kind === "transfer") {
        return set({ modal: "transfer", form: { from: m.from, to: m.account, amount: String(makeFormat(dispCur(s)).curNum(m.amount)) } });
      }
      const fmt = makeFormat(dispCur(s));
      if (m.kind === "buy") {
        return set({
          modal: "invest",
          form: {
            src: m.account,
            asset: m.sym,
            type: m.type || "crypto",
            market: m.market || "US",
            mktPinned: true,
            price: pxField(s, m.price, m.market),
            amount: String(fmt.curNum(m.amount)),
          },
        });
      }
      const pos = s.positions.find((p) => p.sym === m.sym);
      set({
        modal: "sell",
        form: {
          posSym: m.sym,
          dest: m.account,
          // A trim is a partial by definition — only a move that clears the whole
          // position gets to preselect "All".
          sellAll: !!pos && m.qty >= pos.qty - 1e-9,
          qty: String(+m.qty.toFixed(6)),
          price: pxField(s, m.price, m.market),
        },
      });
    },
    setFilter: (id) => set({ filter: id }),
    onQ: (v) => set({ q: v }),

    toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
    closeNav: () => set({ navOpen: false }),
    openTheme: () => set({ themeOpen: true }),
    closeTheme: () => set({ themeOpen: false }),
    setTheme: (id) => save({ theme: id }),
    setColor: (token, val) => {
      set((s) => {
        const ov = { ...s.overrides };
        ov[s.theme] = { ...(ov[s.theme] || {}), [token]: val };
        return { overrides: ov };
      });
      persist();
    },
    resetColors: () => {
      set((s) => {
        const ov = { ...s.overrides };
        delete ov[s.theme];
        return { overrides: ov };
      });
      persist();
    },

    open,
    openBtn: (id) => open(id),
    close: () => set({ modal: null }),
    onField: (name, value) => set((s) => ({ form: { ...s.form, [name]: value } })),
    // Picking the exchange by hand pins it — the venue probe below must never
    // overrule a deliberate choice.
    setMarket: (m) => set((s) => ({ form: { ...s.form, market: m, mktPinned: true } })),
    /**
     * Apply what `/api/prices/resolve` found for the typed ticker. Only fills in
     * an exchange the user hasn't chosen, and only while the field still holds
     * the symbol that was looked up (async replies can land after more typing).
     */
    applyMarketProbe: (sym, res) =>
      set((s) => {
        if ((s.form.asset || "").trim().toUpperCase() !== sym) return {};
        const pin = s.form.mktPinned;
        return {
          form: {
            ...s.form,
            mktProbe: res.ambiguous ? "both" : res.suggest ? res.suggest.toLowerCase() : "none",
            market: !pin && res.suggest ? res.suggest : s.form.market,
          },
        };
      }),
    setFormCat: (v) => set((s) => ({ form: { ...s.form, cat: v } })),
    setSide: (v) => set((s) => ({ form: { ...s.form, side: v } })),
    setPosType: (v) => set((s) => ({ form: { ...s.form, type: v } })),
    setSellMode: (v) => set((s) => ({ form: { ...s.form, sellAll: v === "all" } })),

    openTransfer: (from) =>
      set((s) => ({
        modal: "transfer",
        form: {
          from: from || (s.accounts[0] || ({} as any)).name,
          to: (s.wallets[0] || ({} as any)).name,
          amount: "",
          recvAmount: "",
        },
      })),

    openPlace: (kind, idx) => {
      const s = get();
      let name = "";
      let placeCur: Cur = dispCur(s);
      let broker = "";
      if (idx != null) {
        const it = (s as any)[arrKey(kind)][idx] || {};
        name = it.name || "";
        placeCur = it.currency || "USD";
        broker = it.broker || "";
      }
      set({ modal: "place", form: { placeKind: kind, idx, name, placeCur, broker } });
    },

    delPlace: (kind, idx) => {
      const s = get();
      const key = arrKey(kind);
      const arr = (s as any)[key];
      const label = kind === "account" ? "vault" : kind === "capital" ? "capital account" : "wallet";
      if (arr.length <= 1) return toastMsg("Keep at least one " + label);
      const nm = (arr[idx] || {}).name || "";
      const bal = (arr[idx] || {}).bal || 0;
      // Deleting a used holder would strand its transactions and silently drop
      // its balance out of net worth — same guard as deleting a used category.
      if (Math.abs(bal) > 1e-9) return toastMsg("Kosongkan " + nm + " dulu — masih ada saldo");
      if (holderUsed(s, nm)) return toastMsg("Tidak bisa hapus — " + nm + " punya transaksi");
      set((st) => ({ [key]: (st as any)[key].filter((_: any, i: number) => i !== idx) }) as any);
      persist();
      toastMsg("Deleted " + nm);
    },

    openCategories: () => set({ modal: "categories", form: {} }),
    addCategory: (name) => {
      const nm = (name || "").trim();
      if (!nm) return;
      const s = get();
      if (s.categories.some((c) => c.name.toLowerCase() === nm.toLowerCase()))
        return toastMsg("“" + nm + "” already exists");
      const id = nm.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + "-" + Date.now().toString(36);
      set((st) => ({ categories: [...st.categories, { id, name: nm }] }));
      persist();
      toastMsg("Added " + nm);
    },
    renameCategory: (id, name) => {
      const nm = (name || "").trim();
      set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, name: nm || c.name } : c)) }));
      persist();
    },
    deleteCategory: (id) => {
      const s = get();
      if (s.categories.length <= 1) return toastMsg("Keep at least one category");
      if (s.expenses.some((e) => e.cat === id))
        return toastMsg("Can’t delete — category has transactions");
      const nm = (s.categories.find((c) => c.id === id) || ({} as any)).name || "";
      set((st) => ({ categories: st.categories.filter((c) => c.id !== id) }));
      persist();
      toastMsg("Deleted " + nm);
    },

    openQuick: () => set({ modal: "quickadd", qView: "hub" }),
    newPreset: () => {
      const s = get();
      set({
        qView: "choose",
        form: {
          kind: "expense",
          cat: "daily",
          wallet: (s.wallets[0] || ({} as any)).name,
          account: (s.accounts[0] || ({} as any)).name,
          from: (s.accounts[0] || ({} as any)).name,
          to: (s.wallets[0] || ({} as any)).name,
          label: "",
          amount: "",
          freq: "monthly",
          day: 1,
          mode: "tap",
        },
      });
    },
    chooseMode: (mode) => set((s) => ({ qView: "new", form: { ...s.form, mode } })),
    qBack: () => set((s) => ({ qView: s.qView === "new" ? "choose" : "hub" })),
    setBuilderKind: (v) =>
      set((s) => {
        const f: FormState = { ...s.form, kind: v };
        if (v === "transfer") {
          if (!f.from) f.from = (s.accounts[0] || ({} as any)).name;
          if (!f.to) f.to = (s.wallets[0] || ({} as any)).name;
        }
        return { form: f };
      }),
    setFreq: (v) =>
      set((s) => {
        const f: FormState = { ...s.form, freq: v };
        if (v === "weekly" && (f.day == null || +f.day > 6)) f.day = 1;
        if (v === "monthly" && (f.day == null || +f.day < 1)) f.day = 1;
        return { form: f };
      }),

    savePreset: () => {
      const s = get();
      const f = s.form;
      const mode = f.mode || "tap";
      const pr: any = {
        id: "p" + Date.now(),
        label: (f.label || "Untitled").trim(),
        kind: f.kind || "expense",
        amount: nat(f.amount), // native in the target holder's currency
        mode,
      };
      if (pr.kind === "expense") {
        pr.cat = f.cat || "daily";
        pr.wallet = f.wallet || (s.wallets[0] || ({} as any)).name;
      } else if (pr.kind === "transfer") {
        pr.from = f.from || (s.accounts[0] || ({} as any)).name;
        pr.to = f.to || (s.wallets[0] || ({} as any)).name;
      } else {
        pr.account = f.account || (s.accounts[0] || ({} as any)).name;
      }
      pr.currency = curOf(s, pr.wallet || pr.account || pr.from);
      if (mode === "recurring") {
        pr.freq = f.freq || "monthly";
        if (pr.freq === "weekly") pr.day = parseInt(f.day) || 1;
        else if (pr.freq === "monthly")
          pr.day = Math.min(31, Math.max(1, parseInt(f.day) || 1));
        pr.lastRun = null;
        pr.created = TODAY;
      }
      set((st) => ({ presets: [...st.presets, pr], qView: "hub" }));
      persist();
      processRecurring();
    },

    delPreset: (id) => {
      set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }));
      persist();
    },

    quickLog: (id) => {
      const s = get();
      const pr = s.presets.find((p) => p.id === id);
      if (!pr) return;
      // One-tap logging obeys the same native overdraft guard as the full form.
      const payer = pr.kind === "expense" ? pr.wallet || (s.wallets[0] || ({} as any)).name : pr.kind === "transfer" ? pr.from : null;
      if (payer && pr.amount > balOf(s, payer) + 1e-9)
        return toastMsg("Saldo " + payer + " tidak cukup · ada " + fmtIn(balOf(s, payer), curOf(s, payer)));
      const today = TODAY;
      set((st) => {
        const n: Partial<LedgerState> = {};
        if (pr.kind === "expense") {
          const wal = pr.wallet || (st.wallets[0] || ({} as any)).name;
          n.expenses = [{ name: pr.label, cat: pr.cat || "daily", amount: pr.amount, wallet: wal, date: today, currency: pr.currency || curOf(st, wal) }, ...st.expenses];
          n.wallets = st.wallets.map((w) => (w.name === wal ? { ...w, bal: w.bal - pr.amount } : w));
        } else if (pr.kind === "transfer") {
          const from = pr.from;
          const to = pr.to;
          const amt = pr.amount;
          if (from && to && from !== to && amt > 0) {
            const recv = recvIn(amt, curOf(st, from), curOf(st, to), currentRate());
            n.accounts = st.accounts.map((a) => (a.name === from ? { ...a, bal: a.bal - amt } : a.name === to ? { ...a, bal: a.bal + recv } : a));
            n.wallets = st.wallets.map((w) => (w.name === from ? { ...w, bal: w.bal - amt } : w.name === to ? { ...w, bal: w.bal + recv } : w));
            n.capital = st.capital.map((c) => (c.name === from ? { ...c, bal: c.bal - amt } : c.name === to ? { ...c, bal: c.bal + recv } : c));
          }
        } else {
          const acct = pr.account || (st.accounts[0] || ({} as any)).name;
          n.incomes = [{ name: pr.label, account: acct, amount: pr.amount, date: today, currency: pr.currency || curOf(st, acct) }, ...st.incomes];
          n.accounts = st.accounts.map((a) => (a.name === acct ? { ...a, bal: a.bal + pr.amount } : a));
        }
        n.modal = null;
        return n as any;
      });
      persist();
      const amtLabel = fmtIn(pr.amount, pr.currency || "USD");
      const msg =
        pr.kind === "transfer"
          ? "Transferred " + amtLabel + " · " + pr.from + " → " + pr.to
          : (pr.kind === "expense" ? "Logged −" : "Logged +") + amtLabel + " · " + pr.label;
      toastMsg(msg);
    },

    processRecurring,

    onLockInput: (v) => set({ lockInput: v, lockErr: false }),
    tryUnlock: () => {
      const s = get();
      if (s.lockInput === s.pfPass) set({ pfUnlocked: true, lockInput: "", lockErr: false });
      else set({ lockErr: true });
    },
    lockNow: () => set({ pfUnlocked: false, lockInput: "" }),
    setLock: (pass, bg) => {
      // An empty passcode would lock the section out of reach — keep the old one.
      save({ pfPass: pass.trim() || get().pfPass, pfBg: bg.trim() });
      toastMsg("Kunci portfolio disimpan");
    },

    openPlan: () => open("plan"),
    openOrder: () => open("order"),
    closeOrder: (id, fee = 0) => {
      const s = get();
      const o = s.plans.find((p) => p.id === id);
      if (!o) return;
      const today = TODAY;
      set((st) => {
        const n: any = { ...st };
        const pos = st.positions.find((p) => p.sym === o.asset);
        const price = o.price || o.entry;
        if (pos) {
          const qty = Math.min(o.qty || 0, pos.qty);
          // Commission comes out of the cash that lands and out of the realized
          // number, exactly as it does on a manual sell.
          const proceeds = qty * price - fee;
          const realized = qty * (price - pos.avg) - fee;
          const remain = pos.qty - qty;
          const dest = o.src || (st.capital[0] || ({} as any)).name;
          n.positions =
            remain > 1e-9
              ? st.positions.map((p) => (p.sym === pos.sym ? { ...p, qty: remain, cur: price } : p))
              : st.positions.filter((p) => p.sym !== pos.sym);
          const destCur = curOf(st, dest);
          n.capital = st.capital.map((c) => (c.name === dest ? { ...c, bal: c.bal + inCur(proceeds, destCur) } : c));
          // Same economics as a sell, so the same cost-basis bookkeeping applies.
          const pfCostUsd = st.positions.reduce((a, p) => a + p.avg * p.qty, 0);
          const pfAvgRate = pfCostUsd > 1e-9 ? (st.pfCostIdr || 0) / pfCostUsd : currentRate();
          n.pfCostIdr = (st.pfCostIdr || 0) - qty * pos.avg * pfAvgRate;
          if (destCur === "USD") n.fxCostIdr = (st.fxCostIdr || 0) + proceeds * currentRate();
          n.journal = [
            { date: today, sym: pos.sym, side: o.side || "Long", entry: pos.avg, exit: price, qty, market: pos.market, opened: pos.opened, fee, pnl: realized, result: realized >= 0 ? "WIN" : "LOSS", note: "Closed order " + pos.sym + " → " + dest },
            ...st.journal,
          ];
        }
        n.plans = st.plans.map((p) => (p.id === id ? { ...p, status: "closed" } : p));
        return n;
      });
      persist();
      toastMsg("Order closed");
    },
    openCloseOrder: (id) => set({ modal: "closeorder", form: { planId: id } }),
    openPlanEval: (id) => {
      const s = get();
      const pl = s.plans.find((p) => p.id === id);
      set({ modal: "planeval", form: { planId: id, price: pxField(s, pl ? pl.price : 0, pl?.market) } });
    },
    cancelPlan: (id) => {
      set((s) => ({ plans: s.plans.map((p) => (p.id === id ? { ...p, status: "cancelled" } : p)) }));
      persist();
      toastMsg("Plan cancelled");
    },
    delPlan: (id) => {
      set((s) => ({ plans: s.plans.filter((p) => p.id !== id) }));
      persist();
      toastMsg("Plan deleted");
    },
    setPlanFilter: (id) => set({ planFilter: id }),

    openInvest: () => open("invest"),
    openSell: () => open("sell"),
    openPosPrice: (sym) => {
      const s = get();
      const p = s.positions.find((x) => x.sym === sym);
      set({ modal: "posprice", form: { posSym: sym, price: pxField(s, p ? p.cur : 0, p?.market) } });
    },
    openBookEdit: () => set({ modal: "book", form: {} }),

    primary: () => {
      const s = get();
      if (s.section === "cash") return open("transfer");
      if (s.section === "portfolio") return open("invest");
      get().openQuick();
    },

    submit: () => {
      const s = get();
      const t = s.modal;
      const f = s.form;
      const today = TODAY;
      const fmt = makeFormat(dispCur(s));
      const toUsd = fmt.toUsd;

      /** Which exchange this form is about — crypto has none. */
      const formMkt = (f.type === "crypto" ? "US" : f.market) || "US";
      /**
       * Read a *share price* into the USD base. IDX names are quoted in rupiah
       * on the exchange whatever currency the app happens to be displaying, so
       * they convert from IDR rather than going through the display currency.
       */
      const px = (v: any, market?: string) =>
        market === "IDX" ? nat(v) / currentRate() : toUsd(v);
      const mktOfPos = (sym?: string) => s.positions.find((p) => p.sym === sym)?.market;

      /**
       * What this leg costs in commission. A capital account that knows its
       * venue prices its own fee, so the form never asks; a typed value always
       * wins, which is both the override and the answer for venue-less capital.
       */
      const feeOf = (side: "buy" | "sell", notional: number, capital?: string) => {
        const typed = (f.fee ?? "").toString().trim();
        if (typed !== "") return Math.max(0, toUsd(f.fee));
        return feeFor(brokerOf(s, capital), side, notional, currentRate());
      };

      // Closing an order is the same action the card's button always ran — the
      // modal only exists to settle the fee, so hand it straight over.
      if (t === "closeorder") {
        const o = s.plans.find((p) => p.id === f.planId);
        const pos = s.positions.find((p) => p.sym === o?.asset);
        const price = (o && (o.price || o.entry)) || 0;
        const qty = Math.min((o && o.qty) || 0, pos ? pos.qty : 0);
        set({ modal: null });
        return get().closeOrder(f.planId, feeOf("sell", qty * price, (pos && pos.src) || (o && o.src)));
      }

      // --- validations that block submit ---
      // Cash guards compare native amounts against the holder's native balance —
      // never a converted figure, so rounding can't create or hide an overdraft.
      if (t === "expense") {
        const wal = f.wallet || (s.wallets[0] || ({} as any)).name;
        const amt = nat(f.amount);
        const wc = curOf(s, wal);
        if (!(amt > 0)) return toastMsg("Masukkan jumlah pengeluaran");
        if (amt > balOf(s, wal) + 1e-9)
          return toastMsg("Saldo " + wal + " tidak cukup · ada " + fmtIn(balOf(s, wal), wc));
      }
      if (t === "transfer") {
        const send = nat(f.amount);
        const fc = curOf(s, f.from);
        if (!f.from || !f.to || f.from === f.to) return toastMsg("Pilih dua tempat yang berbeda");
        if (!(send > 0)) return toastMsg("Masukkan jumlah transfer");
        if (send > balOf(s, f.from) + 1e-9)
          return toastMsg("Saldo " + f.from + " tidak cukup · ada " + fmtIn(balOf(s, f.from), fc));
      }
      if (t === "place" && f.idx != null) {
        const arr: any[] = (s as any)[arrKey(f.placeKind)] || [];
        const cur0 = arr[f.idx];
        const want = (f.placeCur as Cur) || (cur0 && cur0.currency) || "USD";
        // Currency is part of every stored amount — changing it would silently
        // reinterpret history, so it locks once the holder has been used.
        if (cur0 && want !== (cur0.currency || "USD") && (holderUsed(s, cur0.name) || Math.abs(cur0.bal) > 1e-9))
          return toastMsg("Currency terkunci — " + cur0.name + " sudah punya transaksi/saldo");
      }
      if (t === "invest") {
        const price = px(f.price, formMkt);
        const amount = toUsd(f.amount);
        const srcCur = curOf(s, f.src);
        const bal = balOf(s, f.src);
        if (!(price > 0) || !(amount > 0)) return toastMsg("Enter buy price and amount");
        if (inCur(amount + feeOf("buy", amount, f.src), srcCur) > bal + 1e-9) return toastMsg("Not enough in " + f.src + " · have " + fmtIn(bal, srcCur));
      }
      if (t === "order") {
        const src = f.src;
        const amount = toUsd(f.amount);
        const entry = px(f.entry, formMkt);
        const tp = px(f.tp, formMkt);
        const sl = px(f.sl, formMkt);
        const bal = balOf(s, f.src);
        const asset = (f.asset || "").trim();
        const thesis = (f.thesis || "").trim();
        const long = (f.side || "Long") !== "Short";
        if (!src) return toastMsg("Pick a fund to pay from");
        if (!asset) return toastMsg("Enter the asset");
        if (!(entry > 0)) return toastMsg("Enter a valid entry price");
        if (!(tp > 0)) return toastMsg("Enter a take-profit price");
        if (!(sl > 0)) return toastMsg("Enter a stop-loss price");
        if (!(amount > 0)) return toastMsg("Enter how much to commit");
        if (!thesis) return toastMsg("Write your thesis — the reason to revisit later");
        if (long && !(tp > entry && sl < entry)) return toastMsg("Long: TP must be above entry, SL below");
        if (!long && !(tp < entry && sl > entry)) return toastMsg("Short: TP must be below entry, SL above");
        if (inCur(amount + feeOf("buy", amount, src), curOf(s, src)) > bal + 1e-9) return toastMsg("Not enough in " + f.src + " · have " + fmtIn(bal, curOf(s, src)));
      }
      if (t === "sell") {
        const pos = s.positions.find((p) => p.sym === f.posSym);
        const price = px(f.price, pos?.market);
        const qty = f.sellAll ? (pos ? pos.qty : 0) : parseFloat(f.qty) || 0;
        if (!pos) return toastMsg("Pick a position");
        if (!(price > 0)) return toastMsg("Enter sell price");
        if (qty <= 0 || qty > pos.qty + 1e-9) return toastMsg("Max sellable is " + pos.qty + " " + pos.sym);
      }
      if (t === "note" && !(f.title || "").trim()) return toastMsg("Tulis judul catatannya");

      set((st) => {
        const n: any = { ...st };
        if (t === "expense") {
          // Amount is entered in the wallet's native currency — stored as-is.
          const wal = f.wallet || (st.wallets[0] || ({} as any)).name;
          const wc = curOf(st, wal);
          const amt = nat(f.amount);
          n.expenses = [{ name: f.name || "Expense", cat: f.cat || "daily", amount: amt, wallet: wal, date: today, currency: wc }, ...st.expenses];
          n.wallets = st.wallets.map((w) => (w.name === wal ? { ...w, bal: w.bal - amt } : w));
          if (wc === "USD") n.fxCostIdr = (st.fxCostIdr || 0) - amt * cashRate(st); // dispose USD at cost
        } else if (t === "goal") {
          // No holder — a goal is denominated in the currency you're viewing.
          n.goals = [...st.goals, { name: f.name || "Goal", saved: nat(f.saved), target: nat(f.target) || 1000, date: today, currency: dispCur(st) }];
        } else if (t === "income") {
          const acct = f.account || (st.accounts[0] || ({} as any)).name;
          const ac = curOf(st, acct);
          const amt = nat(f.amount);
          n.incomes = [{ name: f.name || "Income", account: acct, amount: amt, date: today, currency: ac }, ...st.incomes];
          n.accounts = st.accounts.map((a) => (a.name === acct ? { ...a, bal: a.bal + amt } : a));
          if (ac === "USD") n.fxCostIdr = (st.fxCostIdr || 0) + amt * currentRate(); // acquire USD at spot
        } else if (t === "transfer") {
          // Send is native in `from`'s currency. Cross-currency: the receiving
          // side uses the entered receive amount (captures the real rate/spread),
          // else the current mid-rate conversion. Realized FX = value in − out.
          const send = nat(f.amount);
          const fc = curOf(st, f.from), tc = curOf(st, f.to);
          const cross = fc !== tc;
          const recv = cross ? (nat(f.recvAmount) || recvIn(send, fc, tc, currentRate())) : send;
          if (f.from && f.to && f.from !== f.to && send > 0) {
            n.accounts = st.accounts.map((a) => (a.name === f.from ? { ...a, bal: a.bal - send } : a.name === f.to ? { ...a, bal: a.bal + recv } : a));
            n.wallets = st.wallets.map((w) => (w.name === f.from ? { ...w, bal: w.bal - send } : w.name === f.to ? { ...w, bal: w.bal + recv } : w));
            n.capital = st.capital.map((c) => (c.name === f.from ? { ...c, bal: c.bal - send } : c.name === f.to ? { ...c, bal: c.bal + recv } : c));
            if (cross) {
              const realized = toFunctional(recv, tc, currentRate()) - toFunctional(send, fc, currentRate());
              n.realizedFxIdr = (st.realizedFxIdr || 0) + realized;
              // Cost basis of USD cash: IDR→USD adds the IDR paid; USD→IDR releases at cost.
              if (fc === "IDR" && tc === "USD") n.fxCostIdr = (st.fxCostIdr || 0) + send;
              else if (fc === "USD" && tc === "IDR") n.fxCostIdr = (st.fxCostIdr || 0) - send * cashRate(st);
            }
          }
        } else if (t === "place") {
          const nm = (f.name || "").trim() || (f.placeKind === "account" ? "Vault" : f.placeKind === "capital" ? "Capital" : "Wallet");
          const pcur: Cur = (f.placeCur as Cur) || dispCur(st); // new holders: picked currency, else the view currency
          const key = arrKey(f.placeKind);
          const prev = f.idx != null ? ((st as any)[key][f.idx] || {}) : null;
          if (f.placeKind === "account") {
            n.accounts = f.idx != null ? st.accounts.map((a, i) => (i === f.idx ? { ...a, name: nm, currency: pcur } : a)) : [...st.accounts, { name: nm, bal: 0, currency: pcur }];
          } else if (f.placeKind === "capital") {
            const broker = f.broker || undefined;
            n.capital = f.idx != null ? st.capital.map((c, i) => (i === f.idx ? { ...c, name: nm, currency: pcur, broker } : c)) : [...st.capital, { name: nm, bal: 0, currency: pcur, broker }];
          } else {
            const badge = nm.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "W";
            if (f.idx != null) {
              n.wallets = st.wallets.map((w, i) => (i === f.idx ? { ...w, name: nm, badge, currency: pcur } : w));
            } else {
              const tags = ["t-st", "t-et", "t-cr"];
              n.wallets = [...st.wallets, { name: nm, bal: 0, tag: tags[st.wallets.length % 3], badge, currency: pcur }];
            }
          }
          // A rename must carry its history with it, or transactions orphan.
          if (prev && prev.name && prev.name !== nm) Object.assign(n, renameRefs(st, prev.name, nm));
        } else if (t === "plan") {
          const entry = toUsd(f.entry);
          const tp = toUsd(f.tp);
          const sl = toUsd(f.sl);
          const price = toUsd(f.price);
          const np: any = { id: "pl" + Date.now(), asset: (f.asset || "ASSET").toUpperCase(), side: f.side || "Long", thesis: (f.thesis || "").trim(), entry, tp, sl, ref: price, price, status: "waiting", created: today };
          np.status = evalStatus(np);
          n.plans = [np, ...st.plans];
        } else if (t === "order") {
          const src = f.src;
          const amount = toUsd(f.amount);
          const entry = px(f.entry, formMkt);
          const tp = px(f.tp, formMkt);
          const sl = px(f.sl, formMkt);
          const sym = (f.asset || "").toUpperCase();
          const type = f.type || "crypto";
          const side = f.side || "Long";
          const qty = amount / entry;
          // Commission buys no units, it just makes each one cost more — so it
          // rides on top of the amount and lands in the cost basis, where the
          // eventual sell will subtract it from realized PnL on its own.
          const cost = amount + feeOf("buy", amount, src);
          const ex = st.positions.find((p) => p.sym === sym);
          if (ex) {
            const nq = ex.qty + qty;
            const na = (ex.avg * ex.qty + cost) / nq;
            n.positions = st.positions.map((p) => (p.sym === sym ? { ...p, qty: nq, avg: na, cur: entry, src: p.src || src } : p));
          } else {
            n.positions = [...st.positions, { sym, type, market: formMkt, qty, avg: cost / qty, cur: entry, opened: today, src }];
          }
          const srcCur = curOf(st, src);
          n.capital = st.capital.map((c) => (c.name === src ? { ...c, bal: c.bal - inCur(cost, srcCur) } : c));
          // The portfolio takes on the rupiah that funded it — USD cash hands over
          // its cost basis, rupiah is already rupiah.
          const moved = srcCur === "USD" ? cost * cashRate(st) : inCur(cost, srcCur);
          if (srcCur === "USD") n.fxCostIdr = (st.fxCostIdr || 0) - moved;
          n.pfCostIdr = (st.pfCostIdr || 0) + moved;
          const np: any = { id: "or" + Date.now(), asset: sym, type, market: formMkt, side, thesis: (f.thesis || "").trim(), entry, tp, sl, ref: entry, price: entry, amount, qty, src, status: "active", created: today };
          np.status = evalStatus(np);
          n.plans = [np, ...st.plans];
        } else if (t === "planeval") {
          const price = px(f.price, st.plans.find((p) => p.id === f.planId)?.market);
          n.plans = st.plans.map((p) => {
            if (p.id !== f.planId) return p;
            if (["hit", "stopped", "cancelled"].includes(p.status)) return { ...p, price };
            const up: any = { ...p, price };
            up.status = evalStatus(up);
            return up;
          });
        } else if (t === "invest") {
          const price = px(f.price, formMkt);
          const amount = toUsd(f.amount);
          const src = f.src;
          const sym = (f.asset || "NEW").toUpperCase();
          const type = f.type || "crypto";
          const addQty = amount / price;
          // Same rule as an order: the fee costs cash and raises the average,
          // it doesn't buy units.
          const cost = amount + feeOf("buy", amount, src);
          const ex = st.positions.find((p) => p.sym === sym);
          if (ex) {
            const newQty = ex.qty + addQty;
            const newAvg = (ex.avg * ex.qty + cost) / newQty;
            n.positions = st.positions.map((p) => (p.sym === sym ? { ...p, qty: newQty, avg: newAvg, cur: price, src: p.src || src } : p));
          } else {
            n.positions = [...st.positions, { sym, type, market: formMkt, qty: addQty, avg: cost / addQty, cur: price, opened: today, src }];
          }
          const srcCur = curOf(st, src);
          n.capital = st.capital.map((c) => (c.name === src ? { ...c, bal: c.bal - inCur(cost, srcCur) } : c));
          const moved = srcCur === "USD" ? cost * cashRate(st) : inCur(cost, srcCur);
          if (srcCur === "USD") n.fxCostIdr = (st.fxCostIdr || 0) - moved;
          n.pfCostIdr = (st.pfCostIdr || 0) + moved;
        } else if (t === "sell") {
          const pos = st.positions.find((p) => p.sym === f.posSym)!;
          const price = px(f.price, pos.market);
          const qty = f.sellAll ? pos.qty : parseFloat(f.qty) || 0;
          // Commission comes out of the cash that lands and out of the realized
          // number — a trade that only wins before costs didn't win.
          const fee = feeOf("sell", qty * price, pos.src);
          const proceeds = qty * price - fee;
          const realized = qty * (price - pos.avg) - fee;
          const remain = pos.qty - qty;
          const dest = f.dest;
          n.positions = remain > 1e-9 ? st.positions.map((p) => (p.sym === pos.sym ? { ...p, qty: remain, cur: price } : p)) : st.positions.filter((p) => p.sym !== pos.sym);
          const destCur = curOf(st, dest);
          n.capital = st.capital.map((c) => (c.name === dest ? { ...c, bal: c.bal + inCur(proceeds, destCur) } : c));
          // Release the sold cost from the portfolio; proceeds become USD cash at spot.
          const pfCostUsd = st.positions.reduce((a, p) => a + p.avg * p.qty, 0);
          const pfAvgRate = pfCostUsd > 1e-9 ? (st.pfCostIdr || 0) / pfCostUsd : currentRate();
          n.pfCostIdr = (st.pfCostIdr || 0) - qty * pos.avg * pfAvgRate;
          if (destCur === "USD") n.fxCostIdr = (st.fxCostIdr || 0) + proceeds * currentRate();
          n.journal = [{ date: today, sym: pos.sym, side: "Long", entry: pos.avg, exit: price, qty, market: pos.market, opened: pos.opened, fee, pnl: realized, result: realized >= 0 ? "WIN" : "LOSS", note: "Sold " + +qty.toFixed(6) + " " + pos.sym + " → " + dest }, ...st.journal];
        } else if (t === "posprice") {
          // Retagging the exchange here is how a name saved under the wrong venue
          // gets unstuck — a bare BBRI never quotes, BBRI.JK does — so persist the
          // pick alongside the price instead of only using it to read the input.
          const mkt = f.mktPinned ? f.market : mktOfPos(f.posSym);
          const price = px(f.price, mkt);
          n.positions = st.positions.map((p) => (p.sym === f.posSym ? { ...p, cur: price, market: mkt } : p));
        } else if (t === "note") {
          // Tags are kept only for names actually held: a symbol you don't own
          // has nothing to measure the note against, and the panel would print a
          // dash forever. `date` is the baseline, so it is editable but never blank.
          const owned = new Set(st.positions.map((p) => (p.sym || "").toUpperCase()));
          const syms = String(f.syms || "")
            .split(/[,\s]+/)
            .map((x: string) => x.trim().toUpperCase())
            .filter((x: string, i: number, a: string[]) => x && owned.has(x) && a.indexOf(x) === i);
          const note: MacroNote = {
            id: f.id || "mn" + Date.now(),
            date: (f.date || "").trim() || TODAY,
            title: (f.title || "").trim(),
            source: (f.source || "").trim() || undefined,
            read: (f.read || "neutral") as MacroNote["read"],
            body: (f.body || "").trim() || undefined,
            syms,
          };
          n.mlog = f.id
            ? (st.mlog || []).map((x) => (x.id === f.id ? note : x))
            : [note, ...(st.mlog || [])];
        }
        n.modal = null;
        return n;
      });
      persist();

      if (t === "transfer") {
        const send = nat(f.amount);
        if (f.from && f.to && f.from !== f.to && send > 0) {
          const fc = curOf(s, f.from), tc = curOf(s, f.to);
          let msg = "Transferred " + fmtIn(send, fc) + " · " + f.from + " → " + f.to;
          if (fc !== tc) {
            const recv = nat(f.recvAmount) || recvIn(send, fc, tc, currentRate());
            const realized = toFunctional(recv, tc, currentRate()) - toFunctional(send, fc, currentRate());
            msg += " · got " + fmtIn(recv, tc) + " · FX " + (realized >= 0 ? "+" : "−") + fmtIn(Math.abs(realized), "IDR");
          }
          toastMsg(msg);
        }
      }
      if (t === "place") toastMsg((f.idx != null ? "Updated " : "Added ") + ((f.name || "").trim() || (f.placeKind === "account" ? "account" : "wallet")));
      if (t === "plan") toastMsg("Trade plan added");
      if (t === "order") toastMsg("Order placed · " + fmt.fmt(toUsd(f.amount)) + " in " + (f.asset || "").toUpperCase());
      if (t === "invest") toastMsg("Invested " + fmt.fmt(toUsd(f.amount)) + " in " + (f.asset || "").toUpperCase());
      if (t === "sell") toastMsg("Sold " + f.posSym);
      if (t === "posprice") toastMsg("Price updated");
      if (t === "note") toastMsg(f.id ? "Catatan diperbarui" : "Catatan disimpan");
      if (t === "planeval") toastMsg("Price updated");
    },

    toastMsg,

    // Not persisted, so no storage write per slider tick — see `PERSIST_KEYS`.
    setShock: (patch) => set({ shock: { ...get().shock, ...patch } }),

    resetShock: () => set({ shock: { crypto: 0, equities: 0, rate: 0 } }),

    openNote: (id) => {
      const n = (get().mlog || []).find((x) => x.id === id);
      set({
        modal: "note",
        form: n
          ? { id: n.id, title: n.title, date: n.date, read: n.read, source: n.source || "", body: n.body || "", syms: (n.syms || []).join(", ") }
          : { date: TODAY, read: "neutral", syms: "" },
      });
    },

    delNote: (id) => {
      save({ mlog: (get().mlog || []).filter((n) => n.id !== id) });
      toastMsg("Catatan dihapus");
    },

    setPriceStatus: (status) => set({ priceStatus: status }),

    setMacroStatus: (status) => set({ macroStatus: status }),

    /** Driver levels + note baselines. Runtime only — none of it is the ledger. */
    applyMacro: (quotes, moves) =>
      set((s) => ({
        macroQuotes: { ...s.macroQuotes, ...quotes },
        macroMoves: { ...s.macroMoves, ...moves },
        macroStatus: "live",
        macroAt: Object.keys(quotes).length || Object.keys(moves).length ? Date.now() : s.macroAt,
      })),

    setFxStatus: (status) => set({ fxStatus: status }),

    /** A fresh USD/IDR quote. Recorded, but the valuation rate stays frozen —
     *  net worth must not twitch every 5 minutes. Adopt it deliberately. */
    applyFxQuote: (rate, changePct) => {
      if (!(rate > 0)) return;
      set({ fxLive: rate, fxChangePct: changePct, fxStatus: "live", fxAt: Date.now() });
    },

    /** Adopt the live quote as today's valuation rate + append it to history. */
    adoptFxRate: () => {
      const s = get();
      const live = s.fxLive;
      if (!live || !(live > 0)) return toastMsg("Belum ada kurs live");
      const rates = [...(s.rates || [])].filter((r) => r.date !== TODAY);
      rates.push({ date: TODAY, idrPerUsd: live });
      rates.sort((a, b) => a.date.localeCompare(b.date));
      syncRates(live, rates);
      save({ fxRate: live, rates });
      toastMsg("Kurs valuasi → " + fmtRate(live) + " / $1");
    },

    applyPrices: (map) => {
      set((s) => {
        // "Live" has to mean something actually arrived. A poll that returns an
        // empty map (every held name mis-tagged, or the venue down) used to still
        // stamp a fresh timestamp on the badge — a price frozen for hours read as
        // a market that hadn't moved.
        const got = Object.keys(map).length;
        const missing = s.positions
          .filter((p) => p.sym && !map[p.sym])
          .map((p) => p.sym);
        return {
          positions: s.positions.map((p) =>
            map[p.sym] ? { ...p, cur: map[p.sym].price } : p
          ),
          livePrices: { ...s.livePrices, ...map },
          // The round-trip worked, so the feed itself is up — `priceMissing`
          // carries which names it had nothing for. Only a thrown request marks
          // the feed offline (see usePriceFeed's catch).
          priceStatus: "live",
          pricesAt: got ? Date.now() : s.pricesAt,
          priceMissing: missing,
        };
      });
      persist();
    },

    editGoal: (index, patch) => {
      set((s) => ({ goals: s.goals.map((g, i) => (i === index ? { ...g, ...patch } : g)) }));
      persist();
      toastMsg("Goal updated");
    },
  };
});
