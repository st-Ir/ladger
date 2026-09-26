"use client";

import { useLedger } from "@/lib/store";
import { makeFormat } from "@/lib/format";
import type { View } from "@/lib/derive";
import EquityChart from "../EquityChart";
import { usePriceFeed } from "../usePriceFeed";
import { useMacroFeed } from "../useMacroFeed";

/** Two-digit spec index, the numbering the dashboard uses for its sections. */
const ix = (n: number) => String(n).padStart(2, "0");

export default function Portfolio({ v }: { v: View }) {
  const st = useLedger();
  usePriceFeed(v.pfUnlocked);
  // Four of the six macro panels need no network at all, so the feed only runs
  // while the tab that uses the other two is actually open.
  useMacroFeed(v.pfUnlocked && v.pf.macro);

  if (v.pfLocked) {
    return (
      <div className="lock" style={{ backgroundImage: v.pfBgCss }}>
        <div className="lockov" />
        <div className="lockcard">
          <div className="lockkick">Sec // Portfolio</div>
          <div className="lockic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
          <div className="lockt">Portfolio Locked</div>
          <div className="locksub">Enter your passcode to continue</div>
          <input
            className="lockin"
            type="password"
            value={v.lockInput}
            onInput={(e) => st.onLockInput((e.target as HTMLInputElement).value)}
            onChange={() => {}}
            onKeyDown={(e) => {
              if (e.key === "Enter") st.tryUnlock();
            }}
            placeholder="••••"
          />
          <div className="lockerr">{v.lockErrMsg}</div>
          <button className="lockbtn" onClick={st.tryUnlock}>Unlock</button>
          <div className="lockfoot">
            <span className="bcode">LOCK-01</span>
            <div className="bmk" />
            <span className="bcode">SEC<span className="breg">®</span></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bento pfpage">
      <div className="pfhead">
        <div className="subtab">
          {v.pfTabs.map((p) => (
            <button className={p.cls} key={p.id} onClick={() => st.setPf(p.id as any)}>{p.label}</button>
          ))}
        </div>
        <div className="spacer" />
        <span className="pfstat" title={v.priceBadgeTitle}>
          <span
            className="pfdot"
            style={{
              background: v.priceBadge.dot,
              boxShadow: v.priceStatus === "live" ? "0 0 8px " + v.priceBadge.dot : "none",
            }}
          />
          {v.priceBadge.text}
        </span>
      </div>

      {v.pf.pnl && <PnL v={v} />}
      {v.pf.strategy && <Strategy v={v} />}
      {v.pf.rebalance && <Rebalance v={v} />}
      {v.pf.macro && <Macro v={v} />}

      <div className="bfoot">© 2026 Ledger — Money OS · Portfolio</div>
    </div>
  );
}

function PnL({ v }: { v: View }) {
  const st = useLedger();
  const fm = makeFormat(v.cur);
  const tone = v.f.pfPnlCls === "up" ? "pos" : "neg";
  const arrow = v.f.pfPnlCls === "up" ? "▲" : "▼";
  const realized = v.journalStats[1];

  return (
    <>
      {/* ============ BAND 1 — market value hero + best/worst ============ */}
      <div className="bband pfb1">
        <div className="bhero">
          <div className="htop">
            <div>
              <div className="hidx">01</div>
              <div className="hlbl">Portfolio // Market Value</div>
              <div className="hbadge"><span className="hd" /> {v.positions.length} POS · MARK TO MARKET</div>
            </div>
            {/* Every buy and sell starts here — the positions ledger below stays read-only. */}
            <div className="hacts">
              {v.hasPositions && (
                <button className="harrow ghostal" onClick={st.openSell} title="Sell">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}>
                    <path d="M5 12h14" />
                  </svg>
                </button>
              )}
              <button className="harrow" onClick={st.openInvest} title="Invest">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>

          <div className="bnum">{v.f.pfValue}</div>
          <div className="hchgs">
            <span className={"hchg " + tone} title="Unrealized profit and loss on the asset price">
              {arrow} {v.f.pfPnl} <span className="hchgu">{v.f.pfPnlPct}</span>
            </span>
            {v.feat.fx && (
              <span
                className={"hchg " + (v.f.pfFxCls === "up" ? "pos" : "neg")}
                title="Selisih nilai rupiah portfolio: biaya USD pada kurs sekarang vs kurs saat dibeli"
              >
                <span className="hchgk">FX</span> {v.f.pfFx} <span className="hchgu">KURS</span>
              </span>
            )}
          </div>

          {/* Realized, not mark-to-market — the hero number above is the live
              value, this is what the closed trades actually booked. */}
          <div className="hchart">
            <div className="hckick">
              <span>Realized P&amp;L</span>
              <span className="bcode">26W</span>
            </div>
            <EquityChart series={v.pfEquity} fmt={(n) => fm.sfmt(n)} uid="pfeg" />
            <div className="baxis">
              {v.pfEquityAxis.map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </div>
          </div>

          <div className="badsr" title="Weight of each position">
            {v.positions.map((p, i) => (
              <div className="abw" key={i}>
                <div className="ab" style={{ height: p.weight }} />
                <span className="abl">{p.sym[0]}</span>
              </div>
            ))}
          </div>

          <div className="bmini">
            <div className="bminc">
              <div className="mk">Cost</div>
              <div className="mv">{v.f.pfCost}</div>
            </div>
            <div className="bminc">
              <div className="mk">Positions</div>
              <div className="mv">{v.positions.length}</div>
            </div>
            <div className="bminc">
              <div className="mk">Realized</div>
              <div className="mv">{realized?.v}</div>
            </div>
          </div>

          <div className="bherofoot">
            <span className="bcode">#PF-MTM-{v.positions.length ? ix(v.positions.length) : "00"}</span>
            <div className="bmk" />
            <span className="bcode">LIVE<span className="breg">®</span></span>
          </div>
        </div>

        <div className="btile pf-a">
          <span className="twm">02</span>
          <div className="tlbl"><span>Best position</span><span>▲</span></div>
          <div className="tbot">
            <div className="tnum tsym" style={{ color: "var(--acc)" }}>{v.f.bestSym}</div>
            <div className="tmeta up">{v.f.bestPct}</div>
            <div className="tacc" style={{ background: "var(--acc)" }} />
          </div>
        </div>
        <div className="btile pf-b">
          <span className="twm">03</span>
          <div className="tlbl"><span>Worst position</span><span>▼</span></div>
          <div className="tbot">
            <div className="tnum tsym" style={{ color: "var(--acc)" }}>{v.f.worstSym}</div>
            <div className={"tmeta " + v.f.worstCls}>{v.f.worstPct}</div>
            <div className="tacc" style={{ background: "var(--acc)" }} />
          </div>
        </div>

        {/* 04 — positions ledger, tucked under 02/03 beside the hero */}
        <div className="bcard marks tblc pf-c">
          <div className="bkick">
            <span className="bix">04</span> Positions <span className="kln" />
            <span className="bcode">Weight = share of portfolio</span>
          </div>
          <table className="tbl postbl">
            <thead>
              <tr>
                <th>Asset<span className="th2">Qty</span></th>
                <th className="r">Avg<span className="th2">Cost</span></th>
                <th className="r">Price now<span className="th2">Value</span></th>
                <th className="r">PnL<span className="th2">%</span></th>
                <th className="r">Weight</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {v.positions.map((p, i) => (
                <tr key={i}>
                  <td>
                    <span className="sym">{p.sym}</span>
                    {p.venue && <span className={"venue" + (p.noQuote ? " warn" : "")}>{p.venue}</span>}
                    {p.noQuote && (
                      <span className="venue warn" title="Belum ada kutipan untuk simbol ini — kemungkinan bursanya salah">
                        no quote
                      </span>
                    )}
                    <span className="cell2 mono">{p.qty}</span>
                  </td>
                  <td className="r mono">
                    <b>{p.avg}</b>
                    <span className="cell2">{p.invested}</span>
                  </td>
                  <td className="r mono">
                    <b>{p.cur}</b>
                    <span className="cell2">{p.value}</span>
                  </td>
                  <td className="r mono">
                    <b className={p.cls}>{p.pnl}</b>
                    <span className={"cell2 " + p.cls}>{p.pct}</span>
                  </td>
                  <td className="r mono">
                    <b style={{ color: "var(--acc)" }}>{p.weight}</b>
                    <span className="wbar"><i style={{ width: p.weightW }} /></span>
                  </td>
                  <td className="r"><button className="gsm" title="Update market price" onClick={() => st.openPosPrice(p.sym)}>⟳</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============ BAND 3 — trade journal: stats, calendar and log in one ============ */}
      <div className="bcard marks tblc jcard">
        <div className="bkick">
          <span className="bix">05</span> Trade Journal <span className="kln" />
          <span className="bcode">Auto-logged from sells &amp; closed orders</span>
        </div>

        <div className="jstats">
          {v.journalStats.map((s, i) => (
            <div className="jstat" key={i}>
              <div className="jk">{s.k}</div>
              <div className={"jv " + s.cls}>{s.v}</div>
              <div className="jm">{s.meta}</div>
            </div>
          ))}
        </div>

        {/* calendar left, log right — both read the same closed trades */}
        <div className="jgrid">
          <div className="jheat">
            <Heatmap v={v} />
          </div>

          <div className="jlog">
            {v.journalEmpty ? (
              <div className="empty jempty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                  <path d="M4 6h16M4 12h16M4 18h10" />
                </svg>
                <div>No closed trades yet — selling a position or closing an order writes the entry here.</div>
              </div>
            ) : (
              <table className="tbl jtbl">
                <thead>
                  <tr>
                    <th>Date<span className="th2">Side</span></th>
                    <th>Asset<span className="th2">Qty</span></th>
                    <th className="r">Entry<span className="th2">Exit</span></th>
                    <th className="r">Move<span className="th2">Held</span></th>
                    <th className="r">Realized<span className="th2">Fee</span></th>
                    <th className="r">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {v.journal.map((j, i) => (
                    <tr key={i}>
                      <td className="mono sub">
                        {j.date}
                        <span className="cell2">{j.side}</span>
                      </td>
                      <td title={j.note}>
                        <span className="sym">{j.sym}</span>
                        <span className="cell2 mono">{j.qty}</span>
                      </td>
                      <td className="r mono">
                        <b>{j.entry}</b>
                        <span className="cell2">{j.exit}</span>
                      </td>
                      <td className="r mono">
                        <b className={j.cls}>{j.move}</b>
                        <span className="cell2">{j.held}</span>
                      </td>
                      <td className="r mono">
                        <b className={j.cls}>{j.pnl}</b>
                        <span className="cell2">{j.fee}</span>
                      </td>
                      <td className="r"><span className={"chip " + j.resCls}>{j.result}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Realized PnL per day for the last 26 weeks — week columns, weekday rows. */
function Heatmap({ v }: { v: View }) {
  return (
    <div className="hmwrap">
      <div className="hmgrid">
        <div className="hmdays">
          {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="hmcols">
          <div className="hmmonths">
            {v.journalHeat.months.map((m, i) => (
              <span key={i} style={{ gridColumn: m.col + 1 }}>{m.label}</span>
            ))}
          </div>
          <div className="hmweeks">
            {v.journalHeat.weeks.map((w) => (
              <div className="hmweek" key={w.key}>
                {w.days.map((d) => (
                  <i
                    key={d.key}
                    className={"hmc" + (d.sign ? " " + d.sign : "") + (d.future ? " fut" : "")}
                    data-lvl={d.lvl}
                    title={d.title}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="hmlegend">
        <span className="bcode">Loss</span>
        {[4, 3, 2, 1].map((l) => (
          <i className="hmc neg" data-lvl={l} key={"n" + l} />
        ))}
        <i className="hmc" data-lvl={0} />
        {[1, 2, 3, 4].map((l) => (
          <i className="hmc pos" data-lvl={l} key={"p" + l} />
        ))}
        <span className="bcode">Profit</span>
      </div>
    </div>
  );
}

function Strategy({ v }: { v: View }) {
  const st = useLedger();
  return (
    <>
      <div className="bcard">
        <div className="bkick">
          <span className="bix">01</span> Orderbook <span className="kln" />
          <button className="gsm" onClick={st.openOrder}>+ New order</button>
        </div>
        <div className="hint" style={{ marginTop: 0 }}>
          Each order commits real money from your funds against a fixed entry, take-profit and stop-loss — every field required. This is your plan on the record, so later emotion can&apos;t quietly rewrite it.
        </div>
        <div className="ftab" style={{ marginTop: 14 }}>
          {v.planFilters.map((fl) => (
            <button className={fl.cls} key={fl.id} onClick={() => st.setPlanFilter(fl.id)}>{fl.label}</button>
          ))}
        </div>
      </div>

      <div className="pfauto">
        {v.plans.map((p, i) => (
          <div className="stratc" key={p.id}>
            <div className="stctop">
              <span className="bcode">ORD-{ix(i + 1)}</span>
              <span className={"chip " + p.statusCls}>{p.statusLabel}</span>
            </div>
            <div className="stcnm">
              <span className="sym" style={{ fontSize: 15 }}>{p.asset}</span>
              <span className={"chip " + p.sideCls}>{p.side}</span>
            </div>
            <div className="plvls">
              <div className="plvl"><div className="plvlk">Entry</div><div className="plvlv">{p.entry}</div></div>
              <div className="plvl"><div className="plvlk">Take Profit</div><div className="plvlv up">{p.tp}</div></div>
              <div className="plvl"><div className="plvlk">Stop Loss</div><div className="plvlv dn">{p.sl}</div></div>
              <div className="plvl"><div className="plvlk">Price now</div><div className="plvlv">{p.price}</div></div>
            </div>
            <div className="ordmeta">
              <div className="omrow"><span className="omk">Committed</span><span className="omv">{p.capital}</span></div>
              <div className="omrow"><span className="omk">Quantity</span><span className="omv">{p.qty}</span></div>
              <div className="omrow"><span className="omk">Funded from</span><span className="omv">{p.src}</span></div>
              <div className="omrow"><span className="omk">Risk · Reward</span><span className="omv"><b className="dn">{p.riskAmt}</b> · <b className="up">{p.rewardAmt}</b></span></div>
              <div className="omrow"><span className="omk">R:R · vs entry</span><span className="omv">{p.rr} · {p.dist}</span></div>
            </div>
            <p className="stcth">{p.thesis}</p>
            <div className="pacts">
              <button className="gsm" onClick={() => st.openPlanEval(p.id)}>Update price</button>
              {p.canClose && <button className="gsm" onClick={() => st.openCloseOrder(p.id)}>Close</button>}
              <button className="gsm dgr" onClick={() => st.delPlan(p.id)}>Delete</button>
            </div>
          </div>
        ))}
        <div className="stratc pln" onClick={st.openOrder}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, lineHeight: 1 }}>+</div>
            <div className="bcode" style={{ marginTop: 6 }}>New order</div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * What the world did to this book — see `docs/macro.md`.
 *
 * Six panels in four tenses: what already moved the money (01, 02), what is
 * touching it now (03), what would break if a price moved (04), the currency
 * position your *life* runs whether you think of it that way or not (05), and
 * what you thought at the time, measured since (06).
 *
 * Nothing here is a market dashboard. A number appears only when it touches
 * something actually held, and nothing on this tab recommends anything — that
 * is the rebalancing tab's job, where the user's own targets decide.
 */
function Macro({ v }: { v: View }) {
  const st = useLedger();
  const a = v.macroAttr;
  const sh = v.macroShock;

  return (
    <>
      {/* ---- 01 · what actually moved the money ---- */}
      <div className="bcard">
        <div className="bkick">
          <span className="bix">01</span> Atribusi <span className="kln" />
          <span className="bcode">{a.window}</span>
        </div>

        {a.empty ? (
          <div className="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M3 17l6-6 4 4 8-8" />
            </svg>
            <div>Belum ada arus 30 hari terakhir.</div>
          </div>
        ) : (
          <>
            <div className="mchead">
              <div className={"mcbig " + a.changeCls}>{a.change}</div>
              <span className={"chip " + (a.changeCls === "up" ? "c-up" : "c-dn")}>{a.changePct}</span>
              <span className="bcode mcfrom">{a.open} → {a.close}</span>
            </div>

            {/* Saving is you; the rate is the world. They are not the same fact. */}
            <div className="mcstack">
              {a.legs.map((l, i) => (
                <i key={i} className={l.cls} style={{ width: l.w }} title={l.k} />
              ))}
            </div>
            <div className="mclegs">
              {a.legs.map((l, i) => (
                <div className="mcleg" key={i}>
                  <span className="mck">{l.k}</span>
                  <span className={"mcv " + l.cls}>{l.v}</span>
                  <span className="mcn">{l.note}</span>
                </div>
              ))}
            </div>

            {a.priceBlind && <div className="hint">Harga pasar tidak dihitung di jendela ini — tidak ada riwayat harga tersimpan.</div>}

            {a.life.length > 0 && (
              <div className="mclife">
                <div className="mclt">Sejak awal</div>
                {a.life.map((r, i) => (
                  <div className="mclrow" key={i}>
                    <span className="mck">{r.k}</span>
                    <span className={"mcv " + r.cls}>{r.v}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- 02 · the rate you actually got ---- */}
      {v.macroRate.show && (
        <div className="bcard">
          <div className="bkick">
            <span className="bix">02</span> Kurs yang kamu dapat <span className="kln" />
            <span className="bcode">{v.macroRate.points} titik</span>
          </div>

          <div className="mcrate">
            <svg viewBox={`0 0 ${v.macroRate.w} ${v.macroRate.h}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="mcrg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--acc)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--acc)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={v.macroRate.area} fill="url(#mcrg)" />
              <path d={v.macroRate.line} fill="none" stroke="var(--acc)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {/* The whole answer to "did I buy dollars well" is the gap between
                  this line and that curve. */}
              {v.macroRate.avgY && (
                <line x1="0" x2={v.macroRate.w} y1={v.macroRate.avgY} y2={v.macroRate.avgY} stroke="var(--tx)" strokeWidth={1} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" opacity="0.65" />
              )}
            </svg>
            <span className="mcry hi">{v.macroRate.hiLabel}</span>
            <span className="mcry lo">{v.macroRate.loLabel}</span>
          </div>
          <div className="baxis">
            {v.macroRate.axis.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>

          <div className="mcrfoot">
            <div className="mcrcell">
              <div className="mck">Spot</div>
              <div className="mcv mono">{v.macroRate.spotLabel}</div>
            </div>
            <div className="mcrcell">
              <div className="mck">Kurs perolehan</div>
              <div className="mcv mono">{v.macroRate.hasAvg ? v.macroRate.avgLabel : "—"}</div>
            </div>
            <div className="mcrcell">
              <div className="mck">Selisih</div>
              <div className={"mcv mono " + v.macroRate.gapCls}>{v.macroRate.gap || "—"}</div>
              {v.macroRate.gapAmt && <div className={"mcn " + v.macroRate.gapCls}>{v.macroRate.gapAmt}</div>}
            </div>
          </div>
          <div className="hint">{v.macroRate.note}</div>
        </div>
      )}

      {/* ---- 03 · exposure that pays rent ---- */}
      <div className="bcard">
        <div className="bkick">
          <span className="bix">03</span> Paparan <span className="kln" />
          <span className="pfstat" title="Kutipan driver, disegarkan tiap 15 menit">
            <span className="pfdot" style={{ background: v.macroBadge.dot }} />
            {v.macroBadge.text}
          </span>
        </div>

        {v.macroDrivers.length === 0 ? (
          <div className="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 010 18a15 15 0 010-18" />
            </svg>
            <div>Belum ada harga luar yang menyentuh isi bukumu.</div>
          </div>
        ) : (
          <div className="list">
            {v.macroDrivers.map((d) => (
              <div className="rw mcdrv" key={d.id}>
                <span className="rdot mono mcdt">{d.tag}</span>
                <div className="mcdmain">
                  <div className="rname">{d.name}</div>
                  <div className="rmeta">
                    <span className="mono">{d.ticker}</span> · {d.share} dari net worth
                    {d.touches && <> · {d.touches}</>}
                  </div>
                  <div className="bar mcdbar"><div className="barf" style={{ width: d.shareW }} /></div>
                </div>
                <div className="mcdr">
                  <div className={"ramt " + d.chgCls}>{d.chg}</div>
                  <div className="rmeta mono">{d.price}</div>
                  {/* Only the currency row converts into money — everything else
                      would need a beta this app can't compute. */}
                  {d.money && <div className={"mcdmoney " + d.moneyCls}>{d.money}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="hint">Baris muncul kalau menyentuh posisi yang kamu punya. Hanya kurs yang bisa jadi rupiah — sisanya gerak indeks dan bobotnya.</div>
      </div>

      {/* ---- 04 · shock test ---- */}
      <div className="bcard">
        <div className="bkick">
          <span className="bix">04</span> Uji guncangan <span className="kln" />
          {!sh.idle && <button className="gsm" onClick={st.resetShock}>Reset</button>}
        </div>

        {!sh.show ? (
          <div className="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M13 2L3 14h8l-1 8 10-12h-8z" />
            </svg>
            <div>Belum ada posisi untuk diguncang.</div>
          </div>
        ) : (
          <>
            <div className="mcsliders">
              {sh.sliders.map((s) => (
                <div className="mcsl" key={s.key}>
                  <div className="mcslhd">
                    <span className="mck">{s.label}</span>
                    <span className={"mcslv mono " + (s.val > 0 ? "up" : s.val < 0 ? "dn" : "")}>{s.out}</span>
                  </div>
                  <input
                    className="mcrange"
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={1}
                    value={s.val}
                    onChange={(e) => st.setShock({ [s.key]: Number(e.target.value) } as any)}
                  />
                </div>
              ))}
            </div>

            <div className="mcshres">
              <div className="mcshhd">
                <div>
                  <div className="mck">Net worth</div>
                  <div className="mcbig sm">{sh.netAfter}</div>
                  <div className="bcode">dari {sh.net}</div>
                </div>
                <div className="mcshdelta">
                  <div className={"mcbig sm " + sh.deltaCls}>{sh.delta}</div>
                  <span className={"chip " + (sh.deltaCls === "up" ? "c-up" : "c-dn")}>{sh.deltaPct}</span>
                </div>
              </div>

              <div className="mcshlegs">
                {sh.legs.map((l, i) => (
                  <div className="mcshleg" key={i}>
                    <span className="mck">{l.k}</span>
                    <span className={"mcv mono " + l.cls}>{l.v}</span>
                  </div>
                ))}
                <div className="mcshleg">
                  <span className="mck">Runway</span>
                  <span className={"mcv mono " + sh.runwayCls}>{sh.runway} → {sh.runwayAfter}</span>
                </div>
                <div className="mcshleg">
                  <span className="mck">Kurs</span>
                  <span className="mcv mono">{sh.rateAfter}</span>
                </div>
              </div>

              {sh.noBook ? (
                <div className="hint">Belum ada target book — band dan biaya koreksi belum bisa dihitung.</div>
              ) : (
                <>
                  {sh.breaches.length > 0 && (
                    <div className="mcbreach">
                      {sh.breaches.map((b) => (
                        <div className="mcbrow" key={b.id}>
                          <span className="rdot mcbdot" style={{ background: b.color }} />
                          <span className="rname">{b.name}</span>
                          {b.fresh && <span className="chip c-dn">baru</span>}
                          <span className={"mono mcbd " + b.driftCls}>{b.drift}</span>
                          <span className="mono mcbn">{b.need}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mcfund">
                    <div className="mcfrow">
                      <span className="mck">Beli yang dibutuhkan</span>
                      <span className="mcv mono">{sh.buys}</span>
                    </div>
                    <div className="mcfrow">
                      <span className="mck">Kas menganggur</span>
                      <span className="mcv mono">{sh.idleCash}</span>
                    </div>
                    <div className="mcfrow">
                      <span className="mck">Biaya koreksi</span>
                      <span className="mcv mono">{sh.cost}</span>
                    </div>
                    <div className={"mcfnote " + (sh.funded ? "up" : "dn")}>{sh.fundNote}</div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
        <div className="hint">Kamu yang menentukan guncangannya, aplikasi cuma menghitung. Tidak ada peluang, tidak ada skenario sejarah — tiap slider berdiri sendiri.</div>
      </div>

      {/* ---- 05 · mismatch & runway ---- */}
      {v.macroMismatch.show && (
        <div className="bcard">
          <div className="bkick">
            <span className="bix">05</span> Ketimpangan <span className="kln" />
            <span className="bcode">{v.macroMismatch.months} bln terakhir</span>
          </div>

          {v.macroMismatch.empty ? (
            <div className="empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <path d="M4 18V6M20 18V6M4 12h16" />
              </svg>
              <div>Belum ada pemasukan atau pengeluaran tercatat.</div>
            </div>
          ) : (
            <>
              <div className="mcmm">
                {v.macroMismatch.rows.map((r, i) => (
                  <div className="mcmrow" key={i}>
                    <span className="mck">{r.k}</span>
                    <div className="bar mcmbar"><div className="barf" style={{ width: r.w }} /></div>
                    <span className="mcv mono">{r.v}</span>
                  </div>
                ))}
              </div>
              <div className="mcrfoot">
                <div className="mcrcell">
                  <div className="mck">Kas likuid</div>
                  <div className="mcv mono">{v.macroMismatch.liquid}</div>
                </div>
                <div className="mcrcell">
                  <div className="mck">Belanja / bln</div>
                  <div className="mcv mono">{v.macroMismatch.spend}</div>
                </div>
                <div className="mcrcell">
                  <div className="mck">Runway</div>
                  <div className="mcv mono">{v.macroMismatch.runway}{v.macroMismatch.hasRunway && " bln"}</div>
                </div>
              </div>
            </>
          )}
          <div className="hint">Kamu dapat rupiah, nabung dolar. Ini posisi mata uang hidupmu, bukan portofoliomu.</div>
        </div>
      )}

      {/* ---- 06 · the log ---- */}
      <div className="bcard">
        <div className="bkick">
          <span className="bix">06</span> Catatan <span className="kln" />
          <button className="gsm" onClick={() => st.openNote()}>+ Catatan</button>
        </div>

        {v.macroLog.length === 0 ? (
          <div className="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M5 4h11l3 3v13H5z" />
              <path d="M8 10h8M8 14h5" />
            </svg>
            <div>Belum ada catatan. Tulis bacaanmu — aplikasi yang mengukurnya.</div>
          </div>
        ) : (
          <div className="list">
            {v.macroLog.map((n) => (
              <div className="rw mcnote" key={n.id}>
                <div className="mcnmain">
                  <div className="rname">
                    {n.title} <span className={n.readCls}>{n.read}</span>
                  </div>
                  <div className="rmeta">
                    {n.date} · {n.days}
                    {n.source && <> · {n.source}</>}
                  </div>
                  {n.body && <p className="mcnbody">{n.body}</p>}
                  {/* Not a score — a measurement, from the day you wrote it. */}
                  {n.syms.length > 0 && (
                    <div className="mctags">
                      {n.syms.map((s) => (
                        <span className={"mctag" + (s.held ? "" : " gone")} key={s.sym}>
                          <b>{s.sym}</b> <i className={s.cls}>{s.pct}</i>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mcnacts">
                  <button className="gsm" onClick={() => st.openNote(n.id)}>Ubah</button>
                  <button className="gsm dgr" onClick={() => st.delNote(n.id)}>Hapus</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Rebalance({ v }: { v: View }) {
  const st = useLedger();

  // A book is the whole feature's precondition — without one there is nothing to
  // measure against, and guessing a target would be the app picking a strategy.
  if (v.rebalNoBook)
    return (
      <div className="bcard">
        <div className="bkick">
          <span className="bix">01</span> Target book <span className="kln" />
        </div>
        <div className="empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M4 5h7v14H4zM13 5h7v14h-7z" />
          </svg>
          <div>Belum ada target book.</div>
          <button className="pbtn" style={{ marginTop: 14, maxWidth: 220 }} onClick={st.openBookEdit}>Buat target book</button>
        </div>
      </div>
    );

  return (
    <>
      <div className="bcard marks tblc">
        <div className="bkick">
          <span className="bix">01</span> Sleeve <span className="kln" />
          <span className="bcode">{v.rebalBookName} · {v.f.pfValue}</span>
          {v.rebalBookOpts.length > 1 && (
            <select className="rbsel" value={v.rebalBookId} onChange={(e) => st.setBook(e.target.value)}>
              {v.rebalBookOpts.map((o) => (
                <option key={o.val} value={o.val}>{o.label}</option>
              ))}
            </select>
          )}
          <button className="gsm" onClick={st.openBookEdit}>Ubah</button>
        </div>

        {v.rebalWeightOff && <div className="rbwarn">Bobot sleeve total {v.rebalWeightSum} — belum 100.</div>}

        <table className="tbl">
          <thead>
            <tr>
              <th>Sleeve</th>
              <th className="r">Nilai</th>
              <th className="r">Sekarang</th>
              <th className="r">Target</th>
              <th style={{ width: 190 }}>Drift · band</th>
              <th className="r">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {v.rebal.map((r) => (
              <tr key={r.id} className={r.child ? "rbsub" : ""}>
                <td>
                  {r.child ? (
                    <span className="rbtree" style={{ color: r.color }}>↳</span>
                  ) : (
                    <span className="rbdot" style={{ background: r.color }} />
                  )}
                  <span className={"sym" + (r.child ? " mono" : "")}>{r.name}</span>
                  {r.lock && <span className="chip c-mut rblock">{r.lock}</span>}
                </td>
                <td className="r mono">{r.value}</td>
                <td className="r mono">{r.now}</td>
                <td className="r mono" style={{ color: "var(--mut)" }}>{r.target}</td>
                <td>
                  {/* The band as a zone, so "inside" is something you can see. */}
                  <div className="bar rbbar">
                    <div className="rbzone" style={{ left: r.bandL, width: r.bandW }} />
                    <div className="barf" style={{ width: r.w, background: r.color }} />
                    <div className="rbmark" style={{ left: r.mark }} />
                  </div>
                  <div className="rbdrift">
                    <span className={r.driftCls}>{r.drift}</span>
                    <span className="rbband">{r.band}</span>
                    {r.fx && <span className="rbfx" title="Bagian drift yang digerakkan kurs, bukan oleh kamu">{r.fx}</span>}
                  </div>
                </td>
                <td className="r">
                  <span className={"chip " + r.actionCls}>{r.action}</span>
                  <div className="mono rbamt">{r.actionAmt}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Positions the book doesn't know about are the main way a rebalancer
            lies to you, so they get a row with their real weight. */}
        {v.rebalLoose.length > 0 && (
          <div className="rbloose">
            <div className="rblhd">Unassigned</div>
            {v.rebalLoose.map((u) => (
              <div className="rblrow" key={u.sym}>
                <span className="mono rblsym">{u.sym}</span>
                <span className="mono rblpct">{u.now}</span>
                <span className="rblwhy" title={u.reason}>{u.reason}</span>
                {u.canAccept && (
                  <button className="rblsug" onClick={() => st.fileSymbol(u.sym, u.sleeveId)}>{u.role} ?</button>
                )}
                <select className="inp rblsel" value="" onChange={(e) => e.target.value && st.fileSymbol(u.sym, e.target.value)}>
                  <option value="">Pilih…</option>
                  {v.rebalSleeveOpts.map((o) => (
                    <option key={o.val} value={o.val}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bcard">
        <div className="bkick">
          <span className="bix">02</span> Rencana <span className="kln" />
          <span className="bcode">{v.rebalCost}</span>
          <button className={"gsm" + (v.rebalCashFirst ? " on" : "")} onClick={st.toggleCashFirst} title="Pakai kas menganggur sebelum menjual">
            Kas dulu {v.rebalCashFirst ? "· on" : "· off"}
          </button>
        </div>

        {/* Information yes, action no. */}
        {v.rebalNotPriced && (
          <div className="rbstale">
            Harga tidak terpakai{v.rebalMissing.length ? " · " + v.rebalMissing.join(", ") : ""} — rencana ditampilkan, eksekusi dimatikan.
          </div>
        )}

        {v.rebalOnTarget && (
          <div className="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M9 11l3 3 8-8" />
              <path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9" />
            </svg>
            <div>Semua sleeve di dalam band-nya.</div>
          </div>
        )}

        {v.rebalEmpty && <div className="empty"><div>Belum ada posisi.</div></div>}

        {v.rebalGroups.map((g) => (
          <div className="rbgrp" key={g.account}>
            <div className="rbghd">
              <span className="rbgnm">{g.account}</span>
              <span className="bcode">{g.broker}</span>
              <span className="mono rbgcost">{g.cost}</span>
            </div>
            <div className="list">
              {g.moves.map((m) => (
                <div className={"rw rbmove" + (m.tradable ? "" : " dead")} key={m.id}>
                  <span className="rdot" style={{ background: m.color }} />
                  <div>
                    <div className="rname">{m.title}{m.cross && <span className="chip c-mut rbcross">lintas akun</span>}</div>
                    <div className="rmeta">
                      {m.sub}
                      {m.qty && <span className="mono"> · {m.qty}</span>}
                      {m.fee && <span> · {m.fee}</span>}
                      {m.feeNote && <span> · {m.feeNote}</span>}
                      {m.lotNote && <span className="rblot"> · {m.lotNote}</span>}
                    </div>
                  </div>
                  <span className={"ramt " + m.cls}>{m.amt}</span>
                  {m.tradable && (
                    <button className="gsm rbgo" disabled={!v.canExecute} onClick={() => st.execMove(m._m)}>
                      {m.kind === "transfer" ? "Transfer" : m.kind === "buy" ? "Beli" : "Jual"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* A fundable problem, stated — not a sell proposed somewhere unrelated. */}
        {v.rebalGaps.length > 0 && (
          <div className="rbgaps">
            {v.rebalGaps.map((g, i) => (
              <div className="rbgap" key={i}>
                <span className="mono rblsym">{g.name}</span>
                <span className="rbgapt">{g.text}</span>
                <span className="rbgapr">{g.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
