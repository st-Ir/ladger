"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLedger } from "@/lib/store";
import { makeFormat } from "@/lib/format";
import type { View } from "@/lib/derive";
import ProfileCard from "../ProfileCard";
import EquityChart from "../EquityChart";

// Avoid the SSR warning for useLayoutEffect while keeping flash-free measurement on the client.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function Dashboard({ v }: { v: View }) {
  const { openQuick, go, goExpense, editGoal } = useLedger();
  const fm = makeFormat(v.cur);
  const [spendOpen, setSpendOpen] = useState(false);
  const initials = ["F", "V", "C", "P"];

  // Show as many transmission-log rows as fit the height of the Targeted Savings
  // card (so the merged card fills instead of leaving empty space). When the two
  // cards stack (narrow window) there's nothing to match, so show them all.
  const savingsRef = useRef<HTMLDivElement>(null);
  const mergeRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const maxRows = v.recent.length;
  const [logCount, setLogCount] = useState(Math.min(3, maxRows));
  const [goalDetail, setGoalDetail] = useState<number | null>(null);
  const [goalForm, setGoalForm] = useState<{ name: string; target: string; saved: string } | null>(null);
  const openGoal = (i: number) => {
    const g = v.tgtGoals[i];
    setGoalDetail(i);
    setGoalForm({ name: g.name, target: String(fm.curNum(g.targetRaw)), saved: String(fm.curNum(g.savedRaw)) });
  };

  useIsoLayoutEffect(() => {
    const compute = () => {
      const s = savingsRef.current, m = mergeRef.current, top = topRef.current, foot = footRef.current;
      if (!s || !m || !top || !foot) return;
      const sideBySide = Math.abs(s.getBoundingClientRect().top - m.getBoundingClientRect().top) < 8;
      if (!sideBySide) return setLogCount(maxRows);
      const cs = getComputedStyle(m);
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const rowH = logRef.current?.firstElementChild?.getBoundingClientRect().height || 51;
      const avail = s.getBoundingClientRect().height - pad - top.getBoundingClientRect().height - 6 - foot.getBoundingClientRect().height;
      // When collapsed keep at least 3 rows; when expanded allow fewer so the
      // card doesn't grow past the savings card's height.
      const minRows = spendOpen ? 2 : 3;
      const n = Math.max(minRows, Math.min(maxRows, Math.floor(avail / rowH)));
      setLogCount((prev) => (prev === n ? prev : n));
    };
    compute();
    window.addEventListener("resize", compute);
    const raf = requestAnimationFrame(compute);
    // Re-measure after the collapse/expand transition (0.3s) settles.
    const t = setTimeout(compute, 340);
    return () => {
      window.removeEventListener("resize", compute);
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [spendOpen, maxRows, v.tgtGoals.length, v.cur]);

  return (
    <div className="bento">
      {/* ============ BAND 0 — account + feature switches ============ */}
      <ProfileCard />

      {/* ============ BAND 1 — hero + minimalist KPIs ============ */}
      <div className="bband bb1">
        {/* NET WORTH spec panel */}
        <div className="bhero">
          <div className="htop">
            <div>
              <div className="hidx">01</div>
              <div className="hlbl">Net Worth // OS</div>
              <div className="hbadge"><span className="hd" /> SYS.OK · REV 2.5</div>
            </div>
            <button className="harrow" onClick={openQuick} title="Quick Add">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M13 2L4.5 13.5H11l-.5 8L19 10h-6.5z" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>

          <div className="bnum">{v.f.netWorth}</div>
          <div className="hchgs">
            <span className={"hchg " + v.f.netWorthChgTone} title={v.f.netWorthChgTitle}>
              {v.f.netWorthChgArrow} {v.f.netWorthChg} <span className="hchgu">30D</span>
            </span>
            {v.feat.fx && (
              <span
                className={"hchg tap " + v.f.unrealizedFxTone}
                title={v.f.unrealizedFxTitle}
                onClick={() => go(v.feat.portfolio ? "portfolio" : "cash")}
              >
                <span className="hchgk">FX</span> {v.f.unrealizedFxArrow} {v.f.unrealizedFx} <span className="hchgu">UNREAL.</span>
              </span>
            )}
          </div>

          <div className="badsr" title="Allocation split">
            {v.donut.map((d, i) => (
              <div className="abw" key={i}>
                <div className="ab" style={{ height: d.pct }} />
                <span className="abl">{initials[i] ?? d.name[0]}</span>
              </div>
            ))}
          </div>

          <div className="bmini">
            <div className="bminc" onClick={() => go("cash")}>
              <div className="mk">Free Cash</div>
              <div className="mv">{v.f.freeCash}</div>
            </div>
            {v.feat.portfolio && (
              <div className="bminc" onClick={() => go("portfolio")}>
                <div className="mk">Portfolio</div>
                <div className="mv">{v.f.pfValue}</div>
              </div>
            )}
            <div className="bminc" onClick={() => go("flow")}>
              <div className="mk">Net / mo</div>
              <div className="mv">{v.f.netFlow}</div>
            </div>
          </div>

          <div className="bherofoot">
            <span className="bcode">#NW-2026-EOA15E</span>
            <div className="bmk" />
            <span className="bcode">CORP<span className="breg">™</span></span>
          </div>
        </div>

        {/* KPI tiles — siblings so mobile can pair 01 + 02 in one row */}
        <div className="btile bt-spend" onClick={goExpense} style={{ cursor: "pointer" }}>
          <span className="twm">02</span>
          <div className="tlbl"><span>Spend / mo</span><span>▦</span></div>
          <div className="tbot">
            <div className="tnum" style={{ color: "var(--acc)" }}>{v.f.mExpense}</div>
            <div className="tacc" style={{ background: "var(--acc)" }} />
          </div>
        </div>
        <div className="btile bt-net" onClick={() => go("cash")} style={{ cursor: "pointer" }}>
          <span className="twm">03</span>
          <div className="tlbl"><span>Net · Cash</span><span className="breg" style={{ fontSize: 12 }}>⇄</span></div>
          <div className="tbot">
            <div className="tnum" style={{ color: "var(--acc)" }}>{v.f.netFlowPct}</div>
            <div className="tacc" style={{ background: "var(--acc)" }} />
          </div>
        </div>
      </div>

      {/* ============ BAND 2 — equity curve + allocation ============ */}
      <div className="bband bb2">
        <div className="bcard marks">
          <div className="bkick">
            <span className="bix">04</span> Equity Curve <span className="kln" />
            <span className={"bcode " + v.f.netWorthChgCls} title={v.f.netWorthChgTitle}>{v.f.netWorthChgArrow} {v.f.netWorthChg}</span>
            <span className="bcode">30D</span>
          </div>
          <EquityChart series={v.equitySeries} fmt={(n) => fm.fmt(n * 1000)} />
          <div className="baxis">
            <span>M-01</span><span>M-04</span><span>M-07</span><span>M-10</span><span>NOW</span>
          </div>
        </div>

        <div className="bcard cut">
          <div className="bkick">
            <span className="bix">05</span> Allocation <span className="kln" />
            <span className="bcode">TS-NW</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginTop: 6 }}>
            <svg viewBox="0 0 200 200" style={{ width: 128, height: 128, flexShrink: 0 }}>
              {v.donut.map((d, i) => (
                <circle key={i} cx="100" cy="100" r="70" fill="none" strokeWidth="24" style={{ stroke: d.color }} strokeDasharray={d.dash} strokeDashoffset={d.offset} transform="rotate(-90 100 100)" />
              ))}
              <text x="100" y="96" textAnchor="middle" style={{ fill: "var(--tx)", fontSize: 17, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{v.f.netWorth}</text>
              <text x="100" y="116" textAnchor="middle" style={{ fill: "var(--mut)", fontSize: 8.5, letterSpacing: 1.5 }}>NET WORTH</text>
            </svg>
            <div style={{ flex: 1, minWidth: 150 }}>
              {v.donut.map((d, i) => (
                <div className="legrow" key={i}>
                  <span className="legdot" style={{ background: d.color }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--mut)", marginTop: 2 }}>{d.val}</div>
                  </div>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{d.pct}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ============ BAND 3 — targeted savings + merged spending/log ============ */}
      <div className="bband bb3">
        {/* 08 Targeted Savings — now in 06's old slot */}
        <div className="bcard" ref={savingsRef}>
          <div className="bkick">
            <span className="bix">08</span> Targeted Savings <span className="kln" />
            <span className="bcode val">{v.f.tgtSaved} / {v.f.tgtTotal}</span>
            <span className="bcode up">{v.f.tgtPct} FUNDED</span>
          </div>
          <div className="bgoals" style={{ marginTop: 6 }}>
            {v.tgtGoals.map((g, i) => {
              const funded = g.pctNum >= 100;
              const rc = funded ? "var(--pnl-up)" : "var(--acc)";
              const R = 30;
              const C = 2 * Math.PI * R;
              const dash = (Math.min(100, g.pctNum) / 100) * C;
              return (
                <div className="bgoal cut" key={i} onClick={() => openGoal(i)} style={{ cursor: "pointer" }}>
                  <div className="g2top">
                    <span className="bcode" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: rc }} />
                      G-{String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={"chip " + g.chip}>{g.note}</span>
                  </div>
                  <div className="g2name">{g.name}</div>
                  <div className="g2body">
                    <svg className="gring" viewBox="0 0 76 76">
                      <circle cx="38" cy="38" r={R} fill="none" stroke="var(--brd)" strokeWidth="7" />
                      <circle cx="38" cy="38" r={R} fill="none" stroke={rc} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${dash} ${C}`} transform="rotate(-90 38 38)" />
                      <text x="38" y="43" textAnchor="middle" style={{ fill: "var(--tx)", fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 700 }}>{g.pct}</text>
                    </svg>
                    <div className="g2spec">
                      <div className="g2row"><span className="g2k">Saved</span><span className="g2v">{g.saved}</span></div>
                      <div className="g2row"><span className="g2k">Target</span><span className="g2v" style={{ color: "var(--mut)" }}>{g.target}</span></div>
                      <div className="g2row"><span className="g2k">Left</span><span className="g2v" style={{ color: rc }}>{g.left}</span></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 06 + 07 merged into one accent card */}
        <div className="bmerge" ref={mergeRef}>
          <div ref={topRef}>
            {/* Section 06 — collapsible */}
            <div className="bkick">
              <span className="bix">06</span> Spending Systm <span className="kln" />
              <span className="bcode val">{v.f.mExpense}</span>
              <button className={"collbtn" + (spendOpen ? " open" : "")} onClick={() => setSpendOpen((o) => !o)} title={spendOpen ? "Collapse" : "Expand"}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </div>
            <div className={"spendbody" + (spendOpen ? " open" : "")}>
              <div style={{ paddingTop: 8 }}>
                {v.catBreak.map((c, i) => (
                  <div className="bcat" key={i}>
                    <div className="bcatt">
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span className={"chip " + c.chip} style={{ fontSize: 10 }}>{c.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>{c.note}</span>
                      </div>
                      <span className="mono" style={{ fontWeight: 600 }}>{c.amt} · {c.pct}</span>
                    </div>
                    <div className="bar">
                      <div className="barf" style={{ width: c.w, background: "var(--acctx)" }} />
                    </div>
                    <div style={{ fontSize: 10.5, opacity: 0.68, marginTop: 5, fontFamily: "'JetBrains Mono',monospace" }}>PREV · {c.prevAmt}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mergediv" />

            {/* Section 07 — transmission log */}
            <div className="bkick">
              <span className="bix">07</span> Transmission Log <span className="kln" />
              <a href="#" onClick={(e) => { e.preventDefault(); goExpense(); }} className="bcode" style={{ color: "var(--acctx)", opacity: 0.9, textDecoration: "underline", textUnderlineOffset: 3, fontWeight: 700 }}>ALL</a>
            </div>
          </div>

          <div className="blog" ref={logRef} style={{ marginTop: 6 }}>
            {v.recent.slice(0, logCount).map((r, i) => (
              <div className="blogrow" key={i}>
                <span className="lix">{String(i + 1).padStart(2, "0")}</span>
                <div className="ldot">{r.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="lnm">{r.name}</div>
                  <div className="lmt">{r.meta}</div>
                </div>
                <div className={"lam " + r.cls}>{r.amt}</div>
              </div>
            ))}
          </div>

          <div className="bmergefoot" ref={footRef}>
            <span className="bcode">TX-LOG</span>
            <div className="bmk" />
            <span className="bcode">SYNC<span className="breg">®</span></span>
          </div>
        </div>
      </div>

      <div className="bfoot">© 2026 Ledger — Money OS · All rights reserved</div>

      {goalDetail !== null && v.tgtGoals[goalDetail] && goalForm && (() => {
        const g = v.tgtGoals[goalDetail];
        const rc = "var(--acc)";
        const tgtU = fm.toUsd(goalForm.target);
        const savU = fm.toUsd(goalForm.saved);
        const pctNum = tgtU > 0 ? Math.min(100, (savU / tgtU) * 100) : 0;
        const funded = pctNum >= 100;
        const ringC = funded ? "var(--pnl-up)" : rc;
        const R = 34;
        const C = 2 * Math.PI * R;
        const dash = (pctNum / 100) * C;
        const leftU = Math.max(0, tgtU - savU);
        const setF = (k: "name" | "target" | "saved") => (e: any) => setGoalForm({ ...goalForm, [k]: e.target.value });
        const save = () => {
          editGoal(goalDetail, { name: (goalForm.name || "").trim() || g.name, target: Math.max(1, tgtU), saved: Math.max(0, savU) });
          setGoalDetail(null);
        };
        return (
          <div className="ov" onClick={() => setGoalDetail(null)}>
            <div className="modal" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
              <div className="mhd">
                <div>
                  <div className="mtl">Edit Goal</div>
                  <div className="msub">Targeted savings · G-{String(goalDetail + 1).padStart(2, "0")}</div>
                </div>
                <button className="xbtn" onClick={() => setGoalDetail(null)}>×</button>
              </div>
              <div className="mbd">
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 6 }}>
                  <svg viewBox="0 0 84 84" style={{ width: 86, height: 86, flexShrink: 0 }}>
                    <circle cx="42" cy="42" r={R} fill="none" stroke="var(--surf2)" strokeWidth="8" />
                    <circle cx="42" cy="42" r={R} fill="none" stroke={ringC} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} ${C}`} transform="rotate(-90 42 42)" />
                    <text x="42" y="47" textAnchor="middle" style={{ fill: "var(--tx)", fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700 }}>{pctNum.toFixed(0)}%</text>
                  </svg>
                  <div style={{ flex: 1 }}>
                    <div className="g2row"><span className="g2k">Left</span><span className="g2v" style={{ color: ringC }}>{fm.fmt(leftU)}</span></div>
                    <div className="g2row" style={{ borderBottom: 0 }}><span className="g2k">Status</span><span className={"chip " + (funded ? "c-up" : pctNum >= 60 ? "c-tgt" : "c-mut")}>{funded ? "Funded" : pctNum >= 60 ? "On track" : "Building"}</span></div>
                  </div>
                </div>
                <div className="fld"><label className="flbl">Goal name</label><input className="inp" value={goalForm.name} onChange={setF("name")} placeholder="e.g. New Laptop" /></div>
                <div className="frow">
                  <div className="fld"><label className="flbl">Target ({v.cur})</label><input className="inp mono" value={goalForm.target} onChange={setF("target")} inputMode="decimal" /></div>
                  <div className="fld"><label className="flbl">Saved ({v.cur})</label><input className="inp mono" value={goalForm.saved} onChange={setF("saved")} inputMode="decimal" /></div>
                </div>
                <div className="hint">To <b style={{ color: "var(--tx)" }}>add a new</b> savings goal, go to the <b style={{ color: "var(--tx)" }}>Cash Flow</b> tab → Targeted filter.</div>
              </div>
              <div className="mft">
                <button className="ghost" style={{ flex: "0 0 auto", padding: "12px 16px" }} onClick={() => setGoalDetail(null)}>Cancel</button>
                <button className="pbtn" style={{ justifyContent: "center", flex: 1 }} onClick={save}>Save</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
