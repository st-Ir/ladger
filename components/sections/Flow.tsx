"use client";

import { useState } from "react";
import { useLedger } from "@/lib/store";
import type { View } from "@/lib/derive";

export default function Flow({ v }: { v: View }) {
  const { openBtn, setFilter, onQ, openCategories } = useLedger();

  return (
    <div>
      {/* INCOME */}
      <div className="sechd">
        <div className="sh-t">
          <span className="sh-bar" style={{ background: "var(--acc)" }} />
          Income
        </div>
      </div>
      <div className="grid3" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <div className="k">Income This Month</div>
          <div className="v" style={{ color: "var(--acc)" }}>{v.f.mIncome}</div>
          <div className="d">
            <span style={{ color: "var(--mut)", fontWeight: 500 }}>{v.incCount} deposits</span>
          </div>
        </div>
        <div className="card stat">
          <div className="k">Largest Source</div>
          <div className="v" style={{ fontSize: 23 }}>{v.f.topSource}</div>
          <div className="d">
            <span style={{ color: "var(--mut)", fontWeight: 500 }}>{v.f.topSourceAmt}</span>
          </div>
        </div>
        <div className="card stat">
          <div className="k">Avg / Deposit</div>
          <div className="v" style={{ fontSize: 23, color: "var(--acc)" }}>{v.f.avgIncome}</div>
          <div className="d" style={{ color: "var(--acc)" }}>▲ steady inflow</div>
        </div>
      </div>
      <div className="g2a">
        <div className="card" style={{ padding: "8px 18px" }}>
          <div className="cardh" style={{ padding: "16px 0 6px" }}>
            <div className="chh">Deposits</div>
            <span className="pill">into your vaults</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Source</th>
                <th>Account</th>
                <th>Date</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {v.incList.map((i, idx) => (
                <tr key={idx}>
                  <td><span className="sym" style={{ fontSize: 13.5 }}>{i.name}</span></td>
                  <td><span className="pill" style={{ fontSize: 11 }}>{i.account}</span></td>
                  <td className="mono" style={{ color: "var(--mut)" }}>{i.date}</td>
                  <td className="r mono" style={{ fontWeight: 600, color: "var(--acc)" }}>+{i.amt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="cardh">
            <div className="chh">By Account</div>
          </div>
          {v.topIncome && (
            <div style={{ background: "color-mix(in srgb, var(--acc) 9%, transparent)", border: "1px solid var(--brd)", borderRadius: 11, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--mut)" }}>Largest deposit</span>
                <span className="mono" style={{ fontWeight: 700, color: "var(--acc)", fontSize: 15 }}>{v.topIncome.amt}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{v.topIncome.name}</span>
                <span className="pill" style={{ fontSize: 11 }}>{v.topIncome.account}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 7, fontFamily: "'JetBrains Mono',monospace" }}>
                {v.topIncome.date} · {v.topIncome.sharePct} of this month&apos;s income
              </div>
            </div>
          )}
          {v.bySource.map((s, i) => (
            <div style={{ marginBottom: 16 }} key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 7 }}>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span className="mono" style={{ color: "var(--mut)" }}>{s.amt}</span>
              </div>
              <div className="bar">
                <div className="barf" style={{ width: s.w, background: "var(--acc)" }} />
              </div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--brd)", marginTop: 18, paddingTop: 14, fontSize: 12, color: "var(--mut)", lineHeight: 1.6 }}>
            Income lands in your vaults. To spend it, <b style={{ color: "var(--tx)" }}>transfer</b> to a wallet — that turns it into <b style={{ color: "var(--tx)" }}>Free Cash</b>. To invest, transfer to <b style={{ color: "var(--tx)" }}>Portfolio Capital</b>. Expenses only ever come from wallets.
          </div>
        </div>
      </div>

      {/* EXPENSES */}
      <div className="sechd" style={{ margin: "28px 0 14px" }}>
        <div className="sh-t">
          <span className="sh-bar" style={{ background: "var(--pnl-dn)" }} />
          Expenses
        </div>
      </div>
      <div className="grid4" style={{ marginBottom: 18 }}>
        {v.expStats.map((s, i) => (
          <div className="card stat" key={i}>
            <div className="k"><span className={"chip " + s.chip}>{s.name}</span></div>
            <div className="v" style={{ fontSize: 23, color: "var(--acc)" }}>{s.amt}</div>
            <div className="d">
              <span style={{ color: "var(--mut)", fontWeight: 500 }}>{s.meta}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 18 }}>
        <CategoryChart chart={v.catChart} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="ftab">
          {v.filters.map((fl) => (
            <button className={fl.cls} key={fl.id} onClick={() => setFilter(fl.id)}>{fl.label}</button>
          ))}
        </div>
        <button className="sc" onClick={() => openCategories()}>⚙ Categories</button>
        <div className="spacer" />
        <input className="srch" placeholder="Search expenses…" value={v.q} onInput={(e) => onQ((e.target as HTMLInputElement).value)} onChange={() => {}} />
      </div>

      {v.showGoals && (
        <div className="grid3">
          {v.goals.map((g, i) => (
            <div className="goal" key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 3 }}>{g.meta}</div>
                </div>
                <span className="chip c-tgt">Targeted</span>
              </div>
              <div className="bar" style={{ margin: "16px 0 9px" }}>
                <div className="barf" style={{ width: g.w, background: "var(--acc)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "var(--acc)" }}>{g.saved}</span>
                <span style={{ color: "var(--mut)" }}>/ {g.target}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--acc)", marginTop: 6, fontWeight: 600 }}>{g.pct} funded</div>
            </div>
          ))}
          <div className="goal" style={{ borderStyle: "dashed", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--mut)" }} onClick={() => openBtn("goal")}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24 }}>+</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>New savings goal</div>
            </div>
          </div>
        </div>
      )}

      {v.showExpList && (
        <div className="card" style={{ padding: "8px 18px" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Expense</th>
                <th>Category</th>
                <th>Wallet</th>
                <th>Date</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {v.expList.map((e, i) => (
                <tr key={i}>
                  <td><span className="sym" style={{ fontSize: 13.5 }}>{e.name}</span></td>
                  <td><span className={"chip " + e.chip} title={e.cat}>{e.letter}</span></td>
                  <td style={{ color: "var(--mut)" }}>{e.wallet}</td>
                  <td className="mono" style={{ color: "var(--mut)" }}>{e.date}</td>
                  <td className="r mono" style={{ fontWeight: 600 }}><span className="dn">-{e.amt}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {v.expEmpty && (
            <div className="empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <path d="M9 11l3 3 8-8" />
                <path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9" />
              </svg>
              <div style={{ fontWeight: 600, color: "var(--tx)" }}>No expenses match</div>
              <div className="hint">Try a different filter or add a new expense.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Category Spend chart: real transaction data only, bucketed by month.
// X-axis = months; bars = categories (accent, told apart by first-letter label +
// tooltip). Grouped = one bar per category; Stacked = one stacked bar per month.
// Completed months are solid; the current, still-open month is drawn dashed
// because its data isn't final yet. Heights are literal — no capping/normalizing.
function CategoryChart({ chart }: { chart: View["catChart"] }) {
  const years = chart.years.length ? chart.years : [chart.curYear];
  const [selYear, setSelYear] = useState(years[years.length - 1]);
  const [stacked, setStacked] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const year = years.includes(selYear) ? selYear : years[years.length - 1];
  const yi = years.indexOf(year);
  const months = chart.byYear[year] || [];

  const W = 720, H = 280;
  const padL = 46, padR = 14, padT = 16, padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;

  // Axis/tooltip shorthand. Values are in the display currency, so rupiah runs
  // into millions and billions where dollars stop at thousands.
  const kfmt = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e9) return +(n / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B";
    if (a >= 1e6) return +(n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
    if (a >= 1e3) return +(n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k";
    return String(Math.round(n));
  };
  const niceMax = (m: number) => {
    if (m <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(m)));
    const n = m / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
  };

  // Honest scale: grouped → tallest single category; stacked → tallest monthly total.
  const peak = stacked
    ? Math.max(1, ...months.map((m: any) => m.cats.reduce((a: number, c: any) => a + c.value, 0)))
    : Math.max(1, ...months.flatMap((m: any) => m.cats.map((c: any) => c.value)));
  const maxY = niceMax(peak * 1.05);
  const hOf = (val: number) => (val / maxY) * plotH;
  const yOf = (val: number) => baseY - hOf(val);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxY);
  const gW = plotW / Math.max(1, months.length);
  const small = months.length > 8;

  return (
    <div className="card">
      <div className="cardh" style={{ alignItems: "flex-start" }}>
        <div className="chh">Category Spend · by month</div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {chart.legend.map((l) => (
            <span key={l.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--mut)", fontWeight: 600 }}>
              <span style={{ width: 15, height: 15, borderRadius: 4, background: "color-mix(in srgb, var(--acc) 16%, transparent)", color: "var(--acc)", fontSize: 9.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{l.letter}</span>
              {l.name}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--mut)", fontWeight: 600 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: "color-mix(in srgb, var(--acc) 18%, transparent)", border: "1px dashed var(--acc)", flexShrink: 0 }} /> this month
          </span>
          {years.length > 1 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <button className="sc" onClick={() => yi > 0 && setSelYear(years[yi - 1])} disabled={yi <= 0} style={{ opacity: yi <= 0 ? 0.4 : 1 }}>‹</button>
              <span className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{year}</span>
              <button className="sc" onClick={() => yi < years.length - 1 && setSelYear(years[yi + 1])} disabled={yi >= years.length - 1} style={{ opacity: yi >= years.length - 1 ? 0.4 : 1 }}>›</button>
            </span>
          )}
          <button className="sc" onClick={() => setStacked((s) => !s)}>{stacked ? "Grouped" : "Stacked"}</button>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {months.map((m: any, mi: number) => (m.isCurrent || hover === mi) ? (
          <rect key={"hl" + m.key} x={padL + mi * gW + 2} y={padT} width={gW - 4} height={plotH} rx={6} fill="var(--acc)" opacity={hover === mi ? 0.08 : 0.04} />
        ) : null)}
        {ticks.map((t, i) => (
          <g key={"t" + i}>
            <line x1={padL} y1={yOf(t)} x2={W - padR} y2={yOf(t)} stroke="var(--brd)" strokeWidth="1" />
            <text x={padL - 8} y={yOf(t) + 4} textAnchor="end" fill="var(--mut)" fontSize="11" fontFamily="'JetBrains Mono',monospace">{kfmt(t)}</text>
          </g>
        ))}

        {stacked
          ? months.map((m: any, mi: number) => {
              const cx = padL + mi * gW + gW / 2;
              const bw = Math.min(48, gW * 0.5);
              const x = cx - bw / 2;
              let acc = 0;
              return (
                <g key={"c" + m.key}>
                  {m.cats.map((c: any, ci: number) => {
                    const h = hOf(c.value);
                    const y = baseY - acc - h;
                    acc += h;
                    if (h < 0.5) return null;
                    return m.isCurrent
                      ? <rect key={ci} x={x} y={y} width={bw} height={h} fill="var(--acc)" fillOpacity={0.2} stroke="var(--acc)" strokeWidth={1} strokeDasharray="3 2" />
                      : <rect key={ci} x={x} y={y} width={bw} height={h} fill="var(--acc)" stroke="var(--surf)" strokeWidth={1} />;
                  })}
                </g>
              );
            })
          : months.map((m: any, mi: number) => {
              const gx = padL + mi * gW;
              const n = m.cats.length;
              const innerPad = gW * 0.1;
              const slot = (gW - innerPad * 2) / n;
              const bw = Math.max(2, Math.min(slot * 0.8, 26));
              return (
                <g key={"c" + m.key}>
                  {m.cats.map((c: any, ci: number) => {
                    const x = gx + innerPad + slot * ci + slot / 2 - bw / 2;
                    const h = hOf(c.value);
                    if (h <= 0.4) return null;
                    return m.isCurrent
                      ? <rect key={ci} x={x} y={baseY - h} width={bw} height={h} rx={1.5} fill="var(--acc)" fillOpacity={0.2} stroke="var(--acc)" strokeWidth={1.2} strokeDasharray="3 2" />
                      : <rect key={ci} x={x} y={baseY - h} width={bw} height={h} rx={1.5} fill="var(--acc)" />;
                  })}
                </g>
              );
            })}

        {months.map((m: any, mi: number) => (
          <rect key={"hit" + m.key} x={padL + mi * gW} y={padT} width={gW} height={plotH} fill="transparent" style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(mi)} onMouseLeave={() => setHover(null)} onClick={() => setHover((h) => (h === mi ? null : mi))} />
        ))}

        {months.map((m: any, mi: number) => (
          <text key={"lb" + m.key} x={padL + mi * gW + gW / 2} y={baseY + 20} textAnchor="middle" fill={m.isCurrent ? "var(--acc)" : "var(--tx)"} fontSize={small ? 10 : 12.5} fontWeight={600}>{m.label}</text>
        ))}
        <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="var(--brd)" strokeWidth="1.5" />

        {hover != null && months[hover] && (() => {
          const m = months[hover];
          const n = m.cats.length;
          const boxW = 116;
          const boxH = 22 + n * 13;
          const cx = padL + hover * gW + gW / 2;
          const bx = Math.max(padL, Math.min(cx - boxW / 2, W - padR - boxW));
          const by = padT + 2;
          return (
            <g pointerEvents="none">
              <rect x={bx} y={by} width={boxW} height={boxH} rx={7} fill="var(--surf2)" stroke="var(--brd)" strokeWidth={1} />
              <text x={bx + 10} y={by + 15} fill="var(--tx)" fontSize={11} fontWeight={700}>{m.label} {year}{m.isCurrent ? " · in progress" : ""}</text>
              {m.cats.map((c: any, ci: number) => (
                <text key={ci} x={bx + 10} y={by + 30 + ci * 13} fontSize={10.5} fontFamily="'JetBrains Mono',monospace">
                  <tspan fill="var(--acc)" fontWeight={700}>{c.letter}</tspan>
                  <tspan fill="var(--tx)" dx={7}>{kfmt(c.value)}</tspan>
                </text>
              ))}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
