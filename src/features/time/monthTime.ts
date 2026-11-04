import type { UsageSummary } from "@/ipc";

/** How strongly a day is drawn: 0 for nothing tracked, then four steps up to the busiest day of the month. */
export type TimeLevel = 0 | 1 | 2 | 3 | 4;

export function timeLevel(seconds: number, busiest: number): TimeLevel {
  if (seconds <= 0 || busiest <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil((seconds / busiest) * 4))) as TimeLevel;
}

/** A day's time by category, longest first (apps with no category are "Other"). */
export function dayCategories(summary: Pick<UsageSummary, "apps"> | undefined): [string, number][] {
  const by = new Map<string, number>();
  for (const a of summary?.apps ?? []) by.set(a.category || "Other", (by.get(a.category || "Other") ?? 0) + a.total_seconds);
  return [...by.entries()].sort((a, b) => b[1] - a[1]);
}

/** The month in numbers: total, days with time, the busiest day's seconds, and a plain average over tracked days. */
export function monthStats(perDay: readonly number[]): { total: number; tracked: number; busiest: number; average: number } {
  const tracked = perDay.filter((s) => s > 0);
  const total = tracked.reduce((n, s) => n + s, 0);
  return { total, tracked: tracked.length, busiest: Math.max(0, ...perDay), average: tracked.length ? Math.round(total / tracked.length) : 0 };
}
