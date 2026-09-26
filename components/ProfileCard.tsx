"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useLedger } from "@/lib/store";
import ProfileSheet, { initialsOf } from "./ProfileSheet";

/**
 * The banner at the top of the dashboard: a cover image and an avatar, nothing
 * else. Everything you can *do* with the account — swapping either image, the
 * Portfolio / FX switches, signing out — lives behind the avatar in
 * {@link ProfileSheet}.
 */
export default function ProfileCard() {
  const { data: session } = useSession();
  const profile = useLedger((s) => s.profile);
  const [open, setOpen] = useState(false);

  const photo = profile.photo || session?.user?.image || "";
  const initials = initialsOf(session?.user?.name);

  return (
    <>
      <div className="bpban" style={profile.bg ? { backgroundImage: `url("${profile.bg}")` } : undefined}>
        {!profile.bg && <div className="bpbangrid" aria-hidden />}
        <div className="bpbanveil" aria-hidden />
        <div className="bpavwrap">
          <button className="bpavbtn" onClick={() => setOpen(true)} title="Pengaturan profil" aria-label="Pengaturan profil">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar host varies; no loader config needed
              <img className="bpavimg" src={photo} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="bpavimg bpavtx">{initials}</span>
            )}
          </button>
          <span className="bppro">PRO</span>
        </div>
      </div>

      {open && <ProfileSheet onClose={() => setOpen(false)} />}
    </>
  );
}
