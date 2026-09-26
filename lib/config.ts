import type { FxRate, ThemeColors, ThemeId } from "./types";

/** Fallback USD→IDR rate (IDR per 1 USD), used until the store loads its own. */
export const RATE = 16250;

// The rate registry. `format`/`derive` are pure modules re-run on every render,
// so instead of threading a rate through every call site the store pushes its
// valuation rate + dated history in here once (syncRates) and they read it.
let _spot = RATE;
let _history: FxRate[] = [];

/** Point the rate helpers at the store's valuation rate and dated history. */
export function syncRates(spot?: number, history?: FxRate[]): void {
  if (spot && isFinite(spot) && spot > 0) _spot = spot;
  if (Array.isArray(history))
    _history = history
      .filter((r) => r && r.date && r.idrPerUsd > 0)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
}

/** The valuation spot rate (IDR per USD) — frozen per session until adopted. */
export function currentRate(): number {
  return _spot;
}

/** The rate in effect on `date`: the latest history entry not after it. Flows
 *  (income/expense) are measured at transaction date; balances use spot. */
export function rateAsOf(date?: string): number {
  if (!date || !_history.length) return _spot;
  let r = 0;
  for (const e of _history) {
    if (e.date <= date) r = e.idrPerUsd;
    else break;
  }
  // Before the history starts, the earliest known rate is the best estimate.
  return r || _history[0].idrPerUsd || _spot;
}

/** The dated rate history, ascending. */
export function rateHistory(): FxRate[] {
  return _history;
}

/** The app treats this as "today" for date math (recurring, next-run, etc.). */
export const TODAY = "2026-07-12";

export const STORAGE_KEY = "ledgerPrefs.v1";

export const THEMES: Record<ThemeId, ThemeColors> = {
  dark: {
    bg: "#080a0e",
    surf: "#12161d",
    surf2: "#161b24",
    brd: "#1c212c",
    tx: "#e7eaf0",
    mut: "#7a8496",
    acc: "#c9ff3d",
    acctx: "#0b0e13",
  },
  light: {
    bg: "#f4f6fa",
    surf: "#ffffff",
    surf2: "#eef1f6",
    brd: "#e0e5ec",
    tx: "#1b2330",
    mut: "#69727f",
    acc: "#17915a",
    acctx: "#ffffff",
  },
  midnight: {
    bg: "#0a1020",
    surf: "#111a30",
    surf2: "#16223d",
    brd: "#243352",
    tx: "#dfe9f5",
    mut: "#7c8ea8",
    acc: "#39d8ff",
    acctx: "#04233f",
  },
};

/** [token, Indonesian label] pairs shown in the appearance drawer. */
export const TOKEN_LABELS: [keyof ThemeColors, string][] = [
  ["bg", "Latar"],
  ["surf", "Permukaan"],
  ["surf2", "Permukaan 2"],
  ["brd", "Garis tepi"],
  ["tx", "Teks"],
  ["mut", "Teks redup"],
  ["acc", "Aksen"],
  ["acctx", "Teks di aksen"],
];
