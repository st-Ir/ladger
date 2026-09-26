import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Live USD→IDR spot rate (IDR per 1 USD) via Yahoo Finance's `IDR=X` pair —
 * the same no-key source the price feed uses, so no extra config is needed.
 */
async function yahooFx(): Promise<{ rate: number; changePct: number | null } | null> {
  const path = "/v8/finance/chart/IDR%3DX?interval=1d&range=2d";
  const headers = { "User-Agent": "Mozilla/5.0" };
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
  for (const host of hosts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(host + path, { cache: "no-store", signal: ctrl.signal, headers });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const meta = (await res.json())?.chart?.result?.[0]?.meta;
      const rate = Number(meta?.regularMarketPrice);
      if (!isFinite(rate) || rate <= 0) continue;
      const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
      return {
        rate,
        changePct: isFinite(prev) && prev > 0 ? ((rate - prev) / prev) * 100 : null,
      };
    } catch {
      // try the next host
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

export async function GET() {
  const fx = await yahooFx();
  if (!fx) return NextResponse.json({ error: "fx unavailable" }, { status: 502 });
  return NextResponse.json({ ...fx, ts: Date.now() });
}
