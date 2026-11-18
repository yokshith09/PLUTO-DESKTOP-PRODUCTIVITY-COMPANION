// Pure rules for the timetable (no React, no IPC), so each one has a test.
import type { TimetableClass } from "@/ipc/types";
import { parseYmd } from "@/lib/dates";

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type View = {
  /** Minutes of the day the grid starts and ends at. */
  from: number;
  to: number;
  slot: 30 | 60 | 90;
  /** How many days from Monday are shown (5, 6 or 7). */
  days: 5 | 6 | 7;
  density: "compact" | "comfortable" | "roomy";
};
export const DEFAULT_VIEW: View = { from: 8 * 60, to: 18 * 60, slot: 60, days: 7, density: "comfortable" };
export const ROW_PX: Record<View["density"], number> = { compact: 36, comfortable: 48, roomy: 64 };

const pick = <T,>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** Reads the saved view; anything unreadable or out of range falls back to the default. */
export function parseView(raw: unknown): View {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : d);
  const from = num(r.from, 6 * 60, 12 * 60, DEFAULT_VIEW.from);
  const to = num(r.to, 14 * 60, 23 * 60, DEFAULT_VIEW.to);
  return {
    from: from - (from % 30), to: to - (to % 30),
    slot: pick(r.slot, [30, 60, 90] as const, 60), days: pick(r.days, [5, 6, 7] as const, 7),
    density: pick(r.density, ["compact", "comfortable", "roomy"] as const, "comfortable"),
  };
}

/** The ISO week number of a day (weeks start on Monday; week 1 holds the first Thursday). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}

/** Monday-based weekday of a date: 0 Monday ... 6 Sunday. */
export const weekday = (d: Date): number => (d.getDay() + 6) % 7;

/** Does the class take place on this calendar day? */
export function occursOn(c: TimetableClass, date: Date): boolean {
  if (weekday(date) !== c.day && c.repeat !== "once") return false;
  switch (c.repeat) {
    case "weekly": return true;
    case "odd": return isoWeek(date) % 2 === 1;
    case "even": return isoWeek(date) % 2 === 0;
    case "once": return !!c.once_date && parseYmd(c.once_date).toDateString() === date.toDateString();
    default: return false;
  }
}

/** The Monday of the week containing `d`. */
export function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - weekday(m));
  return m;
}

/** The classes of one calendar day, in time order. */
export function classesOn(all: TimetableClass[], date: Date): TimetableClass[] {
  return all.filter((c) => occursOn(c, date)).sort((a, b) => a.start_min - b.start_min || a.end_min - b.end_min);
}

export type Placed = { c: TimetableClass; lane: number; lanes: number };

/** Puts overlapping classes side by side: each gets a lane, and every class of an overlapping group
 * shares the same lane count, so none sits on top of another. */
export function layoutDay(list: TimetableClass[]): Placed[] {
  const sorted = [...list].sort((a, b) => a.start_min - b.start_min || b.end_min - a.end_min);
  const out: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;
  const close = () => { const lanes = Math.max(1, ...group.map((p) => p.lane + 1)); for (const p of group) p.lanes = lanes; out.push(...group); group = []; };
  for (const c of sorted) {
    if (group.length && c.start_min >= groupEnd) close();
    const taken = new Set(group.filter((p) => p.c.end_min > c.start_min).map((p) => p.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    group.push({ c, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, c.end_min);
  }
  if (group.length) close();
  return out;
}

/** Classes that fall (even partly) outside the shown hours. */
export const outsideHours = (list: TimetableClass[], v: View): TimetableClass[] => list.filter((c) => c.start_min < v.from || c.end_min > v.to);

/** A view widened just enough to hold every class (never narrower than the current one). */
export function widened(list: TimetableClass[], v: View): View {
  const lo = Math.min(v.from, ...list.map((c) => c.start_min));
  const hi = Math.max(v.to, ...list.map((c) => c.end_min));
  return { ...v, from: Math.max(6 * 60, lo - (lo % 30)), to: Math.min(23 * 60, Math.ceil(hi / 30) * 30) };
}

/** 570 as "9:30 AM". */
export function minuteLabel(m: number): string {
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** 570 as "09:30" for a time box. */
export const boxTime = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export function fromBoxTime(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The row labels: one per slot from the first hour to the last. */
export function slotStarts(v: View): number[] {
  const out: number[] = [];
  for (let m = v.from; m < v.to; m += v.slot) out.push(m);
  return out;
}

/** Snap a minute to the slot grid. */
export const snap = (m: number, slot: number): number => Math.floor(m / slot) * slot;
