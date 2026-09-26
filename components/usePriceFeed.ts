"use client";

import { useEffect } from "react";
import { useLedger } from "@/lib/store";
import { PRICE_REFRESH_MS, fetchLivePrices } from "@/lib/prices";

/**
 * While `enabled`, poll `/api/prices` on an interval and push fresh prices into
 * the store. Pauses when the tab is hidden and refetches when it becomes visible.
 */
export function usePriceFeed(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const run = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const { priceStatus, setPriceStatus, applyPrices, positions, fxRate } =
        useLedger.getState();
      if (priceStatus === "idle" || priceStatus === "error")
        setPriceStatus("loading");
      try {
        // IDX quotes come back in IDR — the valuation rate converts them, so a
        // position's mark doesn't twitch with every FX tick.
        const r = await fetchLivePrices(positions, fxRate);
        if (!cancelled) applyPrices(r.prices);
      } catch {
        if (!cancelled) useLedger.getState().setPriceStatus("error");
      }
    };

    run();
    const id = setInterval(run, PRICE_REFRESH_MS);
    const onVis = () => {
      if (!document.hidden) run();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled]);
}
