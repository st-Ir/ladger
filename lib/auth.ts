import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/**
 * Google sign-in, JWT sessions, no database.
 *
 * Two-step verification is deliberately *not* reimplemented here: whether a
 * second factor is required is decided by the user's Google account, so enabling
 * 2FA at myaccount.google.com/security is what protects this app. Rolling our own
 * TOTP would mean storing secrets and recovery codes we have nowhere safe to put.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // `token.sub` is Google's stable account id — it becomes the storage
    // namespace for this person's ledger (see lib/storage.ts).
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
  pages: { signIn: "/" },
};

/** True when Google credentials are configured — the UI says so instead of failing. */
export const authConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
