import { STORAGE_KEY } from "./config";
import { guestStore } from "./guest";

/**
 * The one place that knows *where* a user's ledger lives.
 *
 * Signed out (or running without Google credentials) the ledger sits in this
 * browser's `localStorage`. Signed in, it lives on the server under the Google
 * account id, so the same books open on any device — with `localStorage` kept
 * as a mirror so a dropped connection never loses a write.
 *
 * The store only ever talks to this interface, so moving to a database later is
 * a matter of swapping the adapter — no changes to `lib/store.ts` or any component.
 */
export interface LedgerStorage {
  load(userKey: string): Promise<Record<string, unknown>>;
  save(userKey: string, data: Record<string, unknown>): Promise<void>;
}

/** The user key used before anyone signs in (and in local dev without auth). */
export const ANON_KEY = "local";

/** `ledgerPrefs.v1:<userKey>` — one blob per account, on this device. */
const keyFor = (userKey: string) => STORAGE_KEY + ":" + (userKey || ANON_KEY);

/** Which browser store the un-signed-in ledger uses. */
function browserStore(): Storage | null {
  return guestStore();
}

function readLocal(userKey: string): Record<string, unknown> {
  try {
    const store = browserStore();
    if (!store) return {};
    const k = keyFor(userKey);
    let raw = store.getItem(k);
    // Migration: the app used to keep a single un-namespaced blob. The first
    // time it loads, adopt that data instead of starting from seed.
    if (raw === null) {
      const legacy = store.getItem(STORAGE_KEY);
      if (legacy !== null) {
        store.setItem(k, legacy);
        raw = legacy;
      }
    }
    return JSON.parse(raw || "{}") || {};
  } catch {
    return {};
  }
}

function writeLocal(userKey: string, data: Record<string, unknown>) {
  try {
    browserStore()?.setItem(keyFor(userKey), JSON.stringify(data));
  } catch {}
}

export const localStorageAdapter: LedgerStorage = {
  async load(userKey) {
    return readLocal(userKey);
  },
  async save(userKey, data) {
    writeLocal(userKey, data);
  },
};

/** Erase a guest's books from this browser. */
export function wipeGuestLedger() {
  try {
    guestStore()?.removeItem(keyFor(ANON_KEY));
  } catch {}
}

/* ── Server-backed adapter ─────────────────────────────────────────────────── */

/**
 * How long to sit on a change before shipping it. Every mutation calls
 * `persist()`, and a form can fire several in a row — coalescing them keeps one
 * edit from turning into a burst of PUTs.
 */
const SYNC_DELAY = 700;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: { userKey: string; data: Record<string, unknown> } | null = null;
let flushBound = false;

async function put(userKey: string, data: Record<string, unknown>, keepalive = false) {
  try {
    const res = await fetch("/api/state", {
      method: "PUT",
      // `x-ledger-user` says which account this payload belongs to; the server
      // refuses it if the session has moved on (see app/api/state/route.ts).
      headers: { "Content-Type": "application/json", "x-ledger-user": userKey },
      body: JSON.stringify(data),
      keepalive,
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
  } catch (e) {
    // The mirror in localStorage already has it, so nothing is lost — the next
    // successful save (or a reload while offline) picks the data back up.
    console.warn("[ledger] gagal menyimpan ke server, memakai salinan lokal", e);
  }
}

function flush(keepalive = false) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const p = pending;
  pending = null;
  if (p) void put(p.userKey, p.data, keepalive);
}

/** Don't let a debounced write die with the tab. */
function bindFlush() {
  if (flushBound || typeof window === "undefined") return;
  flushBound = true;
  window.addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
}

export const apiStorageAdapter: LedgerStorage = {
  async load(userKey) {
    const local = readLocal(userKey);
    // Any write still sitting in the debounce belongs to the ledger we're about
    // to replace — get it out before loading the next one.
    flush();
    try {
      const res = await fetch("/api/state", {
        cache: "no-store",
        headers: { "x-ledger-user": userKey },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const server = (await res.json()) || {};

      // A successful-but-empty answer is authoritative: this account has no
      // ledger, so it opens on empty books. It deliberately adopts neither the
      // guest ledger this browser may hold nor the mirror below — otherwise
      // "a new account starts from zero" would quietly depend on which browser
      // you signed in from. Only a *failed* request falls back to the mirror.
      if (!Object.keys(server).length) return {};

      writeLocal(userKey, server);
      return server;
    } catch (e) {
      // Offline or the session expired mid-flight: fall back to the mirror so
      // the app still opens with this account's last known state.
      console.warn("[ledger] gagal memuat dari server, memakai salinan lokal", e);
      return local;
    }
  },

  async save(userKey, data) {
    // Mirror first: instant, and it survives a failed request.
    writeLocal(userKey, data);
    bindFlush();
    // A queued write belongs to whoever made it — ship it before switching accounts.
    if (pending && pending.userKey !== userKey) flush();
    pending = { userKey, data };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, SYNC_DELAY);
  },
};

/**
 * Signed-in ledgers go to the server; the anonymous one stays in this browser.
 * (`ANON_KEY` is also what runs when Google credentials aren't configured.)
 */
export function getStorage(userKey: string = ANON_KEY): LedgerStorage {
  return !userKey || userKey === ANON_KEY ? localStorageAdapter : apiStorageAdapter;
}
