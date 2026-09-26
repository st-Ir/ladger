import { currentRate } from "./config";
import type { Cur } from "./types";

/** Digit grouping per currency: Rp16.250 (id-ID) vs $16,250 (en-US). */
function grp(n: number, cur: Cur, opts?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(cur === "IDR" ? "id-ID" : "en-US", opts);
}

/**
 * Parse a typed amount tolerantly — "16.250", "16,250", "16.250,75", "1250.75"
 * all land on the right number. Rule: with both separators the last one is the
 * decimal mark; with one kind, repeats or an exact 3-digit tail mean grouping.
 */
export function parseAmount(v: string | number): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const raw = String(v ?? "").trim();
  if (!raw) return 0;
  const neg = raw.startsWith("-");
  const s = raw.replace(/[^\d.,]/g, "");
  if (!s) return 0;
  const dots = s.split(".").length - 1;
  const coms = s.split(",").length - 1;
  let n: number;
  if (!dots && !coms) {
    n = parseFloat(s) || 0;
  } else {
    let dec = -1; // index of the decimal separator, -1 = none (all grouping)
    if (dots && coms) dec = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
    else {
      const sep = dots ? "." : ",";
      const at = s.lastIndexOf(sep);
      const tail = s.length - at - 1;
      if ((dots || coms) === 1 && tail !== 3 && tail > 0) dec = at;
    }
    n =
      dec < 0
        ? parseFloat(s.replace(/[.,]/g, "")) || 0
        : parseFloat(s.slice(0, dec).replace(/[.,]/g, "") + "." + s.slice(dec + 1).replace(/[.,]/g, "")) || 0;
  }
  return neg ? -n : n;
}

/** Round a converted amount to its currency's natural precision. Conversion
 *  results are rounded exactly once, here — never mid-calculation. */
export function roundIn(amount: number, cur: Cur): number {
  if (!isFinite(amount)) return 0;
  return cur === "IDR" ? Math.round(amount) : Math.round(amount * 100) / 100;
}

/** Parse a YYYY-MM-DD string into a local Date (avoids UTC off-by-one). */
export function parseDate(s: string): Date {
  const a = (s || "").split("-").map(Number);
  return new Date(a[0], (a[1] || 1) - 1, a[2] || 1);
}

export function fdate(s: string): string {
  return parseDate(s).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
  });
}

/** A currency-aware formatter bundle for the active currency. */
export interface Formatter {
  cur: Cur;
  /** Format a USD-base value, converting at spot. */
  fmt: (u: number) => string;
  fmt2: (u: number) => string;
  sfmt: (u: number) => string;
  /** Format a value already denominated in the display currency (no conversion). */
  fmtC: (v: number) => string;
  sfmtC: (v: number) => string;
  toUsd: (v: string | number) => number;
  curNum: (u: number) => number;
}

export function makeFormat(cur: Cur): Formatter {
  const rate = currentRate();

  const fmt = (u: number) => {
    if (cur === "IDR") return "Rp" + grp(Math.round(u * rate), "IDR");
    return "$" + grp(Math.round(u), "USD");
  };

  const fmt2 = (u: number) => {
    if (cur === "IDR") return "Rp" + grp(Math.round(u * rate), "IDR");
    const v =
      u < 100
        ? grp(u, "USD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : grp(Math.round(u), "USD");
    return "$" + v;
  };

  const sfmt = (u: number) => (u >= 0 ? "+" : "-") + fmt(Math.abs(u));

  const toUsd = (v: string | number) => {
    const n = parseAmount(v);
    return cur === "IDR" ? n / rate : n;
  };

  const curNum = (u: number) => (cur === "IDR" ? Math.round((u || 0) * rate) : u || 0);

  const fmtC = (v: number) => (cur === "IDR" ? "Rp" : "$") + grp(Math.round(v || 0), cur);
  const sfmtC = (v: number) => (v >= 0 ? "+" : "-") + fmtC(Math.abs(v));

  return { cur, fmt, fmt2, sfmt, fmtC, sfmtC, toUsd, curNum };
}

// --- Multi-currency helpers (native amounts + explicit rate) ---
// `rate` is always IDR per 1 USD. The functional currency is IDR.

/** Convert a native amount between currencies. */
export function convert(amount: number, from: Cur, to: Cur, rate: number): number {
  if (from === to) return amount;
  return from === "USD" ? amount * rate : amount / rate;
}

/** Convert a native amount into the functional currency (IDR). */
export function toFunctional(amount: number, cur: Cur, rate: number): number {
  return convert(amount, cur, "IDR", rate);
}

/** Format an amount already denominated in `cur`, in that currency's own units. */
export function fmtIn(amount: number, cur: Cur): string {
  if (cur === "IDR") return "Rp" + grp(Math.round(amount), "IDR");
  const a = Math.abs(amount);
  return "$" + grp(a > 0 && a < 100 ? roundIn(amount, "USD") : Math.round(amount), "USD", a > 0 && a < 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined);
}

/** A bare rate label, e.g. "Rp16.250". */
export function fmtRate(rate: number): string {
  return "Rp" + grp(Math.round(rate), "IDR");
}

/** Build an SVG path string for a sparkline / equity curve. */
export function spark(a: number[], w: number, h: number): string {
  const mn = Math.min(...a);
  const mx = Math.max(...a);
  const r = mx - mn || 1;
  const st = w / (a.length - 1);
  return a
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${(i * st).toFixed(1)} ${(
          h -
          ((v - mn) / r) * h
        ).toFixed(1)}`
    )
    .join(" ");
}
