"use client";

import { useEffect } from "react";
import { useLedger } from "@/lib/store";
import { FX_REFRESH_MS, fetchFxRate } from "@/lib/prices";

/**
 * Poll the live USD/IDR quote app-wide. The quote is only *displayed* — the
 * valuation rate stays frozen until the user adopts it, so balances don't move
 * under them mid-session. Pauses while the tab is hidden, and doesn't run at all
 * when the FX effect feature is off (`enabled` false) — nothing would show it.
 */
export function useFxFeed(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const run = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const { fxStatus, setFxStatus, applyFxQuote } = useLedger.getState();
      if (fxStatus === "idle" || fxStatus === "error") setFxStatus("loading");
      try {
        const q = await fetchFxRate();
        if (!cancelled) applyFxQuote(q.rate, q.changePct);
      } catch {
        if (!cancelled) useLedger.getState().setFxStatus("error");
      }
    };

    run();
    const id = setInterval(run, FX_REFRESH_MS);
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
