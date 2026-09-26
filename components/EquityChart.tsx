"use client";

import { useRef, useState, type PointerEvent as RPtr } from "react";

/**
 * Zoomable line chart with a dataZoom slider underneath. Used by the dashboard's
 * equity curve and by the portfolio hero — the hero sits on the accent fill, so
 * every colour goes through the `--eq-*` custom properties (see `.eqc` in
 * globals.css) instead of hard-coding `var(--acc)`, which would be invisible
 * there.
 */
export default function EquityChart({
  series,
  fmt,
  uid = "eg",
}: {
  series: number[];
  fmt: (n: number) => string;
  /** Unique gradient id — two charts on one page must not share it. */
  uid?: string;
}) {
  const n = series.length;
  const [win, setWin] = useState({ s: 0, e: 1 });
  const [hover, setHover] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: "l" | "r" | "pan"; x0: number; s0: number; e0: number } | null>(null);
  const MINW = 0.05;
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  const move = (ev: PointerEvent) => {
    const d = drag.current, tr = trackRef.current;
    if (!d || !tr) return;
    const dx = (ev.clientX - d.x0) / (tr.getBoundingClientRect().width || 1);
    if (d.mode === "l") setWin({ s: clamp01(Math.min(d.s0 + dx, d.e0 - MINW)), e: d.e0 });
    else if (d.mode === "r") setWin({ s: d.s0, e: clamp01(Math.max(d.e0 + dx, d.s0 + MINW)) });
    else {
      let ns = d.s0 + dx, ne = d.e0 + dx;
      if (ns < 0) { ne -= ns; ns = 0; }
      if (ne > 1) { ns -= ne - 1; ne = 1; }
      setWin({ s: ns, e: ne });
    }
  };
  const up = () => {
    drag.current = null;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  const down = (mode: "l" | "r" | "pan") => (ev: RPtr<HTMLElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    drag.current = { mode, x0: ev.clientX, s0: win.s, e0: win.e };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // visible slice
  const i0 = Math.round(win.s * (n - 1));
  const i1 = Math.max(i0 + 1, Math.round(win.e * (n - 1)));
  const sub = series.slice(i0, i1 + 1);

  // main chart geometry — y auto-scales to the visible window
  const W = 620, H = 150, PAD = 12;
  const smin = Math.min(...sub), smax = Math.max(...sub);
  const pad = (smax - smin) * 0.16 || 1;
  const lo = smin - pad, hi = smax + pad, rng = hi - lo || 1;
  const sx = (i: number) => (sub.length > 1 ? (i / (sub.length - 1)) * W : W / 2);
  const sy = (val: number) => PAD + ((hi - val) / rng) * (H - PAD * 2);
  const line = sub.map((val, i) => (i ? "L" : "M") + sx(i).toFixed(1) + " " + sy(val).toFixed(1)).join(" ");
  const area = "M0 " + H + " L" + sub.map((val, i) => sx(i).toFixed(1) + " " + sy(val).toFixed(1)).join(" L") + " L" + W + " " + H + " Z";

  // mini overview (full series)
  const MW = 620, MH = 40;
  const fmin = Math.min(...series), fmax = Math.max(...series);
  const fpad = (fmax - fmin) * 0.1 || 1;
  const fhi = fmax + fpad, frng = (fhi - (fmin - fpad)) || 1;
  const mx = (i: number) => (i / (n - 1)) * MW;
  const my = (val: number) => 3 + ((fhi - val) / frng) * (MH - 6);
  const miniLine = series.map((val, i) => (i ? "L" : "M") + mx(i).toFixed(1) + " " + my(val).toFixed(1)).join(" ");
  const miniArea = "M0 " + MH + " L" + series.map((val, i) => mx(i).toFixed(1) + " " + my(val).toFixed(1)).join(" L") + " L" + MW + " " + MH + " Z";

  const onHover = (ev: RPtr<HTMLDivElement>) => {
    const r = mainRef.current?.getBoundingClientRect();
    if (!r) return;
    setHover(Math.round(clamp01((ev.clientX - r.left) / r.width) * (sub.length - 1)));
  };
  const pct = (x: number) => (x * 100).toFixed(3) + "%";

  return (
    <div className="eqc" style={{ marginTop: 4, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div ref={mainRef} className="eqc-main" onPointerMove={onHover} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
          <defs>
            <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--eq-ink)" stopOpacity=".28" />
              <stop offset="1" stopColor="var(--eq-ink)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1={H * 0.25} x2={W} y2={H * 0.25} stroke="var(--eq-grid)" strokeWidth="1" strokeDasharray="4 6" />
          <line x1="0" y1={H * 0.5} x2={W} y2={H * 0.5} stroke="var(--eq-grid)" strokeWidth="1" strokeDasharray="4 6" />
          <line x1="0" y1={H * 0.75} x2={W} y2={H * 0.75} stroke="var(--eq-grid)" strokeWidth="1" strokeDasharray="4 6" />
          <path d={area} fill={`url(#${uid})`} />
          <path d={line} fill="none" stroke="var(--eq-ink)" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {hover != null && sub[hover] != null && (
            <g>
              <line x1={sx(hover)} y1="0" x2={sx(hover)} y2={H} stroke="var(--eq-ink)" strokeWidth="1" strokeDasharray="3 3" opacity=".55" vectorEffect="non-scaling-stroke" />
              <circle cx={sx(hover)} cy={sy(sub[hover])} r="3.5" fill="var(--eq-ink)" stroke="var(--eq-ring)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </g>
          )}
        </svg>
        {hover != null && sub[hover] != null && (
          <div className="eqc-tip" style={{ left: pct(hover / (sub.length - 1)) }}>{fmt(sub[hover])}</div>
        )}
      </div>

      {/* dataZoom slider */}
      <div className="ezoom" ref={trackRef}>
        <svg className="ezoom-mini" viewBox={`0 0 ${MW} ${MH}`} preserveAspectRatio="none">
          <path d={miniArea} fill="var(--eq-ink)" opacity=".12" />
          <path d={miniLine} fill="none" stroke="var(--eq-ink)" strokeWidth="1" opacity=".5" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="ezoom-mask" style={{ left: 0, width: pct(win.s) }} />
        <div className="ezoom-mask" style={{ right: 0, width: pct(1 - win.e) }} />
        <div className="ezoom-win" style={{ left: pct(win.s), width: pct(win.e - win.s) }} onPointerDown={down("pan")}>
          <span className="ezoom-h l" onPointerDown={down("l")} />
          <span className="ezoom-h r" onPointerDown={down("r")} />
        </div>
      </div>
    </div>
  );
}
