"use client";

import { useLedger } from "@/lib/store";
import { currentRate } from "@/lib/config";
import { convert, fmtIn, fmtRate, parseAmount, roundIn, toFunctional } from "@/lib/format";
import type { View } from "@/lib/derive";
import { useMarketProbe } from "./useMarketProbe";

export default function Modal({ v }: { v: View }) {
  const st = useLedger();
  // The target book is too big for this shell and brings its own — see
  // `TargetBookSheet`, mounted alongside this one.
  if (!v.modalOpen || v.m.book) return null;

  const f = v.form;
  const set = (name: string) => (e: any) => st.onField(name, e.target.value);

  // Amounts are entered in the selected holder's native currency, so labels show it.
  const symOf = (c?: string) => (c === "IDR" ? "Rp" : "$");
  const holderCur = (name?: string) => [...st.accounts, ...st.wallets, ...st.capital].find((x) => x.name === name)?.currency;
  const expSym = symOf(st.wallets.find((w) => w.name === f.wallet)?.currency);
  const incSym = symOf(st.accounts.find((a) => a.name === f.account)?.currency);

  return (
    <div className="ov" onClick={st.close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhd">
          <div className="mtl">{v.modalTitle}</div>
          <button className="xbtn" onClick={st.close}>×</button>
        </div>
        <div className="mbd">
          {v.m.expense && (
            <div>
              <Field label="What did you spend on?">
                <input className="inp" value={f.name ?? ""} onChange={set("name")} placeholder="e.g. Groceries" />
              </Field>
              <Field label="Category">
                <div className="seg">
                  {v.catSeg.map((c) => (
                    <button className={c.cls} key={c.id} onClick={() => st.setFormCat(c.id)}>{c.label}</button>
                  ))}
                </div>
              </Field>
              <div className="frow">
                <Field label={`Amount (${expSym})`}>
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

          {v.m.goal && (
            <div>
              <Field label="Goal name">
                <input className="inp" value={f.name ?? ""} onChange={set("name")} placeholder="e.g. New Laptop" />
              </Field>
              <div className="frow">
                <Field label={`Target (${v.cur})`}>
                  <input className="inp mono" value={f.target ?? ""} onChange={set("target")} placeholder="0" inputMode="decimal" />
                </Field>
                <Field label="Already saved">
                  <input className="inp mono" value={f.saved ?? ""} onChange={set("saved")} placeholder="0" inputMode="decimal" />
                </Field>
              </div>
            </div>
          )}

          {v.m.income && (
            <div>
              <Field label="Source">
                <input className="inp" value={f.name ?? ""} onChange={set("name")} placeholder="e.g. Salary" />
              </Field>
              <div className="frow">
                <Field label={`Amount (${incSym})`}>
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

          {v.m.transfer && (() => {
            const fromCur = holderCur(f.from) || "USD";
            const toCur = holderCur(f.to) || "USD";
            const cross = fromCur !== toCur;
            const send = parseAmount(f.amount);
            const midRecv = roundIn(convert(send, fromCur, toCur, currentRate()), toCur);
            const recv = parseAmount(f.recvAmount) || midRecv;
            const effRate = send > 0 && recv > 0 ? (fromCur === "USD" ? recv / send : send / recv) : currentRate();
            const realized = Math.round(toFunctional(recv, toCur, currentRate()) - toFunctional(send, fromCur, currentRate()));
            return (
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
                {/* With FX off there is no rate to negotiate: a legacy cross-currency
                    transfer still converts, silently, at the market rate. */}
                {cross && v.feat.fx ? (
                  <>
                    <div className="frow">
                      <Field label={`Send (${symOf(fromCur)})`}>
                        <input className="inp mono" value={f.amount ?? ""} onChange={set("amount")} placeholder="0" inputMode="decimal" />
                      </Field>
                      <Field label={`Receive (${symOf(toCur)})`}>
                        <input className="inp mono" value={f.recvAmount ?? ""} onChange={set("recvAmount")} placeholder={String(midRecv || 0)} inputMode="decimal" />
                      </Field>
                    </div>
                    {send > 0 && (
                      <div className="hint">
                        Kurs efektif ≈ {fmtRate(effRate)} / $1 · FX{" "}
                        <b style={{ color: realized >= 0 ? "var(--pnl-up)" : "var(--pnl-dn)" }}>{(realized >= 0 ? "+" : "−") + fmtIn(Math.abs(realized), "IDR")}</b>{" "}
                        vs kurs pasar. Kosongkan <b style={{ color: "var(--tx)" }}>Receive</b> untuk pakai kurs pasar.
                      </div>
                    )}
                  </>
                ) : (
                  <Field label={`Amount (${symOf(fromCur)})`}>
                    <input className="inp mono" value={f.amount ?? ""} onChange={set("amount")} placeholder="0" inputMode="decimal" />
                  </Field>
                )}
                <div className="hint">
                  Moves money between vaults, wallets and portfolio capital. Any account can transfer to any other. Net worth stays the same — you&apos;re just relocating cash to where it&apos;s allowed to be used.
                </div>
              </div>
            );
          })()}

          {v.m.place && (
            <div>
              <Field label={`${v.placeKindLabel} name`}>
                <input className="inp" value={f.name ?? ""} onChange={set("name")} placeholder={v.placePlaceholder} />
              </Field>
              {v.feat.fx && (
                <>
                  <Field label={"Currency" + (v.placeCurLocked ? " · terkunci" : "")}>
                    <div className="seg" style={v.placeCurLocked ? { opacity: 0.55 } : undefined}>
                      {v.placeCurSeg.map((c) => (
                        <button
                          className={c.cls}
                          key={c.id}
                          disabled={v.placeCurLocked}
                          title={v.placeCurLocked ? v.placeCurNote : undefined}
                          onClick={() => !v.placeCurLocked && st.onField("placeCur", c.id)}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <div className="hint">{v.placeCurNote}</div>
                </>
              )}
              {v.placeIsCapital && (
                <Field label="Broker">
                  <select className="inp" value={f.broker ?? ""} onChange={set("broker")}>
                    <option value="">Isi fee manual</option>
                    {v.brokerOpts.map((o) => (
                      <option value={o.val} key={o.val}>{o.label}</option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="hint">{v.placeHint}</div>
            </div>
          )}

          {v.m.order && (
            <div>
              <Field label="Pay from — portfolio capital">
                <select className="inp" value={f.src ?? ""} onChange={set("src")}>
                  {v.fundOpts.map((o, i) => (
                    <option value={o.val} key={i}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <div className="frow">
                <Field label="Asset">
                  <input className="inp" value={f.asset ?? ""} onChange={set("asset")} placeholder="e.g. BTC" />
                </Field>
                <Field label="Type">
                  <TypeSeg v={v} />
                </Field>
              </div>
              <MarketSeg v={v} />
              <Field label="Side">
                <div className="seg">
                  <button className={v.sideCls.long} onClick={() => st.setSide("Long")}>Long</button>
                  <button className={v.sideCls.short} onClick={() => st.setSide("Short")}>Short</button>
                </div>
              </Field>
              <div className="frow">
                <Field label={`Entry (${v.pxCur})`}>
                  <input className="inp mono" value={f.entry ?? ""} onChange={set("entry")} placeholder="0" inputMode="decimal" />
                </Field>
                <Field label={`Amount to commit (${v.cur})`}>
                  <input className="inp mono" value={f.amount ?? ""} onChange={set("amount")} placeholder="0" inputMode="decimal" />
                </Field>
              </div>
              <div className="frow">
                <Field label={`Take Profit (${v.pxCur})`}>
                  <input className="inp mono" value={f.tp ?? ""} onChange={set("tp")} placeholder="0" inputMode="decimal" />
                </Field>
                <Field label={`Stop Loss (${v.pxCur})`}>
                  <input className="inp mono" value={f.sl ?? ""} onChange={set("sl")} placeholder="0" inputMode="decimal" />
                </Field>
              </div>
              <FeeRow v={v} onField={set("fee")} />
              <Field label="Thesis — why this trade">
                <textarea className="inp" value={f.thesis ?? ""} onChange={set("thesis")} placeholder="Setup, trigger, invalidation. The plan you'll be tempted to abandon — write it so future-you can't." style={{ minHeight: 76, resize: "vertical", fontFamily: "inherit" }} />
              </Field>
              <div className="ordprev">
                {v.orderPrev.map((r, i) => (
                  <div className="ordprevc" key={i}>
                    <div className="opk">{r.k}</div>
                    <div className={"opv " + r.cls}>{r.v}</div>
                  </div>
                ))}
              </div>
              {v.buyOut && <div className="hint up">{v.buyOut}</div>}
              <div className="hint">Available in capital: <b style={{ color: "var(--tx)" }}>{v.srcBal}</b>. The amount leaves this capital account now and becomes a live position — every field is required and you can&apos;t commit more than you have.</div>
            </div>
          )}

          {v.m.planeval && (
            <div>
              <Field label={`Current price (${v.pxCur})`}>
                <input className="inp mono" value={f.price ?? ""} onChange={set("price")} placeholder="0" inputMode="decimal" />
              </Field>
              <div className="hint">Enter the latest market price — the plan&apos;s status updates automatically against entry, TP and SL.</div>
            </div>
          )}

          {v.m.closeorder && (
            <div>
              <div className="hint" style={{ marginBottom: 12 }}>Closing <b style={{ color: "var(--tx)" }}>{v.closeOrd.sum}</b></div>
              <FeeRow v={v} onField={set("fee")} />
              {v.closeOrd.prev && <div className="hint up">{v.closeOrd.prev}</div>}
              <div className="hint">Exits at the order&apos;s price — update that first if it moved. Proceeds return to the capital that funded it.</div>
            </div>
          )}

          {v.m.invest && (
            <div>
              <Field label="Pay from — portfolio capital">
                <select className="inp" value={f.src ?? ""} onChange={set("src")}>
                  {v.fundOpts.map((o, i) => (
                    <option value={o.val} key={i}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <div className="frow">
                <Field label="Asset">
                  <input className="inp" value={f.asset ?? ""} onChange={set("asset")} placeholder="e.g. BTC" />
                </Field>
                <Field label="Type">
                  <TypeSeg v={v} />
                </Field>
              </div>
              <MarketSeg v={v} />
              <div className="frow">
                <Field label={`Buy price (${v.pxCur})`}>
                  <input className="inp mono" value={f.price ?? ""} onChange={set("price")} placeholder="0" inputMode="decimal" />
                </Field>
                <Field label={`Amount to invest (${v.cur})`}>
                  <input className="inp mono" value={f.amount ?? ""} onChange={set("amount")} placeholder="0" inputMode="decimal" />
                </Field>
              </div>
              <FeeRow v={v} onField={set("fee")} />
              <div className="hint">Available in source: <b style={{ color: "var(--tx)" }}>{v.srcBal}</b>. <span className="up">{v.investQtyPrev}</span></div>
              {v.buyOut && <div className="hint up">{v.buyOut}</div>}
              <div className="hint">Buys with money that really exists — the amount leaves your selected portfolio capital and becomes this position at cost. Averages in if you already hold the asset.</div>
            </div>
          )}

          {v.m.sell && (
            <div>
              <Field label="Position">
                <select className="inp" value={f.posSym ?? ""} onChange={set("posSym")}>
                  {v.posOpts.map((o, i) => (
                    <option value={o.val} key={i}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <div className="frow">
                <Field label={`Sell price (${v.pxCur})`}>
                  <input className="inp mono" value={f.price ?? ""} onChange={set("price")} placeholder="0" inputMode="decimal" />
                </Field>
                <Field label="Quantity">
                  <div className="seg">
                    <button className={v.sellSeg.all} onClick={() => st.setSellMode("all")}>All</button>
                    <button className={v.sellSeg.partial} onClick={() => st.setSellMode("partial")}>Partial</button>
                  </div>
                </Field>
              </div>
              {v.sellPartial && (
                <Field label="Sell quantity">
                  <input className="inp mono" value={f.qty ?? ""} onChange={set("qty")} placeholder="0" inputMode="decimal" />
                </Field>
              )}
              <Field label="Return proceeds to capital">
                <select className="inp" value={f.dest ?? ""} onChange={set("dest")}>
                  {v.fundOpts.map((o, i) => (
                    <option value={o.val} key={i}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <FeeRow v={v} onField={set("fee")} />
              {v.sellPrev && <div className="hint up">{v.sellPrev}</div>}
              <div className="hint">Proceeds go back to your portfolio capital and the realized profit/loss is logged to your Trade Journal automatically. To spend it, transfer capital → wallet.</div>
            </div>
          )}

          {v.m.posprice && (
            <div>
              <MarketSeg v={v} />
              <Field label={`Market price (${v.pxCur})`}>
                <input className="inp mono" value={f.price ?? ""} onChange={set("price")} placeholder="0" inputMode="decimal" />
              </Field>
              <div className="hint">Set the latest market price for this asset — its value and PnL update instantly. Salah bursa? Betulkan di atas.</div>
            </div>
          )}

          {v.m.note && (() => {
            const tagged = String(f.syms || "")
              .split(/[,\s]+/)
              .map((x: string) => x.trim().toUpperCase())
              .filter(Boolean);
            const toggle = (sym: string) =>
              st.onField(
                "syms",
                (tagged.includes(sym) ? tagged.filter((x: string) => x !== sym) : [...tagged, sym]).join(", ")
              );
            return (
              <div>
                <Field label="Judul">
                  <input className="inp" value={f.title ?? ""} onChange={set("title")} placeholder="mis. The Fed tahan suku bunga" />
                </Field>
                <div className="frow">
                  <Field label="Tanggal — patokan pengukuran">
                    <input className="inp mono" type="date" value={f.date ?? ""} onChange={set("date")} />
                  </Field>
                  <Field label="Sumber (opsional)">
                    <input className="inp" value={f.source ?? ""} onChange={set("source")} placeholder="mis. Reuters" />
                  </Field>
                </div>
                <Field label="Bacaanmu">
                  <div className="seg">
                    {(["bullish", "neutral", "bearish"] as const).map((r) => (
                      <button className={"segb " + (f.read === r ? "on" : "")} key={r} onClick={() => st.onField("read", r)}>
                        {r === "bullish" ? "Bullish" : r === "bearish" ? "Bearish" : "Netral"}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Catatan (opsional)">
                  <textarea className="inp" value={f.body ?? ""} onChange={set("body")} placeholder="Apa yang kamu pikir saat itu." style={{ minHeight: 70, resize: "vertical", fontFamily: "inherit" }} />
                </Field>
                {/* Only held names — a tag on something you don't own has nothing
                    to be measured against, so it isn't offered. */}
                <Field label="Simbol yang kamu pegang">
                  {v.noteSymOpts.length === 0 ? (
                    <div className="hint" style={{ marginTop: 0 }}>Belum ada posisi untuk ditandai.</div>
                  ) : (
                    <div className="mctagpick">
                      {v.noteSymOpts.map((s) => (
                        <button className={"mctagb" + (tagged.includes(s.toUpperCase()) ? " on" : "")} key={s} onClick={() => toggle(s.toUpperCase())}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </Field>
                <div className="hint">Aplikasi tidak menilai catatanmu. Yang ditampilkan cuma gerak tiap simbol sejak tanggal di atas.</div>
              </div>
            );
          })()}

          {v.m.categories && (
            <div>
              <div className="hint" style={{ marginBottom: 12 }}>
                Rename or remove your expense categories. A category with logged transactions can be renamed but not deleted.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {st.categories.map((c) => {
                  const used = st.expenses.filter((e) => e.cat === c.id).length;
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input className="inp" value={c.name} onChange={(e) => st.renameCategory(c.id, e.target.value)} style={{ flex: 1 }} />
                      <span className="mono" style={{ fontSize: 11, color: "var(--mut)", minWidth: 52, textAlign: "right" }}>{used ? used + " tx" : "unused"}</span>
                      <button onClick={() => st.deleteCategory(c.id)} title={used ? "Has transactions — can’t delete" : "Delete category"} style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid var(--brd)", background: "var(--surf2)", color: used ? "var(--mut)" : "var(--pnl-dn)", cursor: "pointer", fontSize: 18, lineHeight: 1, opacity: used ? 0.5 : 1, flex: "0 0 auto" }}>×</button>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <input className="inp" value={f.newCat ?? ""} onChange={set("newCat")} placeholder="New category — e.g. Health" style={{ flex: 1 }}
                  onKeyDown={(e) => { if (e.key === "Enter") { st.addCategory(f.newCat || ""); st.onField("newCat", ""); } }} />
                <button className="pbtn" style={{ flex: "0 0 auto", padding: "10px 16px" }} onClick={() => { st.addCategory(f.newCat || ""); st.onField("newCat", ""); }}>+ Add</button>
              </div>
            </div>
          )}
        </div>
        <div className="mft">
          {v.m.categories ? (
            <button className="pbtn" onClick={st.close}>Done</button>
          ) : (
            <>
              <button className="ghost" style={{ flex: "0 0 auto", padding: "12px 16px" }} onClick={st.close}>Cancel</button>
              <button className="pbtn" onClick={st.submit}>Save</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Commission, shown rather than asked for. Capital that knows its venue prices
 * its own fee, so there is nothing to type. The input only comes back for
 * capital with no venue set, or once you tap Edit because the broker's screen
 * said something else — a typed value wins over the schedule from then on.
 */
function FeeRow({ v, onField }: { v: View; onField: (e: any) => void }) {
  const { onField: setField } = useLedger();
  const info = v.feeInfo;
  if (!info) return null;
  if (info.manual)
    return (
      <>
        <Field label={`Fee (${v.cur})`}>
          <input className="inp mono" value={v.form.fee ?? ""} onChange={onField} placeholder="0" inputMode="decimal" />
        </Field>
        {info.noBroker && (
          <div className="hint" style={{ marginTop: -10, marginBottom: 12 }}>
            Pilih broker di Capital — fee dan pajak final terisi sendiri.
          </div>
        )}
      </>
    );
  return (
    <>
      <div className="feeln">
        <div>
          <span className="flbl" style={{ marginBottom: 2 }}>Fee</span>
          <div className="feeamt">{info.text}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="feesrc">{info.label}</div>
          <button className="feeed" onClick={() => setField("fee", info.edit)}>Edit</button>
        </div>
      </div>
      {info.note && <div className="hint" style={{ marginTop: -10, marginBottom: 12 }}>{info.note}</div>}
    </>
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

function TypeSeg({ v }: { v: View }) {
  const { setPosType } = useLedger();
  return (
    <div className="seg">
      <button className={v.invTypeCls.crypto} onClick={() => setPosType("crypto")}>Crypto</button>
      <button className={v.invTypeCls.stock} onClick={() => setPosType("stock")}>Stock</button>
      <button className={v.invTypeCls.etf} onClick={() => setPosType("etf")}>ETF</button>
      <button className={v.invTypeCls.hedge} onClick={() => setPosType("hedge")}>Hedge</button>
    </div>
  );
}

/**
 * Which exchange the name is listed on. It can't be guessed from the ticker —
 * a bare `BBCA` is a US-listed ETF, `BBCA.JK` is Bank Central Asia — so the
 * choice here is what makes the live quote find the right instrument.
 */
function MarketSeg({ v }: { v: View }) {
  const { setMarket } = useLedger();
  // The probe answers the question the segment used to leave to the user's
  // memory: a bare BBRI doesn't exist on Yahoo, BBRI.JK does.
  useMarketProbe(v.probeSym, v.showMarket);
  if (!v.showMarket) return null;
  return (
    <>
      <Field label="Listed on">
        <div className="seg">
          <button className={v.mktSeg.us} onClick={() => setMarket("US")}>US</button>
          <button className={v.mktSeg.idx} onClick={() => setMarket("IDX")}>IDX · Jakarta</button>
        </div>
      </Field>
      {v.mktNote && <div className={"hint " + v.mktNoteCls}>{v.mktNote}</div>}
      {v.pxNote && <div className="hint">{v.pxNote}</div>}
    </>
  );
}
