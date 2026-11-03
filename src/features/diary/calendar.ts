import type { DayInfo } from "@/ipc";
import { daysBetween, parseYmd, ymd } from "@/lib/dates";

/** How strongly a day is drawn, like the squares of a commit tracker: 0 is no entry. */
export type Level = 0 | 1 | 2 | 3 | 4;

/** By how much was written: a line or two, a paragraph, a page, a lot. */
export function level(info: Pick<DayInfo, "words" | "entries"> | null | undefined): Level {
  if (!info || info.entries === 0) return 0;
  if (info.words >= 250) return 4;
  if (info.words >= 120) return 3;
  if (info.words >= 40) return 2;
  return 1;
}

/** The run of days in a row that have an entry: now (today, or yesterday if today is still empty) and the longest ever. */
export function streaks(days: readonly string[], today: string): { current: number; longest: number } {
  const set = new Set(days);
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let current = 0;
  const cursor = parseYmd(set.has(today) ? today : ymd(new Date(parseYmd(today).getTime() - 86_400_000)));
  while (set.has(ymd(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}

/** Entries and days in one year. */
export function yearTotals(infos: readonly DayInfo[], year: number): { entries: number; days: number; words: number } {
  const prefix = `${year}-`;
  return infos.filter((i) => i.day.startsWith(prefix)).reduce(
    (t, i) => ({ entries: t.entries + i.entries, days: t.days + 1, words: t.words + i.words }),
    { entries: 0, days: 0, words: 0 },
  );
}

/** Entries and days in one month ("YYYY-MM-01" or any day of it). */
export function monthTotals(infos: readonly DayInfo[], month: string): { entries: number; days: number; words: number } {
  const prefix = month.slice(0, 7);
  return infos.filter((i) => i.day.startsWith(prefix)).reduce(
    (t, i) => ({ entries: t.entries + i.entries, days: t.days + 1, words: t.words + i.words }),
    { entries: 0, days: 0, words: 0 },
  );
}

/** Days written in each month of a year (index 0 is January), for the strip that jumps between months. */
export function monthCounts(infos: readonly DayInfo[], year: number): number[] {
  const out = Array.from({ length: 12 }, () => 0);
  for (const i of infos) if (i.day.startsWith(`${year}-`) && i.entries > 0) out[Number(i.day.slice(5, 7)) - 1] = (out[Number(i.day.slice(5, 7)) - 1] ?? 0) + 1;
  return out;
}
