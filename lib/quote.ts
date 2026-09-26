/**
 * Server-side venue lookups. Kept out of the route files so both `/api/prices`
 * and `/api/prices/resolve` ask the venue the exact same way.
 */

export interface VenueQuote {
  price: number;
  changePct: number | null;
  /** What the venue quotes in — IDX names come back in IDR, not USD. */
  currency: string;
}

export async function fetchJson(
  url: string,
  headers?: Record<string, string>,
  timeoutMs = 8000
): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal, headers });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Free, no-key quote via Yahoo Finance. Handles stocks (`AAPL`), IDX stocks
 * (`BBCA.JK`) and crypto (`BTC-USD`). Tries both Yahoo hosts for resilience.
 */
export async function yahooPrice(ticker: string): Promise<VenueQuote | null> {
  const path =
    "/v8/finance/chart/" +
    encodeURIComponent(ticker) +
    "?interval=1d&range=2d";
  const headers = { "User-Agent": "Mozilla/5.0" };
  let data: any = null;
  try {
    data = await fetchJson("https://query1.finance.yahoo.com" + path, headers);
  } catch {
    data = await fetchJson("https://query2.finance.yahoo.com" + path, headers);
  }
  const meta = data?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!isFinite(price) || price <= 0) return null;
  const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
  const changePct = isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : null;
  return { price, changePct, currency: String(meta?.currency || "USD").toUpperCase() };
}

/**
 * How a symbol has moved **since a date** — what the macro log measures a note
 * against. Same chart endpoint as `yahooPrice`, only asked for a window instead
 * of two days, with the range picked from the note's own age so an old entry
 * isn't silently measured from the start of a too-short series.
 *
 * Returns null when the venue has nothing that far back; the caller shows the
 * note without a number rather than inventing one.
 */
export async function yahooSince(ticker: string, since: string): Promise<number | null> {
  const days = Math.max(0, Math.round((Date.now() - Date.parse(since + "T00:00:00Z")) / 86400000));
  const range = days <= 28 ? "1mo" : days <= 88 ? "3mo" : days <= 180 ? "6mo" : days <= 365 ? "1y" : "2y";
  const path = "/v8/finance/chart/" + encodeURIComponent(ticker) + "?interval=1d&range=" + range;
  const headers = { "User-Agent": "Mozilla/5.0" };
  let data: any = null;
  try {
    data = await fetchJson("https://query1.finance.yahoo.com" + path, headers);
  } catch {
    data = await fetchJson("https://query2.finance.yahoo.com" + path, headers);
  }
  const res = data?.chart?.result?.[0];
  const ts: number[] = res?.timestamp || [];
  const close: (number | null)[] = res?.indicators?.quote?.[0]?.close || [];
  if (!ts.length || ts.length !== close.length) return null;
  const cut = Date.parse(since + "T00:00:00Z") / 1000;
  // The first session on or after the note's date — a note written on a Sunday
  // is measured from Monday's close, not from whatever preceded it.
  let base: number | null = null;
  for (let i = 0; i < ts.length; i++) {
    if (ts[i] >= cut && close[i] != null && (close[i] as number) > 0) {
      base = close[i] as number;
      break;
    }
  }
  let last: number | null = null;
  for (let i = close.length - 1; i >= 0; i--) {
    if (close[i] != null && (close[i] as number) > 0) {
      last = close[i] as number;
      break;
    }
  }
  if (!base || !last) return null;
  return ((last - base) / base) * 100;
}

/** Real-time stock/ETF quote via Finnhub (requires a free API key). */
export async function finnhubPrice(sym: string, key: string): Promise<VenueQuote | null> {
  const data = await fetchJson(
    "https://finnhub.io/api/v1/quote?symbol=" +
      encodeURIComponent(sym) +
      "&token=" +
      key
  );
  const price = Number(data.c);
  if (!isFinite(price) || price <= 0) return null;
  const changePct = data.dp == null ? null : Number(data.dp);
  return { price, changePct: changePct != null && isFinite(changePct) ? changePct : null, currency: "USD" };
}
