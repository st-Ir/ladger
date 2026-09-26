"use client";

import { useState } from "react";
import { useLedger } from "@/lib/store";
import { ROLE_HINTS, ROLE_SEED, bandForRole } from "@/lib/rebalance";
import type { AssetTarget, Position, Sleeve, TargetBook, TargetLock } from "@/lib/types";

/**
 * The Target book — six moves, in this order, and the order carries the
 * argument: you name the roles before you weight them, weight them before you
 * band them, and file holdings only once there is somewhere to file them into.
 *
 * Two things this screen deliberately refuses to do:
 *  - prefill a weight. Reading today's holdings back as today's target is how a
 *    drift you never chose quietly becomes the plan.
 *  - apply a suggestion. Every classification chip is dashed, carries its
 *    reason, and needs a tap.
 *
 * Used twice: as the wizard's step (`embedded`) and as the sheet the
 * Rebalancing tab reopens. Same component, so the two can't drift apart.
 */

const PALETTE = ["#5b9bff", "#e8973b", "#9aa6bc", "var(--pnl-up)", "#c084fc", "#f472b6", "#38bdf8"];

const rid = () => Math.random().toString(36).slice(2, 8);

/** A blank book: the three roles, named, with their weights left empty. */
export function newBook(): TargetBook {
  return {
    id: "bk" + Date.now().toString(36),
    name: "",
    sleeves: ROLE_SEED.map((r, i) => ({
      id: "sl" + rid() + i,
      name: r.name,
      color: r.color,
      target: 0,
      band: { ...r.band },
      match: { kind: "syms" as const, syms: [] },
      targets: [],
    })),
  };
}

const STEPS = ["Sleeve", "Bobot", "Band", "Isi", "Target aset", "Simpan"];

