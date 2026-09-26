"use client";

import { useLedger } from "@/lib/store";
import type { View } from "@/lib/derive";

export default function QuickAdd({ v }: { v: View }) {
  const st = useLedger();
  if (!v.quickOpen) return null;

  const f = v.form;
  const set = (name: string) => (e: any) => st.onField(name, e.target.value);

  return (
    <div className="ov" onClick={st.close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhd">
          <div>
            <div className="mtl">{v.quickTitle}</div>
            <div className="msub">{v.quickSub}</div>
          </div>
          <button className="xbtn" onClick={st.close}>×</button>
        </div>
        <div className="mbd">
          {/* HUB */}
          {v.qHub && (
            <div>
              {v.noPresets && (
                <div className="empty" style={{ padding: "14px 6px 24px" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                    <path d="M13 2L4.5 13.5H11l-.5 8L19 10h-6.5z" />
                  </svg>
                  <div style={{ fontWeight: 600, color: "var(--tx)" }}>No buttons yet</div>
                  <div className="hint">Add a <b style={{ color: "var(--tx)" }}>quick button</b> to log in one tap, or a <b style={{ color: "var(--tx)" }}>recurring</b> transaction that runs on its own.</div>
                </div>
              )}
              {v.hasRec && (
                <div>
                  <div className="qsec">Recurring</div>
                  <div className="qlist">
                    {v.recPresets.map((p) => (
                      <div className="qrow" key={p.id}>
                        <span className="qdel" onClick={(e) => { e.stopPropagation(); st.delPreset(p.id); }}>×</span>
                        <span className="qic" style={{ background: p.iconBg, color: p.iconFg }}>{p.icon}</span>
                        <div className="qtx">
                          <div className="qlbl">{p.label}</div>
                          <div className="qmeta">{p.schedule} · <span className={p.cls}>{p.amt}</span></div>
                        </div>
                        <div className="qnext">
                          <div className="qnextk">Next run</div>
                          <div className="qnextv">{p.next}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {v.hasTap && <div className="qsec gap">Quick buttons</div>}
              <div className="qgrid">
                {v.tapPresets.map((p) => (
                  <div className="qtile" key={p.id} onClick={() => st.quickLog(p.id)}>
                    <span className="qdel" onClick={(e) => { e.stopPropagation(); st.delPreset(p.id); }}>×</span>
                    <span className="qic" style={{ background: p.iconBg, color: p.iconFg }}>{p.icon}</span>
                    <div className="qtx">
                      <div className="qlbl">{p.label}</div>
                      <div className={"qamt " + p.cls}>{p.amt}</div>
                    </div>
                  </div>
                ))}
                <div className="qtile qnew" onClick={st.newPreset}>
                  <span className="plus">+</span>
                  <span className="pl2">New</span>
                </div>
              </div>
            </div>
          )}

          {/* CHOOSE */}
          {v.qChoose && (
            <div className="qchoose">
              <div className="qopt" onClick={() => st.chooseMode("tap")}>
                <span className="qoptic">⚡</span>
                <div style={{ minWidth: 0 }}>
                  <div className="qopth">Quick button</div>
                  <div className="qoptd">A one-tap button you press to log a transaction instantly, whenever you want.</div>
                </div>
                <span className="qoptar">→</span>
              </div>
              <div className="qopt" onClick={() => st.chooseMode("recurring")}>
                <span className="qoptic">↻</span>
                <div style={{ minWidth: 0 }}>
                  <div className="qopth">Recurring</div>
                  <div className="qoptd">Logs itself on a schedule — daily, weekly, or monthly on the date you set. Great for salary or rent.</div>
                </div>
                <span className="qoptar">→</span>
              </div>
            </div>
          )}

          {/* NEW BUILDER */}
          {v.qNew && (
            <div>
              <Field label="Button label">
                <input className="inp" value={f.label ?? ""} onChange={set("label")} placeholder="e.g. Morning coffee" />
              </Field>
              <Field label="Type">
                <div className="seg">
                  <button className={v.kindCls.expense} onClick={() => st.setBuilderKind("expense")}>Expense</button>
                  <button className={v.kindCls.income} onClick={() => st.setBuilderKind("income")}>Income</button>
                  <button className={v.kindCls.transfer} onClick={() => st.setBuilderKind("transfer")}>Transfer</button>
                </div>
              </Field>

              {v.builderExpense && (
                <div>
                  <Field label="Category">
                    <div className="seg">
                      {v.catSeg.map((c) => (
                        <button className={c.cls} key={c.id} onClick={() => st.setFormCat(c.id)}>{c.label}</button>
                      ))}
                    </div>
                  </Field>
                  <div className="frow">
                    <Field label={`Amount (${v.cur})`}>
                      <input className="inp mono" value={f.amount ?? ""} onChange={set("amount")} placeholder="0" inputMode="decimal" />
                    </Field>
                    <Field label="From wallet">
                      <select className="inp" value={f.wallet ?? ""} onChange={set("wallet")}>
                        {v.wallets.map((w) => (
                          <option value={w.name} key={w.idx}>{w.name}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {v.builderIncome && (
                <div>
                  <div className="frow">
                    <Field label={`Amount (${v.cur})`}>
                      <input className="inp mono" value={f.amount ?? ""} onChange={set("amount")} placeholder="0" inputMode="decimal" />
                    </Field>
                    <Field label="Into vault">
                      <select className="inp" value={f.account ?? ""} onChange={set("account")}>
                        {v.accounts.map((a, i) => (
                          <option value={a.name} key={i}>{a.name}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {v.builderTransfer && (
                <div>
                  <div className="frow">
                    <Field label="From">
                      <select className="inp" value={f.from ?? ""} onChange={set("from")}>
                        {v.transferOpts.map((o, i) => (
                          <option value={o.val} key={i}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="To">
                      <select className="inp" value={f.to ?? ""} onChange={set("to")}>
                        {v.transferOpts.map((o, i) => (
                          <option value={o.val} key={i}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label={`Amount (${v.cur})`}>
                    <input className="inp mono" value={f.amount ?? ""} onChange={set("amount")} placeholder="0" inputMode="decimal" />
                  </Field>
                </div>
              )}

              {v.builderRec && (
                <div>
                  <Field label="Repeat">
                    <div className="seg">
                      {v.freqSeg.map((fq) => (
                        <button className={fq.cls} key={fq.id} onClick={() => st.setFreq(fq.id)}>{fq.label}</button>
                      ))}
                    </div>
                  </Field>
                  {v.freqWeekly && (
                    <Field label="On day">
                      <select className="inp" value={f.day ?? ""} onChange={set("day")}>
                        {v.weekdayOpts.map((wd) => (
                          <option value={wd.val} key={wd.val}>{wd.label}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {v.freqMonthly && (
                    <Field label="On day of month">
                      <input className="inp mono" value={f.day ?? ""} onChange={set("day")} placeholder="1" inputMode="numeric" />
                    </Field>
                  )}
                </div>
              )}

              <div className="hint" style={{ marginTop: 2 }}>{v.builderHint}</div>
            </div>
          )}
        </div>

        <div className="mft">
          {v.qNew && (
            <>
              <button className="ghost" style={{ flex: "0 0 auto", padding: "12px 16px" }} onClick={st.qBack}>Back</button>
              <button className="pbtn" onClick={st.savePreset}>Save button</button>
            </>
          )}
          {v.qChoose && (
            <button className="ghost" style={{ flex: "0 0 auto", padding: "12px 16px" }} onClick={st.qBack}>Back</button>
          )}
          {v.qHub && <button className="pbtn" onClick={st.close}>Done</button>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fld">
      <label className="flbl">{label}</label>
      {children}
    </div>
  );
}
