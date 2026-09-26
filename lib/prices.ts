import { driverTickers } from "./macro";
import type { LivePrice, MacroNote, Position } from "./types";

/** How often the portfolio polls for fresh prices (ms). */
export const PRICE_REFRESH_MS = Number(
  process.env.NEXT_PUBLIC_PRICE_REFRESH_MS || 15000
);

/** How often the Macro tab refreshes (ms). Index levels aren't a 15s question. */
export const MACRO_REFRESH_MS = Number(
  process.env.NEXT_PUBLIC_MACRO_REFRESH_MS || 900000
);

/** How often the USD/IDR quote refreshes (ms). FX moves far slower than assets. */
export const FX_REFRESH_MS = Number(
  process.env.NEXT_PUBLIC_FX_REFRESH_MS || 300000
);

export interface FxQuote {
  rate: number;
  changePct: number | null;
  ts: number;
}

/** Latest USD→IDR spot rate from our own API route. */
export async function fetchFxRate(): Promise<FxQuote> {
  const res = await fetch("/api/fx", { cache: "no-store" });
  if (!res.ok) throw new Error("fx HTTP " + res.status);
  return res.json();
}

/** Extra tickers to keep live in the top marquee even if not held. */
const TICKER_EXTRA_CRYPTO = ["SOL"];
const TICKER_EXTRA_STOCK: string[] = [];

/** Map an app position type to the price provider bucket. */
function bucketOf(type: string): "crypto" | "stock" {
  return type === "crypto" ? "crypto" : "stock";
}

/**
 * The ticker a venue actually knows this position by. IDX names need the `.JK`
 * suffix — a bare `BBCA` is a *different*, US-listed ETF on Yahoo, so we never
 * guess the suffix: the position has to say it trades on IDX.
 */
export function tickerOf(sym: string, market?: string): string {
  const s = sym.toUpperCase();
  return market === "IDX" && !s.includes(".") ? s + ".JK" : s;
}

export interface PriceRequest {
  crypto: string[];
  stock: string[];
}

export interface PriceResponse {
  prices: Record<string, LivePrice>;
  ts: number;
  errors?: string[];
}

/** Build the {crypto, stock} ticker lists to request for the given positions. */
export function symbolPlan(positions: Position[]): PriceRequest {
  const crypto = new Set<string>(TICKER_EXTRA_CRYPTO);
  const stock = new Set<string>(TICKER_EXTRA_STOCK);
  for (const p of positions) {
    if (!p.sym) continue;
    if (bucketOf(p.type) === "crypto") crypto.add(p.sym.toUpperCase());
    else stock.add(tickerOf(p.sym, p.market));
  }
  return { crypto: [...crypto], stock: [...stock] };
}

/**
 * Ask our own API route for the latest prices of the held (+ marquee) symbols.
 *
 * Two normalisations happen here so the rest of the app never has to care where
 * a quote came from: venue tickers are mapped back to the symbol the position is
 * stored under, and non-USD quotes are converted at `rate` (IDR per USD) into
 * the USD base every position is denominated in.
 */
export async function fetchLivePrices(
  positions: Position[],
  rate: number
): Promise<PriceResponse> {
  const body = symbolPlan(positions);
  const res = await fetch("/api/prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("prices HTTP " + res.status);
  const data: PriceResponse = await res.json();

  const bySym: Record<string, string> = {};
  for (const p of positions) {
    if (p.sym && bucketOf(p.type) !== "crypto")
      bySym[tickerOf(p.sym, p.market)] = p.sym.toUpperCase();
  }

  const prices: Record<string, LivePrice> = {};
  for (const [ticker, q] of Object.entries(data.prices || {})) {
    const usd = q.currency === "IDR" && rate > 0 ? q.price / rate : q.price;
    prices[bySym[ticker] || ticker] = { price: usd, changePct: q.changePct };
  }
  return { ...data, prices };
}

/** The ticker a venue knows a *held* symbol by — crypto quotes against USD. */
export function venueTicker(p: Position): string {
  const s = (p.sym || "").toUpperCase();
  return p.type === "crypto" ? (s.includes("-") ? s : s + "-USD") : tickerOf(s, p.market);
}

export interface MacroResponse {
  quotes: Record<string, LivePrice>;
  moves: Record<string, number | null>;
  ts: number;
}

/**
 * The Macro tab's outside data: driver levels, and the move since each note was
 * written. Driver quotes are **not** converted into the USD base the way
 * position prices are — an index level and a rate are read as themselves.
 */
function macroRequest(positions: Position[], notes: MacroNote[], fx: boolean) {
  const held = new Map(positions.map((p) => [(p.sym || "").toUpperCase(), p]));
  const seen = new Set<string>();
  const noteReqs: { sym: string; ticker: string; date: string }[] = [];
  for (const n of notes || []) {
    for (const raw of n.syms || []) {
      const sym = (raw || "").toUpperCase();
      const p = held.get(sym);
      // Only symbols still held are measurable — the rest keep the tag and lose
      // the number, which is the honest way to show a position you've closed.
      if (!p) continue;
      const key = sym + "@" + n.date;
      if (seen.has(key)) continue;
      seen.add(key);
      noteReqs.push({ sym, ticker: venueTicker(p), date: n.date });
    }
  }
  return { tickers: driverTickers(positions, fx), notes: noteReqs };
}

/**
 * Everything the tab would ask for, as one string.
 *
 * A note written just now has no baseline until something fetches it, and on a
 * 15-minute timer "just now" means up to a quarter of an hour of a bare dash —
 * which reads as *the venue had nothing*, not as *nobody has asked yet*. So the
 * feed watches this key and refetches when the ask changes: a new note, a new
 * tag, or a first position in an asset class that brings its driver with it.
 */
export function macroKey(positions: Position[], notes: MacroNote[], fx: boolean): string {
  const r = macroRequest(positions, notes, fx);
  return r.tickers.join(",") + "|" + r.notes.map((n) => n.ticker + "@" + n.date).join(",");
}

export async function fetchMacro(
  positions: Position[],
  notes: MacroNote[],
  fx: boolean
): Promise<MacroResponse> {
  const { tickers, notes: noteReqs } = macroRequest(positions, notes, fx);

  const res = await fetch("/api/macro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers, notes: noteReqs }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("macro HTTP " + res.status);
  return res.json();
}
