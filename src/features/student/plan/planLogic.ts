// Pure rules for the Exams, notes, tasks tab.
import { daysBetween } from "@/lib/dates";

/** Keep an item when no course is chosen (any course counts) or its course is the chosen one. */
export const inFilter = (courseId: string | undefined, filter: string | null): boolean =>
  filter === null ? courseId !== undefined : courseId === filter;

/** A saved filter is only good while that course still exists. */
export const parseFilter = (raw: unknown): string | null => (typeof raw === "string" && raw ? raw : null);

export function splitExams<T extends { on_date: string }>(exams: T[], today: string): { upcoming: T[]; past: T[] } {
  const by = (a: T, b: T) => a.on_date.localeCompare(b.on_date);
  return { upcoming: exams.filter((e) => e.on_date >= today).sort(by), past: exams.filter((e) => e.on_date < today).sort((a, b) => by(b, a)) };
}

export function examWhen(today: string, date: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return d > 0 ? `${d} days` : `${-d} days ago`;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;
/** Done tasks stay visible for a week behind "Show done". */
export const doneRecently = (completedAt: number | null, now: number): boolean => completedAt !== null && now - completedAt <= WEEK_MS;
