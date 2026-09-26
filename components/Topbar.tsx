"use client";

import { useEffect, useRef, useState } from "react";
import { useLedger } from "@/lib/store";
import type { View } from "@/lib/derive";

export default function Topbar({ v }: { v: View }) {
  const { goHome, setCur, openTheme, primary, adoptFxRate } = useLedger();
  // Narrow screens can't fit the rate chip + currency toggle + appearance button
  // next to the title, so below 900px they collapse into this one menu.
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!more) return;
    const onDown = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMore(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    // Widening past the breakpoint hides the button the menu hangs off.
    const onResize = () => setMore(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [more]);

  const fxTitle =
    "Kurs valuasi (dibekukan): " + v.fx.rateLabel + " / $1 · " + v.fx.points + " titik riwayat." +
    (v.fx.live ? " Live: " + v.fx.liveLabel + (v.fx.updated ? " · " + v.fx.updated : "") : " Live: menghubungkan…") +
    (v.fx.canAdopt ? " — klik untuk pakai kurs live." : "");

  return (
    <div className="topbar">
      <div className="brandbar" onClick={goHome} title="Back to dashboard">
        <div className="blogo">L</div>
        <div className="bxt">
          <div className="bname">Ledger</div>
          <div className="bsub">Money OS</div>
        </div>
      </div>

      <div className="tsep" />
      <div className="ttlwrap">
        <div className="ttl">{v.sectionTitle}</div>
        <div className="tsub">{v.sectionSub}</div>
      </div>
      <div className="spacer" />

      {/* Rate chip + currency toggle only exist while FX effect is on. */}
      {v.feat.fx && (
        <>
          <div
            className="fxchip tbwide"
            title={fxTitle}
            onClick={() => v.fx.canAdopt && adoptFxRate()}
            style={{ cursor: v.fx.canAdopt ? "pointer" : "default" }}
          >
            <span className="fxdot" style={{ background: v.fx.dot }} />
            <span className="fxrate">{v.fx.rateLabel}</span>
            {v.fx.canAdopt && (
              <span className={"fxdrift " + v.fx.driftCls}>
                {v.fx.liveLabel} {v.fx.driftPct}
              </span>
            )}
          </div>

          <div className="curtog tbwide">
            <button className={v.curCls.usd} onClick={() => setCur("USD")}>
              USD
            </button>
            <button className={v.curCls.idr} onClick={() => setCur("IDR")}>
              IDR
            </button>
          </div>
        </>
      )}

      <button className="iconbtn tbwide" title="Appearance" onClick={openTheme}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1l2.1-2.1M17 7l2.1-2.1" />
        </svg>
      </button>

      {v.showPrimary && (
        <button className="pbtn" onClick={primary} title={v.primaryLabel}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="plbl">{v.primaryLabel}</span>
        </button>
      )}

      <div className="tbmwrap" ref={moreRef}>
        <button
          className="iconbtn tbmore"
          title="Menu"
          aria-expanded={more}
          onClick={() => setMore((o) => !o)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <circle cx="5" cy="12" r="1.4" fill="currentColor" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" />
            <circle cx="19" cy="12" r="1.4" fill="currentColor" />
          </svg>
        </button>

        {more && (
          <div className="tbmenu">
            {v.feat.fx && (
              <>
                <div className="tbmlbl">Mata uang</div>
                <div className="curtog tbmcur">
                  <button className={v.curCls.usd} onClick={() => setCur("USD")}>
                    USD
                  </button>
                  <button className={v.curCls.idr} onClick={() => setCur("IDR")}>
                    IDR
                  </button>
                </div>

                <div className="tbmlbl">Kurs</div>
                <button
                  className="tbmitem"
                  title={fxTitle}
                  disabled={!v.fx.canAdopt}
                  onClick={() => {
                    adoptFxRate();
                    setMore(false);
                  }}
                >
                  <span className="fxdot" style={{ background: v.fx.dot }} />
                  <span className="fxrate">{v.fx.rateLabel}</span>
                  {v.fx.canAdopt && (
                    <span className={"fxdrift " + v.fx.driftCls}>
                      {v.fx.liveLabel} {v.fx.driftPct}
                    </span>
                  )}
                </button>
              </>
            )}

            <div className="tbmlbl">Tampilan</div>
            <button
              className="tbmitem"
              onClick={() => {
                openTheme();
                setMore(false);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1l2.1-2.1M17 7l2.1-2.1" />
              </svg>
              Tema &amp; warna
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
