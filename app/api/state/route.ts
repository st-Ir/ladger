import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import fs from "node:fs/promises";
import path from "node:path";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The signed-in user's ledger, stored on the server so it follows the Google
 * account instead of living in one browser.
 *
 * One JSON file per account under `.data/` (override with `LEDGER_DATA_DIR`).
 * The file name comes from the session, never from the request body — a client
 * can only ever read or write its own ledger.
 */
const DATA_DIR = process.env.LEDGER_DATA_DIR || path.join(process.cwd(), ".data");

/** Guard against a huge blob (profile photo + cover are data URLs) filling the disk. */
const MAX_BYTES = 8 * 1024 * 1024;

/** Google's `sub` is digits, but never trust it straight into a path. */
function fileFor(userId: string) {
  const safe = userId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 96);
  if (!safe) throw new Error("empty user id");
  return path.join(DATA_DIR, safe + ".json");
}

async function userId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id || null;
}

/**
 * The client names the account it *thinks* it's talking to. A debounced write
 * queued before a sign-out could otherwise land after the next person signs in
 * and be filed under their id — this makes that mismatch a hard error instead.
 */
function wrongAccount(req: Request, id: string) {
  const claimed = req.headers.get("x-ledger-user");
  return !!claimed && claimed !== id;
}

export async function GET(req: Request) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (wrongAccount(req, id))
    return NextResponse.json({ error: "account changed" }, { status: 409 });

  try {
    const raw = await fs.readFile(fileFor(id), "utf8");
    // An empty object means "no ledger yet" — the client then seeds, or adopts
    // whatever it already had in localStorage (see lib/storage.ts).
    return NextResponse.json(JSON.parse(raw) || {});
  } catch (e: any) {
    if (e?.code === "ENOENT") return NextResponse.json({});
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (wrongAccount(req, id))
    return NextResponse.json({ error: "account changed" }, { status: 409 });

  const body = await req.text();
  if (body.length > MAX_BYTES)
    return NextResponse.json({ error: "payload too large" }, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return NextResponse.json({ error: "expected an object" }, { status: 400 });

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const file = fileFor(id);
    // Write-then-rename: a crash mid-save leaves the previous ledger intact
    // rather than a half-written file that won't parse.
    const tmp = file + "." + Date.now() + ".tmp";
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, file);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
}
