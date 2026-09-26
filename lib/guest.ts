/**
 * Guest mode — using the app without an account.
 *
 * A guest ledger never reaches the server. The only thing that leaves a trace
 * outside the page is a small cookie marking this browser as a guest, so a
 * reload doesn't drop you back on the sign-in screen. The books themselves are
 * far too big for a cookie (4 KB, and a profile photo alone can be ~900 KB), so
 * they live in `localStorage` — see `lib/storage.ts`.
 *
 * There is deliberately only one flavour of guest: it stays on this device and
 * it's still here tomorrow. A second, tab-lifetime variant only made the first
 * screen a decision instead of a door.
 */
const COOKIE = "ledgerGuest";
const YEAR = 60 * 60 * 24 * 365;

export function isGuest(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)ledgerGuest=browser/.test(document.cookie);
}

export function startGuest() {
  document.cookie = COOKIE + "=browser; Path=/; SameSite=Lax; Max-Age=" + YEAR;
}

/** Forget that this browser is a guest. Erasing the books is `wipeGuestLedger`. */
export function endGuest() {
  document.cookie = COOKIE + "=; Path=/; Max-Age=0; SameSite=Lax";
}

/** Where a guest's ledger is kept. */
export function guestStore(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
