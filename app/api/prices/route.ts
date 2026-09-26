import { NextResponse } from "next/server";
import { finnhubPrice, yahooPrice, type VenueQuote } from "@/lib/quote";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function settleAll(
  syms: string[],
  fn: (s: string) => Promise<VenueQuote | null>,
  out: Record<string, VenueQuote>,
  errors: string[]
) {
  const results = await Promise.allSettled(syms.map((s) => fn(s)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) out[syms[i]] = r.value;
    // A resolved-but-empty result means the venue has no such instrument — just
    // as much a miss as a thrown error, and the one that used to pass silently
    // while the badge still claimed the feed was live.
    else if (r.status === "fulfilled") errors.push(syms[i] + ": no quote");
    else errors.push(syms[i] + ": " + (r.reason?.message || "failed"));
  });
}

export async function POST(req: Request) {
  let crypto: string[] = [];
  let stock: string[] = [];
  try {
    const body = await req.json();
    crypto = Array.isArray(body.crypto) ? body.crypto : [];
    stock = Array.isArray(body.stock) ? body.stock : [];
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const prices: Record<string, VenueQuote> = {};
  const errors: string[] = [];
  const key = process.env.FINNHUB_API_KEY;

  await Promise.all([
    // Crypto is always no-key via Yahoo (BTC-USD, ETH-USD, ...).
    settleAll(crypto, (s) => yahooPrice(s.toUpperCase() + "-USD"), prices, errors),
    // Stocks/ETFs: Finnhub if a key is configured, otherwise Yahoo. Suffixed
    // tickers (BBCA.JK) are non-US listings Finnhub's free tier doesn't carry,
    // so those always go to Yahoo regardless of the key.
    settleAll(
      stock,
      (s) => (key && !s.includes(".") ? finnhubPrice(s, key) : yahooPrice(s)),
      prices,
      errors
    ),
  ]);

  return NextResponse.json({
    prices,
    ts: Date.now(),
    errors: errors.length ? errors : undefined,
  });
}