const num = (v: string) => {
  const n = parseFloat((v || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export default function TargetBookEditor({
  initial,
  positions,
  onSave,
  onCancel,
  embedded,
}: {
  initial: TargetBook;
  positions: Position[];
  onSave: (b: TargetBook) => void;
  onCancel?: () => void;
  embedded?: boolean;
}) {
  const [sleeves, setSleeves] = useState<Sleeve[]>(() => initial.sleeves.map((s) => ({ ...s, band: { ...s.band }, targets: s.targets.map((t) => ({ ...t })) })));
  const [name, setName] = useState(initial.name);
  const [at, setAt] = useState(0);

  // Filing is held as sym → sleeve so a ticker can only ever be in one place.
  const [filing, setFiling] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const p of positions) {
      const sym = (p.sym || "").toUpperCase();
      const hit = initial.sleeves.find((s) =>
        s.match.kind === "syms" ? s.match.syms.some((x) => (x || "").toUpperCase() === sym) : s.match.type === p.type
      );
      if (hit) out[sym] = hit.id;
    }
    return out;
  });

  const pfValue = positions.reduce((a, p) => a + p.cur * p.qty, 0);
  const weight = sleeves.reduce((a, s) => a + s.target, 0);
  const weightOk = Math.abs(weight - 100) < 0.5;

  const patch = (id: string, up: Partial<Sleeve>) =>
    setSleeves((list) => list.map((s) => (s.id === id ? { ...s, ...up } : s)));

  const symsOf = (id: string) =>
    positions.filter((p) => filing[(p.sym || "").toUpperCase()] === id).map((p) => (p.sym || "").toUpperCase());

  // A class-matched sleeve keeps filing by class as long as nothing was moved in
  // or out of it by hand. Only an actual disagreement converts it to a ticker
  // list — an upgrade shouldn't quietly narrow someone's rule.
  const matchOf = (s: Sleeve) => {
    const mine = symsOf(s.id);
    if (s.match.kind === "type") {
      const t = s.match.type;
      const ofType = positions.filter((p) => p.type === t).map((p) => (p.sym || "").toUpperCase());
      const same = ofType.length === mine.length && ofType.every((x) => mine.includes(x));
      if (same) return s.match;
    }
    return { kind: "syms" as const, syms: mine };
  };

  const commit = () => {
    const clean: Sleeve[] = sleeves
      .filter((s) => s.name.trim())
      .map((s) => ({
        ...s,
        name: s.name.trim(),
        match: matchOf(s),
        targets: s.targets.filter((t) => t.sym.trim() && t.target > 0),
      }));
    onSave({ ...initial, name: name.trim() || "Target book", sleeves: clean });
  };

  const canNext = at === 1 ? weightOk : at === 0 ? sleeves.some((s) => s.name.trim()) : true;
  const last = at === STEPS.length - 1;

  return (
    <div className={"tbk" + (embedded ? " emb" : "")}>
      <div className="tbknav">
        {STEPS.map((s, i) => (
          <button key={s} className={"tbkstep" + (i === at ? " on" : "") + (i < at ? " done" : "")} onClick={() => setAt(i)}>
            <span className="mono">{String(i + 1).padStart(2, "0")}</span> {s}
          </button>
        ))}
      </div>

      <div className="tbkbody">
        {at === 0 && (
          <>
            <p className="tbkq">Sleeve itu peran, bukan jenis aset.</p>
            <div className="tbklist">
              {sleeves.map((s, i) => {
                const role = ROLE_SEED.find((r) => r.name.toLowerCase() === s.name.trim().toLowerCase());
                return (
                  <div className="tbkrow" key={s.id}>
                    <button
                      className="tbkdot"
                      style={{ background: s.color }}
                      title="Ganti warna"
                      onClick={() => patch(s.id, { color: PALETTE[(PALETTE.indexOf(s.color) + 1) % PALETTE.length] })}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input className="inp" value={s.name} onChange={(e) => patch(s.id, { name: e.target.value })} placeholder="Nama sleeve" />
                      {role && <div className="tbkrole">{role.note}</div>}
                    </div>
                    <button className="tbkx" onClick={() => setSleeves((l) => l.filter((x) => x.id !== s.id))} title="Hapus">×</button>
                  </div>
                );
              })}
            </div>
            <button
              className="ghost tbkadd"
              onClick={() =>
                setSleeves((l) => [
                  ...l,
                  { id: "sl" + rid(), name: "", color: PALETTE[l.length % PALETTE.length], target: 0, band: { buy: 2, sell: 5 }, match: { kind: "syms", syms: [] }, targets: [] },
                ])
              }
            >
              + Sleeve
            </button>
          </>
        )}

        {at === 1 && (
          <>
            <p className="tbkq">Berapa persen tiap sleeve? Total harus 100.</p>
            <div className="tbklist">
              {sleeves.map((s) => (
                <div className="tbkrow" key={s.id}>
                  <span className="tbkdot" style={{ background: s.color }} />
                  <div className="tbknm">{s.name || "—"}</div>
                  <input
                    className="inp mono tbkpct"
                    value={s.target || ""}
                    onChange={(e) => patch(s.id, { target: num(e.target.value) })}
                    placeholder="0"
                    inputMode="decimal"
                  />
                  <span className="tbkunit">%</span>
                </div>
              ))}
            </div>
            <div className="tbksum">
              Total <b className={weightOk ? "up" : "dn"}>{(Math.round(weight * 10) / 10).toString()}%</b>
            </div>
          </>
        )}

        {at === 2 && (
          <>
            <p className="tbkq">Beli lebih awal, jual lebih telat — trim kena pajak final, top-up tidak.</p>
            <div className="tbklist">
              {sleeves.map((s) => (
                <div className="tbkrow band" key={s.id}>
                  <span className="tbkdot" style={{ background: s.color }} />
                  <div className="tbknm">{s.name || "—"}</div>
                  <label className="tbkband">
                    <span className="tbkbl">beli −</span>
                    <input className="inp mono tbkpct" value={s.band.buy} onChange={(e) => patch(s.id, { band: { ...s.band, buy: num(e.target.value) } })} inputMode="decimal" />
                  </label>
                  <label className="tbkband">
                    <span className="tbkbl">jual +</span>
                    <input className="inp mono tbkpct" value={s.band.sell} onChange={(e) => patch(s.id, { band: { ...s.band, sell: num(e.target.value) } })} inputMode="decimal" />
                  </label>
                </div>
              ))}
            </div>
            <div className="tbkfoot2">
              <button className="ghost" onClick={() => setSleeves((l) => l.map((s) => ({ ...s, band: { buy: s.band.buy, sell: s.band.buy } })))}>Samakan</button>
              <button className="ghost" onClick={() => setSleeves((l) => l.map((s) => ({ ...s, band: bandForRole(s.name) })))}>Kembalikan</button>
            </div>
          </>
        )}

        {at === 3 && (
          <>
            <p className="tbkq">Taruh tiap posisi. Saran boleh salah — itu memang cuma ancar-ancar.</p>
            {!positions.length && <div className="tbkempty">Belum ada posisi.</div>}
            <div className="tbklist">
              {positions.map((p) => {
                const sym = (p.sym || "").toUpperCase();
                const hint = ROLE_HINTS[p.type] || ROLE_HINTS.stock;
                const suggested = sleeves.find((s) => s.name.trim().toLowerCase() === hint.role.toLowerCase());
                const here = filing[sym] || "";
                return (
                  <div className="tbkrow file" key={sym}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tbknm mono">{sym}</div>
                      <div className="tbkrole">
                        {pfValue > 0 ? ((p.cur * p.qty) / pfValue * 100).toFixed(1) + "% · " : ""}
                        {hint.reason}
                      </div>
                    </div>
                    {!here && suggested && (
                      <button className="tbksug" onClick={() => setFiling((f) => ({ ...f, [sym]: suggested.id }))} title={hint.reason}>
                        {hint.role} ?
                      </button>
                    )}
                    <select className="inp tbksel" value={here} onChange={(e) => setFiling((f) => ({ ...f, [sym]: e.target.value }))}>
                      <option value="">Unassigned</option>
                      {sleeves.filter((s) => s.name.trim()).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {at === 4 && (
          <>
            <p className="tbkq">Opsional. Kosongkan kalau sleeve-nya diseimbangkan utuh.</p>
            <div className="tbklist">
              {sleeves.filter((s) => s.name.trim()).map((s) => {
                const mine = symsOf(s.id);
                const sum = s.targets.reduce((a, t) => a + t.target, 0);
                const set = (sym: string, up: Partial<AssetTarget>) => {
                  const has = s.targets.some((t) => t.sym === sym);
                  const targets = has
                    ? s.targets.map((t) => (t.sym === sym ? { ...t, ...up } : t))
                    : [...s.targets, { sym, target: 0, ...up }];
                  patch(s.id, { targets });
                };
                return (
                  <div className="tbkgrp" key={s.id}>
                    <div className="tbkghd">
                      <span className="tbkdot" style={{ background: s.color }} />
                      <span className="tbknm">{s.name}</span>
                      {sum > 0 && <span className={"tbkgsum mono " + (Math.abs(sum - 100) < 0.5 ? "up" : "dn")}>{Math.round(sum * 10) / 10}%</span>}
                    </div>
                    {!mine.length && <div className="tbkempty sm">Belum ada isi.</div>}
                    {mine.map((sym) => {
                      const t = s.targets.find((x) => x.sym === sym);
                      return (
                        <div className="tbkrow sub" key={sym}>
                          <div className="tbknm mono">{sym}</div>
                          <input
                            className="inp mono tbkpct"
                            value={t?.target || ""}
                            onChange={(e) => set(sym, { target: num(e.target.value) })}
                            placeholder="0"
                            inputMode="decimal"
                          />
                          <span className="tbkunit">%</span>
                          <select className="inp tbklock" value={t?.lock || ""} onChange={(e) => set(sym, { lock: (e.target.value || undefined) as TargetLock })}>
                            <option value="">bebas</option>
                            <option value="no-sell">jangan jual</option>
                            <option value="no-buy">jangan beli</option>
                            <option value="hold">kunci</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {at === 5 && (
          <>
            <p className="tbkq">Beri nama. Bikin lagi nanti untuk pandangan pasar lain.</p>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Neutral" />
            <div className="tbkrev">
              {sleeves.filter((s) => s.name.trim()).map((s) => (
                <div className="tbkrevrow" key={s.id}>
                  <span className="tbkdot" style={{ background: s.color }} />
                  <span className="tbknm">{s.name}</span>
                  <span className="mono tbkrevpct">{s.target}%</span>
                  <span className="mono tbkrevband">−{s.band.buy} / +{s.band.sell}</span>
                  <span className="tbkrevn">{symsOf(s.id).length || "—"}</span>
                </div>
              ))}
            </div>
            {!weightOk && <div className="tbkwarn">Total bobot {Math.round(weight * 10) / 10}% — belum 100.</div>}
          </>
        )}
      </div>

      <div className="tbkfoot">
        {onCancel && <button className="ghost" onClick={onCancel}>Batal</button>}
        {at > 0 && <button className="ghost" onClick={() => setAt(at - 1)}>Kembali</button>}
        {last ? (
          <button className="pbtn" disabled={!weightOk} onClick={commit}>Simpan</button>
        ) : (
          <button className="pbtn" disabled={!canNext} onClick={() => setAt(at + 1)}>Lanjut</button>
        )}
      </div>
    </div>
  );
}

/** The sheet the Rebalancing tab reopens. Same editor, overlay chrome. */
export function TargetBookSheet() {
  const st = useLedger();
  if (st.modal !== "book") return null;
  const current = st.books.find((b) => b.id === st.bookId);
  return (
    <div className="ov" onClick={st.close}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="mhd">
          <div className="mtl">Target book</div>
          <button className="xbtn" onClick={st.close}>×</button>
        </div>
        <TargetBookEditor
          initial={current || newBook()}
          positions={st.positions}
          onSave={st.saveBook}
          onCancel={st.close}
        />
      </div>
    </div>
  );
}
