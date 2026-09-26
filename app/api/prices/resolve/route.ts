import { NextResponse } from "next/server";
import { yahooPrice } from "@/lib/quote";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Which venue actually lists a ticker.
 *
 * The exchange can't be inferred from the ticker text — `BBCA` is a US-listed
 * ETF while `BBCA.JK` is Bank Central Asia — so rather than guess from a
 * hardcoded list that goes stale, ask the venue for both and report what came
 * back. `BBRI` 404s and `BBRI.JK` quotes in IDR, which settles it.
 *
 * When both resolve the answer is genuinely ambiguous and the caller is told so
 * instead of being handed a coin flip.
 */
export async function GET(req: Request) {
  const sym = (new URL(req.url).searchParams.get("sym") || "")
    .trim()
    .toUpperCase()
    .replace(/\.[A-Z]+$/, "");
  if (!/^[A-Z0-9]{1,10}$/.test(sym))
    return NextResponse.json({ error: "bad symbol" }, { status: 400 });

  const [us, idx] = await Promise.all([
    yahooPrice(sym).catch(() => null),
    yahooPrice(sym + ".JK").catch(() => null),
  ]);

  const suggest = us && idx ? null : idx ? "IDX" : us ? "US" : null;
  return NextResponse.json({
    sym,
    us: us ? { currency: us.currency } : null,
    idx: idx ? { currency: idx.currency } : null,
    suggest,
    ambiguous: !!(us && idx),
  });
}
