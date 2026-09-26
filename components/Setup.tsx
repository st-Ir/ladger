"use client";

import { useState } from "react";
import { useLedger } from "@/lib/store";
import { THEMES } from "@/lib/config";
import { fmtIn, parseAmount } from "@/lib/format";
import { BROKERS, feeRate } from "@/lib/brokers";
import TargetBookEditor, { newBook } from "./TargetBook";
import type { Category, Cur, SetupHolder, TargetBook, ThemeId } from "@/lib/types";

/**
 * First run, and the only way holders ever get created for a new ledger — there
 * is no seeded demo money (see `createInitialState`). An empty ledger has nothing
 * to spend from and nothing to file an expense under, so this step is mandatory:
 * no skip. It collects the minimum that makes the rest of the app work — a vault,
 * a wallet, categories, plus the optional halves (Portfolio, FX) and the theme.
 *
 * It writes nothing until the last step: `applySetup` commits in one go.
 */

const STEP_META: Record<string, { title: string; sub: string }> = {
  dasar: { title: "Dasar", sub: "Bisa diubah nanti." },
  alur: { title: "Alur uang", sub: "Kenapa akunnya dipisah." },
  vault: { title: "Vault", sub: "Tempat pemasukan mendarat." },
  wallet: { title: "Wallet", sub: "Tempat pengeluaran diambil." },
  kategori: { title: "Kategori", sub: "Label tiap pengeluaran." },
  portfolio: { title: "Capital", sub: "Modal investasi + PIN." },
  target: { title: "Target book", sub: "Boleh nanti." },
  rutin: { title: "Pemasukan rutin", sub: "Opsional." },
  selesai: { title: "Siap", sub: "Periksa, lalu mulai." },
};

/**
 * The three holder kinds. Money enters at the vault and forks from there, so the
 * map is drawn as a fork rather than a line — wallet and capital are siblings,
 * both fed by transfers. Capital is the one that comes and goes with the
 * Portfolio switch; the first two are what makes the ledger work at all.
 */
const VAULT_NODE = { kick: "01", name: "Vault", role: "Pemasukan masuk ke sini.", end: "" };
const LEAF_NODES = [
  { kick: "02", name: "Wallet", role: "Semua pengeluaran dari sini.", end: "→ pengeluaran" },
  { kick: "03", name: "Capital", role: "Modal beli posisi.", end: "→ posisi" },
];

const THEME_LABEL: Record<ThemeId, string> = { dark: "Dark", light: "Light", midnight: "Midnight" };

const newId = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + "-" + Date.now().toString(36);

