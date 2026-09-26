import { NextResponse } from "next/server";
import { yahooPrice, yahooSince } from "@/lib/quote";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The Macro tab's two outside facts: what the drivers are doing now, and what a
 * logged note's symbols have done since it was written.
 *
 * Both are slow-moving, so they're cached for 15 minutes in module memory —
 * an index level doesn't need the 15-second cadence the positions feed runs at,
 * and the log's baselines change once a day at most.
 */
const TTL = 15 * 60 * 1000;

interface Hit {
  at: number;
  value: any;
}
const cache = new Map<string, Hit>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function POST(req: Request) {
  let tickers: string[] = [];
  let notes: { sym: string; ticker: string; date: string }[] = [];
  try {
    const body = await req.json();
    tickers = Array.isArray(body.tickers) ? body.tickers.slice(0, 12) : [];
    notes = Array.isArray(body.notes) ? body.notes.slice(0, 40) : [];
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const quotes: Record<string, { price: number; changePct: number | null; currency?: string }> = {};
  const moves: Record<string, number | null> = {};

  await Promise.all([
    ...tickers.map(async (t) => {
      try {
        const q = await cached("q:" + t, () => yahooPrice(t));
        if (q) quotes[t] = { price: q.price, changePct: q.changePct, currency: q.currency };
      } catch {
        // A driver that didn't answer draws without a move. Nothing is faked in.
      }
    }),
    ...notes.map(async (n) => {
      if (!n || !n.sym || !n.date) return;
      const key = n.sym.toUpperCase() + "@" + n.date;
      try {
        moves[key] = await cached("s:" + (n.ticker || n.sym) + ":" + n.date, () =>
          yahooSince(n.ticker || n.sym, n.date)
        );
      } catch {
        moves[key] = null;
      }
    }),
  ]);

  return NextResponse.json({ quotes, moves, ts: Date.now() });
}
