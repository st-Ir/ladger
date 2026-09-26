"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useLedger } from "@/lib/store";
import { derive } from "@/lib/derive";
import { ANON_KEY } from "@/lib/storage";
import { endGuest, isGuest, startGuest } from "@/lib/guest";
import type { LedgerState } from "@/lib/types";
import SignIn from "./SignIn";
import Setup from "./Setup";
import Topbar from "./Topbar";
import Dashboard from "./sections/Dashboard";
import Cash from "./sections/Cash";
import Flow from "./sections/Flow";
import Portfolio from "./sections/Portfolio";
import ThemeDrawer from "./ThemeDrawer";
import Modal from "./Modal";
import { TargetBookSheet } from "./TargetBook";
import QuickAdd from "./QuickAdd";
import Toast from "./Toast";
import { useFxFeed } from "./useFxFeed";

export default function LedgerApp({ authConfigured }: { authConfigured: boolean }) {
  const s = useLedger();
  const activeColors = useLedger((st) => st.activeColors);
  const { data: session, status } = useSession();
  // `undefined` = the guest cookie hasn't been read yet. It can only be read on
  // the client, so the gate has to wait rather than flash the sign-in screen at
  // someone who already chose to browse as a guest.
  const [guest, setGuest] = useState<boolean | undefined>(undefined);
  useEffect(() => setGuest(isGuest()), []);

  const signedIn = session?.user?.id ?? null;
  // Whose ledger to load. Without Google credentials there's nobody to sign in
  // as, so the app keeps working as a single local ledger. A guest shares that
  // same anonymous key — what changes is where `lib/storage.ts` puts it.
  const userKey = !authConfigured ? ANON_KEY : signedIn ?? (guest ? ANON_KEY : null);
  // Wait for stored prefs: polling on the seed default would hit /api/fx once
  // even for someone who has the FX effect switched off.
  useFxFeed(s.hydrated && s.features.fx);

  // Signing in ends guest mode. Declared before the loader below so the cookie is
  // already gone by the time it picks a storage adapter — and so signing out
  // later lands on the sign-in screen instead of silently reopening guest books.
  useEffect(() => {
    if (!signedIn || !guest) return;
    endGuest();
    setGuest(false);
  }, [signedIn, guest]);

  // Load this account's prefs + run due recurring transactions. Re-runs when the
  // signed-in account changes, so switching users swaps ledgers.
  useEffect(() => {
    if (!userKey) return;
    const st = useLedger.getState();
    st.setUserKey(userKey);
    void st.hydrate();
  }, [userKey]);

  // Apply the active theme's CSS variables to the document (mirrors applyColors).
  useEffect(() => {
    const c = activeColors();
    const r = document.documentElement;
    Object.keys(c).forEach((k) => r.style.setProperty("--" + k, (c as any)[k]));
    try {
      document.body.style.background = c.bg;
    } catch {}
  }, [activeColors, s.theme, s.overrides]);

  const v = useMemo(() => derive(s as unknown as LedgerState), [s]);

  if (authConfigured && (status === "loading" || guest === undefined))
    return (
      <div className="signin">
        <div className="siload">Memuat sesi…</div>
      </div>
    );

  if (!userKey)
    return (
      <SignIn
        configured={authConfigured}
        onGuest={() => {
          startGuest();
          setGuest(true);
        }}
      />
    );

  // A signed-in ledger comes from the server, so it isn't there on first paint.
  // Waiting also stops an early edit from persisting seed data over the real books.
  if (!s.hydrated)
    return (
      <div className="signin">
        <div className="siload">Memuat ledger…</div>
      </div>
    );

  // A ledger that has never been furnished has nothing to spend from and nothing
  // to file an expense under, so the wizard comes before the shell.
  if (!s.setupDone) return <Setup />;

  return (
    <div className={"app " + v.shellCls}>
      <div className="main">
        <Topbar v={v} />
        <div className={"content" + (v.pfLocked ? " flush" : "")}>
          {v.show.dashboard && <Dashboard v={v} />}
          {v.show.cash && <Cash v={v} />}
          {v.show.flow && <Flow v={v} />}
          {v.show.portfolio && <Portfolio v={v} />}
        </div>
      </div>

      <ThemeDrawer v={v} />
      <Modal v={v} />
      <TargetBookSheet />
      <QuickAdd v={v} />
      <Toast v={v} />
    </div>
  );
}
