import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** Google's account id (`sub`) — the ledger's storage namespace. */
      id?: string;
    } & DefaultSession["user"];
  }
}
