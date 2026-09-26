"use client";

import { useLedger } from "@/lib/store";
import type { View } from "@/lib/derive";

export default function Cash({ v }: { v: View }) {
  const { openBtn, openPlace, delPlace, openTransfer } = useLedger();

  return (
    <div>
      <div className="g2a" style={{ marginBottom: 14 }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div className="k stat" style={{ fontSize: 11, color: "var(--mut)", letterSpacing: ".4px", textTransform: "uppercase", fontWeight: 600 }}>
            Total Free Cash
          </div>
          <div className="big" style={{ fontSize: 31, margin: "7px 0 5px", color: "var(--acc)" }}>{v.f.freeCash}</div>
          <div style={{ fontSize: 12, color: "var(--mut)", lineHeight: 1.5 }}>
            Across {v.walletCount} wallets · uang bebas pakai untuk expense. Untuk investasi, transfer ke Portfolio Capital.
          </div>
          <div style={{ display: "flex", gap: 9, marginTop: 14, flexWrap: "wrap" }}>
            <button className="pbtn" onClick={() => openBtn("transfer")}>⇄ Transfer to Wallet</button>
            <button className="ghost" onClick={() => openBtn("expense")}>Log Spend</button>
          </div>
        </div>

        <div className="card">
          <div className="cardh">
            <div className="chh">This Month</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--brd)" }}>
            <span style={{ color: "var(--mut)", fontSize: 13 }}>Cash in</span>
            <span className="mono" style={{ fontWeight: 600, color: "var(--acc)" }}>+{v.f.mIncome}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--brd)" }}>
            <span style={{ color: "var(--mut)", fontSize: 13 }}>Cash out</span>
            <span className="mono dn" style={{ fontWeight: 600 }}>-{v.f.mExpense}</span>
          </div>
          {v.feat.fx && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--brd)" }}>
              <span style={{ color: "var(--mut)", fontSize: 13 }}>Realized FX</span>
              <span className={"mono" + (v.f.realizedFxCls === "up" ? "" : " dn")} style={v.f.realizedFxCls === "up" ? { fontWeight: 600, color: "var(--acc)" } : { fontWeight: 600 }}>{v.f.realizedFx}</span>
            </div>
          )}
          <div style={{ padding: "10px 0 2px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "var(--mut)", fontSize: 13 }}>Net</span>
              <span className={"mono" + (v.f.netFlowCls === "up" ? "" : " dn")} style={v.f.netFlowCls === "up" ? { fontWeight: 700, color: "var(--acc)" } : { fontWeight: 700 }}>{v.f.netFlow}</span>
            </div>
            <NetArea series={v.f.netSeries} />
          </div>
        </div>
      </div>

      <div className="cardh" style={{ margin: "18px 0 10px" }}>
        <div className="chh" style={{ fontSize: 14 }}>Vaults &amp; Capital</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="pill">simpanan &amp; buying power</span>
          <button className="ghost" onClick={() => openPlace("account", null)}>+ Vault</button>
          <button className="ghost" onClick={() => openPlace("capital", null)}>+ Capital</button>
        </div>
      </div>
      <div className="walgrid">
        {v.accountsList.map((a) => (
          <div className="wal" key={"a" + a.idx}>
            <div className="walhd">
              <div className="walk">{a.name}</div>
              <div className="walacts">
                <button className="miniic" title="Transfer out" onClick={() => openTransfer(a.name)}>⇄</button>
                <button className="miniic" title="Edit" onClick={() => openPlace("account", a.idx)}>✎</button>
                <button className="miniic del" title="Delete" onClick={() => delPlace("account", a.idx)}>×</button>
              </div>
            </div>
            <div className="walv">{a.bal}</div>
          </div>
        ))}
        {v.capitalList.map((c) => (
          <div className="wal" key={"c" + c.idx}>
            <div className="walhd">
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <span className="captag">CAP</span>
                <div className="walk">{c.name}</div>
              </div>
              <div className="walacts">
                <button className="miniic" title="Transfer out" onClick={() => openTransfer(c.name)}>⇄</button>
                <button className="miniic" title="Edit" onClick={() => openPlace("capital", c.idx)}>✎</button>
                <button className="miniic del" title="Delete" onClick={() => delPlace("capital", c.idx)}>×</button>
              </div>
            </div>
            <div className="walv">{c.bal}</div>
          </div>
        ))}
        <div className="wal walnew" onClick={() => openPlace("account", null)}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          <span>New vault</span>
        </div>
        <div className="wal walnew" onClick={() => openPlace("capital", null)}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          <span>New capital</span>
        </div>
      </div>

      <PlaceHeader title="Wallets" pill="free cash · spend from here" btn="+ Wallet" onAdd={() => openPlace("wallet", null)} />
      <div className="walgrid">
        {v.wallets.map((w) => (
          <div className="wal" key={w.idx}>
            <div className="walhd">
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span className={"tag " + w.tag}>{w.badge}</span>
                <div className="walk">{w.name}</div>
              </div>
              <div className="walacts">
                <button className="miniic" title="Edit" onClick={() => openPlace("wallet", w.idx)}>✎</button>
                <button className="miniic del" title="Delete" onClick={() => delPlace("wallet", w.idx)}>×</button>
              </div>
            </div>
            <div className="walv">{w.bal}</div>
            <div className="bar" style={{ marginTop: 10 }}>
              <div className="barf" style={{ width: w.w }} />
            </div>
            <div style={{ fontSize: 10, color: "var(--mut)", marginTop: 5, fontFamily: "'JetBrains Mono',monospace" }}>{w.pct} of free cash</div>
          </div>
        ))}
        <div className="wal walnew" onClick={() => openPlace("wallet", null)}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          <span>New wallet</span>
        </div>
      </div>
    </div>
  );
}