export default function Setup() {
  const st = useLedger();
  const [features, setFeatures] = useState(st.features);
  // Re-running the wizard on a ledger that already has holders starts that step
  // empty: the suggestion is only for someone who has none, and pre-filled rows
  // would otherwise add a duplicate-ish holder to anyone who just clicks through.
  const first = (suggest: string, existing: unknown[]): SetupHolder[] =>
    existing.length ? [] : [{ name: suggest, currency: "IDR", bal: "" }];
  const [vaults, setVaults] = useState<SetupHolder[]>(() => first("Rekening Utama", st.accounts));
  const [wallets, setWallets] = useState<SetupHolder[]>(() => first("Dompet Harian", st.wallets));
  const [capital, setCapital] = useState<SetupHolder[]>(() => first("Trading Capital", st.capital));
  const [cats, setCats] = useState<Category[]>(st.categories.length ? st.categories : [{ id: "daily", name: "Daily" }]);
  // IDR by default: it's the functional currency and what the holders above start in.
  const [cur, setCur] = useState<Cur>("IDR");
  const [newCat, setNewCat] = useState("");
  const [pin, setPin] = useState("");
  // Null until the editor is committed — and a legitimate final answer. A book
  // is a strategy, and demanding one before the first position exists is the
  // same invention as prefilling its weights.
  const [book, setBook] = useState<TargetBook | null>(null);
  const [inc, setInc] = useState({ label: "Gaji", amount: "", account: "", day: 1 });
  const [i, setI] = useState(0);

  // The target book rides with Portfolio, same as the capital step: with
  // investments off there is nothing to rebalance and the step disappears.
  const steps = ["dasar", "alur", "vault", "wallet", "kategori", ...(features.portfolio ? ["portfolio", "target"] : []), "rutin", "selesai"];
  const at = Math.min(i, steps.length - 1);
  const step = steps[at];
  const meta = STEP_META[step];

  const named = (list: SetupHolder[]) => list.filter((h) => h.name.trim());
  const holders = [...named(vaults), ...named(wallets), ...(features.portfolio ? named(capital) : [])];

  // A holder's name is how transactions point at it, so two holders may never
  // share one — including with a holder the ledger already has.
  const seen = new Map<string, number>();
  [...st.accounts, ...st.wallets, ...st.capital].forEach((h) => seen.set(h.name, 1));
  holders.forEach((h) => seen.set(h.name.trim(), (seen.get(h.name.trim()) || 0) + 1));
  const clash = (name: string) => (seen.get(name.trim()) || 0) > 1;
  /** A step is passable once its kind exists — either already, or typed here. */
  const ok = (list: SetupHolder[], existing: unknown[]) =>
    (named(list).length > 0 || existing.length > 0) && !named(list).some((h) => clash(h.name));

  // A PIN is only demanded the first time; a ledger that already has capital
  // already has one, and leaving the field blank keeps it.
  const pinOk = /^\d{4,6}$/.test(pin) || st.capital.length > 0;
  const canNext =
    step === "vault" ? ok(vaults, st.accounts)
    : step === "wallet" ? ok(wallets, st.wallets)
    : step === "kategori" ? cats.some((c) => c.name.trim())
    : step === "portfolio" ? ok(capital, st.capital) && pinOk
    : true;

  /** Every vault the income could land in: the ledger's own plus the new ones. */
  const vaultOpts = [
    ...st.accounts.map((a) => ({ name: a.name, currency: (a.currency || "USD") as Cur })),
    ...named(vaults).map((v) => ({ name: v.name.trim(), currency: v.currency })),
  ];
  const incAccount = vaultOpts.some((v) => v.name === inc.account) ? inc.account : vaultOpts[0]?.name || "";
  const incAmount = parseAmount(inc.amount);
  const incCur = vaultOpts.find((v) => v.name === incAccount)?.currency || "IDR";

  const finish = () =>
    st.applySetup({
      features,
      theme: st.theme,
      cur,
      vaults,
      wallets,
      capital,
      categories: cats,
      pfPass: pin,
      book,
      income: incAmount > 0 && incAccount ? { ...inc, account: incAccount } : null,
    });

  return (
    <div className="setup">
      <div className="stcard">
        <div className="sthd">
          <div className="sihead" style={{ margin: 0 }}>
            <div className="blogo">L</div>
            <div>
              <div className="bname">Ledger</div>
              <div className="bsub">Penyiapan</div>
            </div>
          </div>
          <span className="stcount mono">
            {at + 1} / {steps.length}
          </span>
        </div>
        <div className="stbar">
          <i style={{ width: ((at + 1) / steps.length) * 100 + "%" }} />
        </div>

        <div className="stbd">
          <h1 className="sttl">{meta.title}</h1>
          <p className="stsub">{meta.sub}</p>

          {step === "dasar" && (
            <>
              {[
                { key: "portfolio" as const, label: "Portfolio", sub: "Posisi & jurnal trading." },
                { key: "fx" as const, label: "FX effect", sub: "Dua mata uang, USD/IDR." },
              ].map((f) => (
                <button
                  className="bprow"
                  key={f.key}
                  onClick={() => setFeatures((p) => ({ ...p, [f.key]: !p[f.key] }))}
                >
                  <span className="bprowtx">
                    <span className="bprowt">{f.label}</span>
                    <span className="bprows">{f.sub}</span>
                  </span>
                  <span className={"swt" + (features[f.key] ? " on" : "")} role="switch" aria-checked={features[f.key]}>
                    <i />
                  </span>
                </button>
              ))}
              <div className="hint" style={{ marginBottom: 16 }}>
                Mati = disembunyikan, bukan dihapus.
              </div>
              {features.fx && (
                <div className="fld">
                  <label className="flbl">Angka ditampilkan dalam</label>
                  <div className="seg">
                    {(["IDR", "USD"] as Cur[]).map((c) => (
                      <button className={"segb" + (cur === c ? " on" : "")} key={c} onClick={() => setCur(c)}>
                        {c === "IDR" ? "Rupiah" : "Dollar"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="flbl">Tema</label>
              <div className="themerow">
                {(Object.keys(THEMES) as ThemeId[]).map((id) => (
                  <div
                    className={"tcard" + (st.theme === id ? " on" : "")}
                    key={id}
                    onClick={() => st.setTheme(id)}
                  >
                    <div className="tprev" style={{ background: THEMES[id].bg }}>
                      <span className="tdot" style={{ background: THEMES[id].acc }} />
                      <span className="tdot" style={{ background: THEMES[id].mut }} />
                    </div>
                    <span>{THEME_LABEL[id]}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === "alur" && (
            <>
              <div className="stflow">
                <FlowNode n={VAULT_NODE} lead />
                {/* Drawn, not typed: the split is the point of the diagram. */}
                <div className={"stfjoin" + (features.portfolio ? "" : " solo")}>
                  <span className="stfchip mono">TRANSFER</span>
                  <i className="v" />
                  <i className="h" />
                  <i className="d l" />
                  <i className="d r" />
                </div>
                <div className={"stffork" + (features.portfolio ? "" : " solo")}>
                  {LEAF_NODES.slice(0, features.portfolio ? 2 : 1).map((n) => (
                    <FlowNode key={n.name} n={n} />
                  ))}
                </div>
              </div>
              <div className="stwhy">
                <b>Kenapa dipisah?</b> Satu saldo tidak bisa menjawab: punya berapa, boleh habis
                berapa{features.portfolio ? ", kerja berapa" : ""}. Sisa wallet = sisa jatah.
              </div>
            </>
          )}

          {step === "vault" && (
            <Rows list={vaults} onChange={setVaults} fx={features.fx} clash={clash} hint="mis. BCA" have={st.accounts.map((a) => a.name)} />
          )}

          {step === "wallet" && (
            <Rows list={wallets} onChange={setWallets} fx={features.fx} clash={clash} hint="mis. GoPay" have={st.wallets.map((w) => w.name)} />
          )}

          {step === "kategori" && (
            <>
              <div className="stlist">
                {cats.map((c) => (
                  <div className="strow" key={c.id}>
                    <input
                      className="inp"
                      value={c.name}
                      onChange={(e) => setCats((p) => p.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))}
                    />
                    <button
                      className="stdel"
                      onClick={() => setCats((p) => (p.length > 1 ? p.filter((x) => x.id !== c.id) : p))}
                      aria-label={"Hapus " + c.name}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="stadd">
                <input
                  className="inp"
                  value={newCat}
                  placeholder="Kategori baru"
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || !newCat.trim()) return;
                    setCats((p) => [...p, { id: newId(newCat), name: newCat.trim() }]);
                    setNewCat("");
                  }}
                />
                <button
                  className="ghost"
                  onClick={() => {
                    if (!newCat.trim()) return;
                    setCats((p) => [...p, { id: newId(newCat), name: newCat.trim() }]);
                    setNewCat("");
                  }}
                >
                  + Tambah
                </button>
              </div>
            </>
          )}

          {step === "portfolio" && (
            <>
              <Rows list={capital} onChange={setCapital} fx={features.fx} clash={clash} hint="mis. Trading Capital" have={st.capital.map((c) => c.name)} brokers />
              <div className="fld" style={{ marginTop: 4 }}>
                <label className="flbl">PIN Portfolio (4–6 digit)</label>
                <input
                  className="inp mono"
                  value={pin}
                  inputMode="numeric"
                  placeholder="••••"
                  maxLength={6}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <div className="hint">Sekadar penutup layar, bukan enkripsi.</div>
              </div>
            </>
          )}

          {step === "target" && (
            <>
              {book ? (
                <div className="stbook">
                  <div className="stbookhd">
                    <span className="stbooknm">{book.name}</span>
                    <button className="ghost" onClick={() => setBook(null)}>Ubah</button>
                  </div>
                  {book.sleeves.map((s) => (
                    <div className="stbookrow" key={s.id}>
                      <span className="tbkdot" style={{ background: s.color }} />
                      <span className="tbknm">{s.name}</span>
                      <span className="mono">{s.target}%</span>
                      <span className="mono tbkrevband">−{s.band.buy} / +{s.band.sell}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <TargetBookEditor initial={newBook()} positions={st.positions} onSave={setBook} embedded />
              )}
            </>
          )}

          {step === "rutin" && (
            <>
              <div className="frow">
                <div className="fld">
                  <label className="flbl">Nama</label>
                  <input className="inp" value={inc.label} onChange={(e) => setInc({ ...inc, label: e.target.value })} placeholder="Gaji" />
                </div>
                <div className="fld">
                  <label className="flbl">Jumlah ({incCur === "IDR" ? "Rp" : "$"})</label>
                  <input className="inp mono" value={inc.amount} inputMode="decimal" placeholder="0" onChange={(e) => setInc({ ...inc, amount: e.target.value })} />
                </div>
              </div>
              <div className="frow">
                <div className="fld">
                  <label className="flbl">Masuk ke vault</label>
                  <select className="inp" value={incAccount} onChange={(e) => setInc({ ...inc, account: e.target.value })}>
                    {vaultOpts.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label className="flbl">Tanggal</label>
                  <input
                    className="inp mono"
                    value={inc.day}
                    inputMode="numeric"
                    onChange={(e) => setInc({ ...inc, day: Math.min(28, Math.max(1, parseInt(e.target.value.replace(/\D/g, "") || "1", 10))) })}
                  />
                </div>
              </div>
              <div className="hint">Kosongkan kalau belum perlu. Mulai jalan bulan depan.</div>
            </>
          )}

          {step === "selesai" && (
            <div className="stsum">
              <SumRow label="Fitur" value={[features.portfolio && "Portfolio", features.fx && "FX effect"].filter(Boolean).join(" · ") || "Keduanya mati"} />
              <SumRow label="Tampilan" value={THEME_LABEL[st.theme] + (features.fx ? " · angka dalam " + cur : "")} />
              <SumRow label="Vault" value={named(vaults).map((v) => v.name.trim() + " · " + fmtIn(parseAmount(v.bal), v.currency)).join("\n") || "—"} />
              <SumRow label="Wallet" value={named(wallets).map((w) => w.name.trim() + " · " + fmtIn(parseAmount(w.bal), w.currency)).join("\n") || "—"} />
              {features.portfolio && (
                <>
                  <SumRow label="Capital" value={named(capital).map((c) => c.name.trim() + " · " + fmtIn(parseAmount(c.bal), c.currency)).join("\n") || "—"} />
                  <SumRow label="PIN" value={pin ? "Terpasang" : "Belum diatur"} />
                </>
              )}
              <SumRow label="Kategori" value={cats.filter((c) => c.name.trim()).map((c) => c.name.trim()).join(" · ")} />
              <SumRow
                label="Rutin"
                value={incAmount > 0 ? inc.label + " · " + fmtIn(incAmount, incCur) + " → " + incAccount + " · tgl " + inc.day : "Tidak ada"}
              />
              <div className="hint" style={{ marginTop: 12 }}>
                Saldo awal = saldo pembuka, bukan pemasukan bulan ini.
              </div>
            </div>
          )}
        </div>

        <div className="stft">
          {/* No skip: a ledger with no vault and no wallet has nothing to record
              against, so this is the one screen that has to be finished. */}
          {at > 0 && (
            <button className="ghost" onClick={() => setI(at - 1)}>
              Kembali
            </button>
          )}
          <span style={{ flex: 1 }} />
          {step === "selesai" ? (
            <button className="pbtn" onClick={finish}>
              Mulai
            </button>
          ) : (
            <button className="pbtn" disabled={!canNext} onClick={() => setI(at + 1)}>
              Lanjut →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Name + currency + opening balance, repeated. Used for all three holder kinds. */
function Rows({
  list,
  onChange,
  fx,
  clash,
  hint,
  have,
  brokers,
}: {
  list: SetupHolder[];
  onChange: (next: SetupHolder[]) => void;
  fx: boolean;
  clash: (name: string) => boolean;
  hint: string;
  /** What the ledger already has of this kind — shown, never touched. */
  have: string[];
  /** Capital only: name the venue now and no trade form ever asks for a fee. */
  brokers?: boolean;
}) {
  const patch = (i: number, p: Partial<SetupHolder>) => onChange(list.map((h, x) => (x === i ? { ...h, ...p } : h)));

  return (
    <>
      {have.length > 0 && (
        <div className="sthave">
          Sudah ada: <b>{have.join(" · ")}</b>
        </div>
      )}
      <div className="stlist">
        {list.map((h, i) => {
          const dupe = h.name.trim() !== "" && clash(h.name);
          return (
            <div className="stholder" key={i}>
              <div className="strow">
                <input
                  className={"inp" + (dupe ? " bad" : "")}
                  value={h.name}
                  placeholder={hint}
                  onChange={(e) => patch(i, { name: e.target.value })}
                />
                {list.length > 1 && (
                  <button className="stdel" onClick={() => onChange(list.filter((_, x) => x !== i))} aria-label="Hapus baris">
                    ×
                  </button>
                )}
              </div>
              <div className="strow">
                <input
                  className="inp mono"
                  value={h.bal}
                  inputMode="decimal"
                  placeholder={"Saldo awal (" + (h.currency === "IDR" ? "Rp" : "$") + ")"}
                  onChange={(e) => patch(i, { bal: e.target.value })}
                />
                {fx && (
                  <div className="seg stcur">
                    {(["IDR", "USD"] as Cur[]).map((c) => (
                      <button className={"segb" + (h.currency === c ? " on" : "")} key={c} onClick={() => patch(i, { currency: c })}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {brokers && (
                <div className="strow">
                  <select className="inp" value={h.broker ?? ""} onChange={(e) => patch(i, { broker: e.target.value })}>
                    <option value="">Tanpa broker — fee & pajak manual</option>
                    {BROKERS.map((b) => (
                      <option value={b.id} key={b.id}>
                        {b.name} · {feeRate(b, "buy")} / {feeRate(b, "sell")}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {dupe && <div className="stwarn">Nama sudah dipakai.</div>}
            </div>
          );
        })}
      </div>
      <div className="stadd">
        <button className="ghost" onClick={() => onChange([...list, { name: "", currency: list[list.length - 1]?.currency || "IDR", bal: "" }])}>
          + Tambah
        </button>
      </div>
      <div className="hint">Saldo awal boleh kosong.</div>
    </>
  );
}

/** One box on the money map: index, name, what it is for, what leaves it. */
function FlowNode({ n, lead }: { n: { kick: string; name: string; role: string; end: string }; lead?: boolean }) {
  return (
    <div className={"stfnode" + (lead ? " lead" : "")}>
      <div className="stfhd">
        <span className="stfix mono">{n.kick}</span>
        <b className="stfname">{n.name}</b>
      </div>
      <span className="stfrole">{n.role}</span>
      {n.end && <span className="stfend mono">{n.end}</span>}
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="stsrow">
      <span className="stskey">{label}</span>
      <span className="stsval">{value}</span>
    </div>
  );
}
