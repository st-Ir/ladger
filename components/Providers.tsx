"use client";

import { SessionProvider } from "next-auth/react";

/** Client boundary for the session context, so `app/layout.tsx` stays a server component. */
export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
