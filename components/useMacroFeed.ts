"use client";

import { useEffect } from "react";
import { useLedger } from "@/lib/store";
import { MACRO_REFRESH_MS, fetchMacro, macroKey } from "@/lib/prices";

/**
 * While `enabled`, poll `/api/macro` for driver levels and the log's baselines.
 *
 * Gated on the Macro tab actually being open, not just on the Portfolio being
 * unlocked: four of the six panels need no network at all, so a tab nobody is
 * looking at has no reason to hit Yahoo every fifteen minutes.
 *
 * The timer is not the only trigger. Writing a note is a request for a number,
 * so the poll restarts whenever the ask itself changes — see `macroKey`. The
 * route caches per ticker and date, so the extra call costs one round trip and
 * no venue hit for anything already known.
 */
export function useMacroFeed(enabled: boolean) {
  const key = useLedger((s) => macroKey(s.positions, s.mlog || [], s.features?.fx !== false));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const run = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const { macroStatus, setMacroStatus, applyMacro, positions, mlog, features } =
        useLedger.getState();
      if (macroStatus === "idle" || macroStatus === "error") setMacroStatus("loading");
      try {
        const r = await fetchMacro(positions, mlog || [], features?.fx !== false);
        if (!cancelled) applyMacro(r.quotes, r.moves);
      } catch {
        if (!cancelled) useLedger.getState().setMacroStatus("error");
      }
    };

    run();
    const id = setInterval(run, MACRO_REFRESH_MS);
    const onVis = () => {
      if (!document.hidden) run();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, key]);
}
