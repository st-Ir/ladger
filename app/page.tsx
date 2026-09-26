import LedgerApp from "@/components/LedgerApp";
import { authConfigured } from "@/lib/auth";

// `authConfigured` reads the environment, so the page must be evaluated per
// request — prerendering it would bake in whatever was set at build time.
export const dynamic = "force-dynamic";

export default function Page() {
  // Without Google credentials the app stays usable as a single local ledger —
  // the sign-in gate only appears once auth is actually configured.
  return <LedgerApp authConfigured={authConfigured} />;
}
