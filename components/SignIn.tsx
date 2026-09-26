"use client";

import { useEffect, useState, type ReactNode } from "react";
import { signIn } from "next-auth/react";

/** Google's mark, so the button reads as an official sign-in affordance. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

/**
 * The fine print. The first screen stays short — every one of these is a link
 * that opens the full text, so nobody has to read it to get in.
 */
const INFO: { id: string; link: string; title: string; body: ReactNode }[] = [
  {
    id: "what",
    link: "Apa ini?",
    title: "Apa ini?",
    body: (
      <>
        <p>Ledger menyatukan kas, arus uang, dan portofolio dalam satu halaman.</p>
        <p>
          Tiap akun punya pembukuan dan preferensinya sendiri — termasuk pilihan untuk
          menyalakan atau mematikan Portfolio dan FX effect.
        </p>
      </>
    ),
  },
  {
    id: "guest",
    link: "Mode tamu",
    title: "Mode tamu",
    body: (
      <>
        <p>
          Kamu mulai dari pembukuan kosong dan mengisinya lewat penyiapan singkat. Semuanya
          tinggal di browser ini dan <b>tidak pernah dikirim ke server</b>.
        </p>
        <p>Datanya masih ada saat kamu buka lagi nanti, dan bisa dihapus kapan saja dari menu Profil.</p>
        <p>
          Masuk dengan Google nanti membuka pembukuan kosong milikmu sendiri — data tamu tidak
          ikut pindah.
        </p>
      </>
    ),
  },
  {
    id: "2fa",
    link: "Verifikasi 2 langkah",
    title: "Verifikasi 2 langkah",
    body: (
      <p>
        Login ditangani akun Google-mu, jadi 2FA mengikuti pengaturan di sana —{" "}
        <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">
          myaccount.google.com/security
        </a>
        .
      </p>
    ),
  },
];

export default function SignIn({
  configured,
  onGuest,
}: {
  configured: boolean;
  onGuest: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const open = INFO.find((i) => i.id === info);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setInfo(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="signin">
      <div className="sicard">
        <div className="sihead">
          <div className="blogo">L</div>
          <div>
            <div className="bname">Ledger</div>
            <div className="bsub">Money OS</div>
          </div>
        </div>

        <div className="sipat" aria-hidden />
        <div className="sikick">ACCESS // 00</div>
        <h1 className="sittl">Mulai pembukuanmu</h1>
        <p className="sisub">Belum ada apa-apa di sini sampai kamu memilih cara masuk.</p>

        {configured ? (
          <button className="sibtn" disabled={busy} onClick={() => { setBusy(true); void signIn("google"); }}>
            <GoogleMark />
            {busy ? "Menghubungkan…" : "Lanjutkan dengan Google"}
          </button>
        ) : (
          <div className="siwarn">
            <b>Google sign-in belum dikonfigurasi.</b> Isi <code>GOOGLE_CLIENT_ID</code> dan{" "}
            <code>GOOGLE_CLIENT_SECRET</code> di <code>.env.local</code> (lihat{" "}
            <code>.env.local.example</code>), lalu jalankan ulang <code>npm run dev</code>.
          </div>
        )}

        <div className="sisep">
          <span>atau</span>
        </div>

        <button className="sigst" onClick={onGuest}>
          <span className="sigtx">
            <span className="sigt">Lihat-lihat dulu</span>
            <span className="sigs">Pembukuan sendiri, tersimpan di browser ini saja.</span>
          </span>
          <span className="sigar" aria-hidden>
            →
          </span>
        </button>

        <div className="silinks">
          {INFO.map((i) => (
            <button className="silink" key={i.id} onClick={() => setInfo(i.id)}>
              {i.link}
            </button>
          ))}
        </div>
      </div>

      {open && (
        <div className="ov" onClick={() => setInfo(null)}>
          <div className="modal siinfo" onClick={(e) => e.stopPropagation()}>
            <div className="mhd">
              <div>
                <div className="mtl">{open.title}</div>
                <div className="msub">ACCESS // 00</div>
              </div>
              <button className="xbtn" onClick={() => setInfo(null)}>
                ×
              </button>
            </div>
            <div className="mbd">{open.body}</div>
          </div>
        </div>
      )}
    </div>
  );
}