// Area chart with a 0 baseline: the fill sits between the curve and zero, so
// periods above 0 and below 0 both read at a glance. Accent line + gradient fill.
function NetArea({ series }: { series: number[] }) {
  const W = 320;
  const H = 90;
  const PAD = 5;
  const pts = series.length ? series : [0, 0];
  const lo = Math.min(0, ...pts);
  const hi = Math.max(0, ...pts);
  // A month where nothing moved is all zeros, and that would pin the line to
  // the top edge with the baseline under it. Give a flat series a symmetric
  // window instead, so "no flow" reads as resting on zero.
  const flat = hi - lo < 1e-9;
  const min = flat ? -1 : lo;
  const max = flat ? 1 : hi;
  const range = max - min || 1;
  const x = (i: number) => PAD + (pts.length > 1 ? (i / (pts.length - 1)) * (W - PAD * 2) : W / 2);
  const y = (val: number) => PAD + ((max - val) / range) * (H - PAD * 2);
  const y0 = y(0);
  const line = pts.map((val, i) => (i === 0 ? "M" : "L") + x(i).toFixed(1) + " " + y(val).toFixed(1)).join(" ");
  const area =
    "M" + x(0).toFixed(1) + " " + y0.toFixed(1) + " " +
    pts.map((val, i) => "L" + x(i).toFixed(1) + " " + y(val).toFixed(1)).join(" ") +
    " L" + x(pts.length - 1).toFixed(1) + " " + y0.toFixed(1) + " Z";
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }}>
        <defs>
          <linearGradient id="netgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--acc)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--acc)" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <line x1="0" y1={y0.toFixed(1)} x2={W} y2={y0.toFixed(1)} stroke="var(--mut)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        <path d={area} fill="url(#netgrad)" />
        <path d={line} fill="none" stroke="var(--acc)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The label sits above its line, except when the line is already at the
          top — a month of pure spending puts zero at the ceiling, and the tag
          would climb out of the chart and into the row above it. */}
      <span style={{ position: "absolute", left: 2, top: y0 < 14 ? y0 + 2 : y0 - 13, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "var(--mut)", background: "var(--surf)", padding: "0 2px" }}>0</span>
    </div>
  );
}

function PlaceHeader({ title, pill, btn, onAdd }: { title: string; pill: string; btn: string; onAdd: () => void }) {
  return (
    <div className="cardh" style={{ margin: "18px 0 10px" }}>
      <div className="chh" style={{ fontSize: 14 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="pill">{pill}</span>
        <button className="ghost" onClick={onAdd}>{btn}</button>
      </div>
    </div>
  );
}
