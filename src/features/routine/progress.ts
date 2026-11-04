import { ymd } from "@/lib/dates";
import type { RoutineState } from "./routine";

/**
 * The routine tracker's numbers (FR-114, U-8; owner 2026-11-04: show what is missed most, but
 * appreciate and motivate, never disappoint). Pure functions over the stored state; every line of
 * words here is encouraging by construction: it names what went well, and what to do next, never a failure.
 */
export interface DayStat {
  day: string;
  /** Ids of the routines planned that day, or null when that day was not recorded (before the tracker, or a day Pluto was closed). */
  planned: string[] | null;
  done: string[];
}

const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

export function dayStat(s: RoutineState, day: string, today: string): DayStat {
  if (day === today) return { day, planned: [...new Set([...s.items.map((i) => i.id), ...s.done])], done: s.done };
  if (day > today) return { day, planned: null, done: [] };
  return { day, planned: s.planned[day] ?? null, done: s.history[day] ?? [] };
}

export const nameOf = (s: RoutineState, id: string): string => s.names[id] ?? s.items.find((i) => i.id === id)?.title ?? "A routine";

/** Done and planned counts over `days` days ending on `end`, counting only days that were recorded. */
export function rangeTotals(s: RoutineState, today: string, end: string, days: number): { done: number; planned: number; days: number } {
  let done = 0, planned = 0, counted = 0;
  for (let i = 0; i < days; i++) {
    const st = dayStat(s, addDays(end, -i), today);
    if (!st.planned) continue;
    counted += 1;
    planned += st.planned.length;
    done += st.done.filter((id) => st.planned?.includes(id)).length;
  }
  return { done, planned, days: counted };
}

/** The last 7 days (today included) against the 7 before. */
export function weekVsWeek(s: RoutineState, today: string) {
  return { thisWeek: rangeTotals(s, today, today, 7), lastWeek: rangeTotals(s, today, addDays(today, -7), 7) };
}

export interface HabitRate { id: string; title: string; done: number; planned: number; rate: number; last7: number }

/** Each current routine over the last 30 days: on how many days it was planned, and on how many done. Strongest first. */
export function habitRates(s: RoutineState, today: string, window = 30): HabitRate[] {
  return s.items
    .map((item) => {
      let done = 0, planned = 0, last7 = 0;
      for (let i = 0; i < window; i++) {
        const st = dayStat(s, addDays(today, -i), today);
        if (!st.planned?.includes(item.id)) continue;
        const ticked = st.done.includes(item.id);
        // Today is still open: a routine not ticked yet does not count against you.
        if (i === 0 && !ticked) continue;
        planned += 1;
        if (ticked) { done += 1; if (i < 7) last7 += 1; }
      }
      return { id: item.id, title: item.title, done, planned, rate: planned ? done / planned : 0, last7 };
    })
    .sort((a, b) => b.rate - a.rate || b.planned - a.planned);
}

/** The routine with the most room to grow: enough days to tell, and not already strong. Null when nothing fits. */
export function roomToGrow(rates: readonly HabitRate[]): HabitRate | null {
  const candidates = rates.filter((r) => r.planned >= 5 && r.rate < 0.9);
  return candidates.reduce<HabitRate | null>((low, r) => (!low || r.rate < low.rate ? r : low), null);
}

/** Words for the routine with the most room to grow: a next step, never a fault. */
export function roomLine(r: HabitRate): string {
  return `${r.title} is your next win: ${r.done} of ${r.planned} days so far. One tick today moves it up.`;
}

/** The week in a sentence that only ever lifts you. */
export function weekLine(w: ReturnType<typeof weekVsWeek>): string {
  const { thisWeek: a, lastWeek: b } = w;
  if (a.days === 0) return "A new week of small wins is waiting.";
  if (a.done > b.done && b.days > 0) return `${a.done - b.done} more done than last week. That is real progress.`;
  if (a.done > 0 && b.days === 0) return `${a.done} done this week. This is a great start.`;
  if (a.done > 0) return `${a.done} done this week, and the week is not over. Keep it going.`;
  return "The week is just starting. One tick makes it count.";
}

/** One encouraging line for the top of the tracker. */
export function encouragement(s: RoutineState, today: string): string {
  const n = s.items.length;
  if (n === 0) return "Add a routine to begin. Small things done daily add up.";
  const todayDone = s.done.filter((id) => s.items.some((i) => i.id === id)).length;
  if (todayDone >= n) return `All ${n} done today. What a day.`;
  if (todayDone > 0) return `${todayDone} of ${n} done today. Every tick counts.`;
  const w = weekVsWeek(s, today);
  if (w.thisWeek.done > w.lastWeek.done && w.lastWeek.days > 0) return `You are ahead of last week by ${w.thisWeek.done - w.lastWeek.done}. Keep going.`;
  const best = habitRates(s, today)[0];
  if (best && best.planned >= 5 && best.rate >= 0.6) return `${best.title}: ${best.done} of the last ${best.planned} days. That is real consistency.`;
  return "A fresh day. Pick one routine and tick it; that is a good start.";
}
