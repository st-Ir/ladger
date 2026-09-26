import { TODAY } from "./config";
import { parseDate } from "./format";
import type { Plan, Preset } from "./types";

function dstr(dt: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return dt.getFullYear() + "-" + p(dt.getMonth() + 1) + "-" + p(dt.getDate());
}

function clampDay(y: number, m: number, day: number): Date {
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(Math.max(1, day), last));
}

/** Next occurrence strictly after `from` for the preset's schedule. */
function advance(p: Preset, from: Date): Date {
  const f = p.freq || "monthly";
  if (f === "daily") {
    const d = new Date(from);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (f === "weekly") {
    const t = p.day == null ? 1 : +p.day;
    const d = new Date(from);
    let add = ((t - d.getDay()) + 7) % 7;
    if (add === 0) add = 7;
    d.setDate(d.getDate() + add);
    return d;
  }
  const day = p.day == null ? 1 : +p.day;
  let y = from.getFullYear();
  let m = from.getMonth();
  let c = clampDay(y, m, day);
  if (c.getTime() <= from.getTime()) {
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
    c = clampDay(y, m, day);
  }
  return c;
}

function startCursor(p: Preset): Date {
  if (p.lastRun) return parseDate(p.lastRun);
  const c = parseDate(p.created || TODAY);
  c.setDate(c.getDate() - 1);
  return c;
}

/** All occurrence dates (YYYY-MM-DD) that are due up to and including TODAY. */
export function dueOccurrences(p: Preset): string[] {
  const today = parseDate(TODAY);
  const out: string[] = [];
  let cur = startCursor(p);
  let next = advance(p, cur);
  let g = 0;
  while (next && next.getTime() <= today.getTime() && g < 500) {
    out.push(dstr(next));
    cur = next;
    next = advance(p, cur);
    g++;
  }
  return out;
}

/** The next future run date (or null). */
export function nextRun(p: Preset): Date | null {
  const today = parseDate(TODAY);
  let cur = startCursor(p);
  let next = advance(p, cur);
  let g = 0;
  while (next && next.getTime() <= today.getTime() && g < 500) {
    cur = next;
    next = advance(p, cur);
    g++;
  }
  return next;
}

export function nextRunStr(p: Preset): string | null {
  const nr = nextRun(p);
  return nr ? dstr(nr) : null;
}

export function scheduleText(p: Preset): string {
  const f = p.freq || "monthly";
  if (f === "daily") return "Every day";
  if (f === "weekly")
    return (
      "Every " +
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][p.day == null ? 1 : +p.day]
    );
  return "Monthly · day " + (p.day == null ? 1 : +p.day);
}

/** Resolve a trade plan's status from its price relative to entry/TP/SL. */
export function evalStatus(p: {
  side: string;
  price: number;
  tp: number;
  sl: number;
  entry: number;
  ref: number;
}): Plan["status"] {
  const long = p.side !== "Short";
  const tpHit = long ? p.price >= p.tp : p.price <= p.tp;
  const slHit = long ? p.price <= p.sl : p.price >= p.sl;
  if (tpHit) return "hit";
  if (slHit) return "stopped";
  const upTrig = p.entry >= p.ref;
  const entryHit = upTrig ? p.price >= p.entry : p.price <= p.entry;
  return entryHit ? "active" : "waiting";
}
