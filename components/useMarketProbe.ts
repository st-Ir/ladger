"use client";

import { useEffect } from "react";
import { useLedger } from "@/lib/store";

/**
 * While a ticker is being typed, ask the venue which exchange actually lists it
 * and preselect that. Debounced so a four-letter ticker costs one lookup, not
 * four, and aborted on the next keystroke so a slow reply can't overwrite a
 * newer one.
 */
export function useMarketProbe(sym: string, enabled: boolean) {
  const applyMarketProbe = useLedger((s) => s.applyMarketProbe);

  useEffect(() => {
    const s = (sym || "").trim().toUpperCase();
    if (!enabled || !/^[A-Z0-9]{2,10}$/.test(s)) return;

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/prices/resolve?sym=" + encodeURIComponent(s), {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        applyMarketProbe(s, await res.json());
      } catch {
        // Offline or aborted — leave whatever the user already picked alone.
      }
    }, 450);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [sym, enabled, applyMarketProbe]);
}
