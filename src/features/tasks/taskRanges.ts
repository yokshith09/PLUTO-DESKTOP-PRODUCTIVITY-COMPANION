import type { Priority, Task, TaskRow } from "@/ipc";
import { parseYmd, ymd } from "@/lib/dates";

/**
 * Which tasks a day or a range holds, and which were missed (owner 2026-11-19: Tasks showed only
 * today's and overdue-deadline tasks, so a task planned for an earlier day with no deadline was in no
 * view but All, and "Upcoming" could not look past 7 days). Pure; the page applies them to every task.
 */
const open = (t: Task) => t.status !== "COMPLETED" && t.status !== "CANCELLED";

/** Every day a task is planned or due on (a repeating task counts only its first planned day). */
export const taskDays = (t: Task): string[] =>
  [...new Set([t.planned_date, t.due_date, ...t.days].filter((d): d is string => !!d))].sort();

/** Open, not repeating, and every one of its days is before today. */
export function isMissed(t: Task, today: string): boolean {
  if (!open(t) || t.repeat) return false;
  const days = taskDays(t);
  return days.length > 0 && (days[days.length - 1] ?? today) < today;
}

/** Open, not repeating, with a day (planned or deadline) from `from` to `to` inclusive. */
export function inRange(t: Task, from: string, to: string): boolean {
  return open(t) && !t.repeat && taskDays(t).some((d) => d >= from && d <= to);
}

/** The last day of today's month. */
export function monthEnd(today: string): string {
  const d = parseYmd(today);
  return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export const plusDays = (day: string, n: number): string => {
  const d = parseYmd(day);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

export interface Narrow { priority?: Priority | ""; project?: string }
/** The priority and project filters, for lists built here and not by the core. */
export function narrow(rows: TaskRow[], f: Narrow): TaskRow[] {
  return rows.filter(({ task }) =>
    (!f.priority || task.priority === f.priority) && (!f.project || (task.project ?? "").toLowerCase() === f.project.toLowerCase()));
}

const first = (t: Task, from: string) => taskDays(t).find((d) => d >= from) ?? "9999";
/** Rows in a range, earliest day first, then starred. */
export function rowsInRange(rows: TaskRow[], from: string, to: string): TaskRow[] {
  return rows.filter((r) => inRange(r.task, from, to))
    .sort((a, b) => first(a.task, from).localeCompare(first(b.task, from)) || Number(b.task.starred) - Number(a.task.starred));
}

/** Missed tasks, the most recent first. */
export function missedRows(rows: TaskRow[], today: string): TaskRow[] {
  return rows.filter((r) => isMissed(r.task, today))
    .sort((a, b) => (taskDays(b.task).at(-1) ?? "").localeCompare(taskDays(a.task).at(-1) ?? ""));
}
