export type BrokerKind = "crypto" | "stock";

/**
 * One venue's published fee schedule, as a fraction of the traded notional.
 *
 * Rates are the **taker** side. The ledger never learns whether an order rested
 * on the book, and overstating cost is the safer error — a trade that only wins
 * on the optimistic rate didn't win.
 *
 * Indonesian sell rates fold in the final tax the broker withholds, because
 * that is what actually leaves the account: 0.1% PPh Final Pasal 4(2) on IDX
 * stocks, and 0.21% PPh Pasal 22 final on crypto sold through a domestic
 * exchange since PMK 50/2025 (1 Aug 2025, up from 0.1%). Foreign venues
 * withhold nothing — the seller files it. Rates move, so every computed fee
 * stays overridable.
 */
export interface Broker {
  id: string;
  name: string;
  kind: BrokerKind;
  buy: number;
  sell: number;
  /** Flat duty in IDR, charged once when the trade clears `stampOver` (also IDR). */
  stamp?: number;
  stampOver?: number;
  /** What the sell rate folds in. Sell-only — a buy is never taxed. */
  sellNote?: string;
}

export const BROKERS: Broker[] = [
  { id: "binance", name: "Binance", kind: "crypto", buy: 0.001, sell: 0.001 },
  { id: "bybit", name: "Bybit", kind: "crypto", buy: 0.001, sell: 0.001 },
  { id: "okx", name: "OKX", kind: "crypto", buy: 0.001, sell: 0.001 },
  { id: "indodax", name: "Indodax", kind: "crypto", buy: 0.002, sell: 0.0041, sellNote: "incl. 0.21% final tax" },
  { id: "tokocrypto", name: "Tokocrypto", kind: "crypto", buy: 0.002, sell: 0.0041, sellNote: "incl. 0.21% final tax" },
  { id: "stockbit", name: "Stockbit", kind: "stock", buy: 0.0015, sell: 0.0025, stamp: 10000, stampOver: 10000000, sellNote: "incl. 0.1% final tax" },
  { id: "ajaib", name: "Ajaib", kind: "stock", buy: 0.001, sell: 0.0018, sellNote: "incl. 0.1% final tax" },
  { id: "ipot", name: "IPOT", kind: "stock", buy: 0.001, sell: 0.002, sellNote: "incl. 0.1% final tax" },
  { id: "mirae", name: "Mirae Asset", kind: "stock", buy: 0.0015, sell: 0.0025, sellNote: "incl. 0.1% final tax" },
];

export const brokerById = (id?: string): Broker | undefined =>
  id ? BROKERS.find((b) => b.id === id) : undefined;

/**
 * What the venue charges on one leg, in the USD base the ledger stores.
 * `idrPerUsd` only matters for the flat duty, which is denominated in rupiah.
 */
export function feeFor(
  b: Broker | undefined,
  side: "buy" | "sell",
  notionalUsd: number,
  idrPerUsd: number
): number {
  if (!b || !(notionalUsd > 0)) return 0;
  let fee = notionalUsd * (side === "buy" ? b.buy : b.sell);
  if (b.stamp && b.stampOver && idrPerUsd > 0 && notionalUsd * idrPerUsd > b.stampOver) {
    fee += b.stamp / idrPerUsd;
  }
  return fee;
}

/**
 * Why this leg costs what it does, naming only the parts that actually applied —
 * a buy is never taxed, and the duty stays quiet below its threshold.
 */
export function feeNote(
  b: Broker | undefined,
  side: "buy" | "sell",
  notionalUsd: number,
  idrPerUsd: number
): string {
  if (!b) return "";
  const bits: string[] = [];
  if (side === "sell" && b.sellNote) bits.push(b.sellNote);
  if (b.stamp && b.stampOver && idrPerUsd > 0 && notionalUsd * idrPerUsd > b.stampOver) {
    bits.push("+ Rp" + b.stamp / 1000 + "k duty");
  }
  return bits.join(" · ");
}

/** The headline rate for a leg, e.g. "0.15%" — the duty is called out separately. */
export function feeRate(b: Broker | undefined, side: "buy" | "sell"): string {
  if (!b) return "";
  const pct = (side === "buy" ? b.buy : b.sell) * 100;
  return pct.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + "%";
}
