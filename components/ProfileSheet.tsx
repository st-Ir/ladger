"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useLedger } from "@/lib/store";
import { fileToDataUrl } from "@/lib/image";
import { endGuest, isGuest } from "@/lib/guest";
import { wipeGuestLedger } from "@/lib/storage";
import type { Features, Profile } from "@/lib/types";

/** Initials for the fallback avatar — "L" when nobody is signed in. */
export function initialsOf(name?: string | null) {
  return (name || "L")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const FEATURES: { key: keyof Features; label: string; sub: string }[] = [
  {
    key: "portfolio",
    label: "Portfolio",
    sub: "Positions, orderbook, rebalancing, macro — dan bagiannya di net worth.",
  },
  {
    key: "fx",
    label: "FX Effect",
    sub: "Toggle USD/IDR, kurs live, untung/rugi kurs. Mati = satu mata uang (IDR).",
  },
];

// Cover images are wide and avatars are small — scaling each to what it's
// actually displayed at keeps the prefs blob well under the storage cap.
const LIMITS: Record<keyof Profile, { w: number; h: number; label: string }> = {
  photo: { w: 320, h: 320, label: "Foto profil" },
  bg: { w: 1400, h: 560, label: "Background" },
};

/** The popup behind the dashboard avatar: images, feature switches, account. */
export default function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { data: session } = useSession();
  const profile = useLedger((s) => s.profile);
  const features = useLedger((s) => s.features);
  const toggleFeature = useLedger((s) => s.toggleFeature);
  const setProfileImage = useLedger((s) => s.setProfileImage);
  const startSetup = useLedger((s) => s.startSetup);
  const toastMsg = useLedger((s) => s.toastMsg);
  const pfPass = useLedger((s) => s.pfPass);
  const pfBg = useLedger((s) => s.pfBg);
  const pfUnlocked = useLedger((s) => s.pfUnlocked);
  const setLock = useLedger((s) => s.setLock);
  const lockNow = useLedger((s) => s.lockNow);

  const [linkFor, setLinkFor] = useState<keyof Profile | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<keyof Profile | null>(null);
  const [guest, setGuest] = useState(false);
  const [pass, setPass] = useState(pfPass);
  const [bg, setBg] = useState(pfBg);
  const files = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => setGuest(isGuest()), []);

  /**
   * Leaving guest mode. A full reload is the point: it drops every trace of the
   * guest ledger from memory and re-enters through the sign-in gate.
   */
  const leaveGuest = (wipe: boolean) => {
    if (wipe) wipeGuestLedger();
    endGuest();
    location.reload();
  };

  const user = session?.user;
  const photo = profile.photo || user?.image || "";
  const initials = initialsOf(user?.name);

  const pick = async (key: keyof Profile, file?: File | null) => {
    if (!file) return;
    setBusy(key);
    try {
      const { w, h } = LIMITS[key];
      setProfileImage(key, await fileToDataUrl(file, w, h));
    } catch (err) {
      toastMsg(err instanceof Error ? err.message : "Gagal membaca gambar.");
    } finally {
      setBusy(null);
    }
  };

  const openLink = (key: keyof Profile) => {
    setLinkFor(key);
    setLink(profile[key].startsWith("data:") ? "" : profile[key]);
  };

  const saveLink = () => {
    if (!linkFor) return;
    const url = link.trim();
    if (url && !/^https?:\/\//i.test(url)) return toastMsg("Tautan harus diawali http:// atau https://");
    setProfileImage(linkFor, url);
    setLinkFor(null);
  };

  const rows = (Object.keys(LIMITS) as (keyof Profile)[]).map((key) => {
    const current = profile[key];
    return (
      <div className="psrow" key={key}>
        <div className="psrowhd">
          <span className="psrowt">{LIMITS[key].label}</span>
          <span className="psrows">
            {current
              ? current.startsWith("data:")
                ? "Gambar diunggah"
                : "Dari tautan"
              : key === "photo"
                ? user?.image
                  ? "Pakai foto Google"
                  : "Belum ada — pakai inisial"
                : "Belum ada — pakai pola tema"}
          </span>
        </div>
        <div className="psacts">
          <button
            className="gsm"
            disabled={busy === key}
            onClick={() => files.current[key]?.click()}
          >
            {busy === key ? "Memproses…" : "Unggah"}
          </button>
          <button className="gsm" onClick={() => openLink(key)}>
            Tautan
          </button>
          {current && (
            <button className="gsm dgr" onClick={() => setProfileImage(key, "")}>
              Hapus
            </button>
          )}
          <input
            ref={(el) => {
              files.current[key] = el;
            }}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void pick(key, e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {linkFor === key && (
          <div className="pslink">
            <input
              className="inp"
              value={link}
              autoFocus
              placeholder="https://…"
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveLink()}
            />
            <button className="gsm" onClick={saveLink}>
              Simpan
            </button>
            <button className="gsm" onClick={() => setLinkFor(null)}>
              Batal
            </button>
          </div>
        )}
      </div>
    );
  });

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal psheet" onClick={(e) => e.stopPropagation()}>
        <div className="mhd">
          <div>
            <div className="mtl">Profil</div>
            <div className="msub">
              {user?.email || (guest ? "Tamu — tersimpan di browser ini" : "Tersimpan di browser ini")}
            </div>
          </div>
          <button className="xbtn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="mbd">
          <div className="bpban psprev" style={profile.bg ? { backgroundImage: `url("${profile.bg}")` } : undefined}>
            {!profile.bg && <div className="bpbangrid" aria-hidden />}
            <div className="bpbanveil" aria-hidden />
            <div className="bpavwrap">
              <span className="bpavbtn">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- avatar host varies; no loader config needed
                  <img className="bpavimg" src={photo} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="bpavimg bpavtx">{initials}</span>
                )}
              </span>
              <span className="bppro">PRO</span>
            </div>
          </div>

          <div className="pshd">Gambar</div>
          {rows}

          <div className="pssep" />
          <div className="pshd">Fitur</div>
          {FEATURES.map((r) => (
            <button className="bprow" key={r.key} onClick={() => toggleFeature(r.key)}>
              <span className="bprowtx">
                <span className="bprowt">{r.label}</span>
                <span className="bprows">{r.sub}</span>
              </span>
              <span className={"swt" + (features[r.key] ? " on" : "")} role="switch" aria-checked={features[r.key]}>
                <i />
              </span>
            </button>
          ))}
          <div className="bpmnote">
            Mematikan fitur hanya menyembunyikannya — datanya tetap tersimpan dan kembali utuh saat
            dinyalakan lagi.
          </div>

          {features.portfolio && (
            <>
              <div className="pssep" />
              <div className="pshd">Kunci Portfolio</div>
              <div className="psrow">
                <div className="psrowhd">
                  <span className="psrowt">Passcode</span>
                  <span className="psrows">{pfUnlocked ? "Terbuka sesi ini" : "Terkunci"}</span>
                </div>
                <div className="psacts">
                  <input
                    className="inp mono"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    placeholder="1234"
                    style={{ flex: 1, minWidth: 90 }}
                  />
                  <button className="gsm" onClick={() => setLock(pass, bg)}>Simpan</button>
                </div>
              </div>
              <div className="psrow">
                <div className="psrowhd">
                  <span className="psrowt">Latar layar kunci</span>
                  <span className="psrows">{bg ? "Dari tautan" : "Polos"}</span>
                </div>
                <div className="psacts">
                  <input
                    className="inp"
                    value={bg}
                    onChange={(e) => setBg(e.target.value)}
                    placeholder="https://…/photo.jpg"
                    style={{ flex: 1, minWidth: 120 }}
                  />
                  <button className="gsm" onClick={() => setLock(pass, bg)}>Simpan</button>
                </div>
                {bg && <div className="lockprev" style={{ backgroundImage: `url("${bg}")`, marginTop: 10, marginBottom: 0 }} />}
              </div>
              {pfUnlocked && (
                <button className="bpitem" onClick={() => { onClose(); lockNow(); }}>
                  Kunci sekarang
                </button>
              )}
            </>
          )}

          <div className="pssep" />
          {/* Additive by design (see `applySetup`) — re-running it tops the
              ledger up with what's missing, it never replaces what's there. */}
          <button className="bpitem" onClick={() => { onClose(); startSetup(); }}>
            Jalankan penyiapan awal
          </button>
          <a className="bpitem" href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">
            Kelola 2FA di Google
            <svg className="bpext" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
          </a>
          {user && (
            <button className="bpitem danger" onClick={() => void signOut()}>
              Sign out
            </button>
          )}

          {guest && (
            <>
              <div className="bpmnote">
                Pembukuan tamu ini hanya ada di browser ini — tidak ada yang dikirim ke server.
                Masuk dengan Google membuka pembukuan kosong milikmu sendiri; data tamu tidak ikut.
              </div>
              <button className="bpitem" onClick={() => leaveGuest(false)}>
                Keluar — data tetap di browser ini
              </button>
              <button className="bpitem danger" onClick={() => leaveGuest(true)}>
                Keluar &amp; hapus data tamu
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
