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

/** A calendar year as columns of seven days, Sunday first. Days outside the year are null. */
export function yearWeeks(year: number): (string | null)[][] {
  const first = new Date(year, 0, 1);
  const last = new Date(year, 11, 31);
  const weeks: (string | null)[][] = [];
  let week: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (const d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    week.push(ymd(d));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

/** The month name above the column where the month starts. */
export function monthLabels(weeks: (string | null)[][]): { col: number; label: string }[] {
  const out: { col: number; label: string }[] = [];
  weeks.forEach((w, col) => {
    const first = w.find((d): d is string => d !== null);
    if (!first) return;
    const day = Number(first.slice(8));
    // A month is named over the first week that holds its 1st (or, for January, the first week).
    const holdsFirst = w.some((d) => d !== null && d.endsWith("-01"));
    if (holdsFirst || (col === 0 && day <= 7)) {
      const month = holdsFirst ? (w.find((d) => d?.endsWith("-01")) as string) : first;
      out.push({ col, label: parseYmd(month).toLocaleDateString([], { month: "short" }) });
    }
  });
  return out;
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
