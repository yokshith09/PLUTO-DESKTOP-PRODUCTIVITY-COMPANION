// Pure rules for the Course page (no React, no IPC), so each one has a test.
import type { CourseDate, CourseExam, Topic } from "@/ipc/types";
import { daysBetween, parseYmd } from "@/lib/dates";

/** The four states a topic can be in. The student chooses; Pluto never guesses. */
export const STATUSES = [
  { label: "To learn", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  { label: "Learning", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { label: "Revise", tone: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  { label: "Exam-ready", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
] as const;

/** Course colours (an index is stored, never a raw value). */
export const COURSE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6", "#ec4899", "#64748b"] as const;
export const courseColor = (i: number): string => COURSE_COLORS[((i % 8) + 8) % 8] ?? COURSE_COLORS[0];

export const DATE_KINDS = [
  { id: "assignment", label: "Assignment" },
  { id: "lab", label: "Lab" },
  { id: "quiz", label: "Quiz" },
  { id: "project", label: "Project" },
  { id: "other", label: "Other" },
] as const;
export const kindLabel = (id: string): string => DATE_KINDS.find((k) => k.id === id)?.label ?? "Other";

/** "Advanced Algorithms & Analysis" is "AAA": the first letter of up to three words. */
export function initials(name: string): string {
  const words = name.split(/[\s&/,-]+/).filter((w) => /\p{L}/u.test(w));
  const first = words.slice(0, 3).map((w) => (Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ""))[0] ?? "").toUpperCase());
  return first.join("") || "?";
}

export const pointsIn = (t: Topic): number => t.subtopics.reduce((n, s) => n + s.points.length, 0);
export const writtenIn = (t: Topic): number => t.subtopics.reduce((n, s) => n + s.points.filter((p) => p.written).length, 0);
export const progressOf = (t: Topic): { done: number; total: number } => ({ done: t.subtopics.filter((s) => s.done).length, total: t.subtopics.length });

export type TopicFilter = "all" | "starred" | "not_ready";

/** Topics matching the search words and the chip. "Not ready" is everything not marked Exam-ready. */
export function filterTopics(topics: Topic[], filter: TopicFilter, query: string): Topic[] {
  const q = query.trim().toLowerCase();
  return topics.filter((t) => {
    if (filter === "starred" && !t.starred) return false;
    if (filter === "not_ready" && t.status === 3) return false;
    return !q || t.title.toLowerCase().includes(q) || t.subtopics.some((s) => s.title.toLowerCase().includes(q));
  });
}

export function filterCounts(topics: Topic[]): Record<TopicFilter, number> {
  return { all: topics.length, starred: topics.filter((t) => t.starred).length, not_ready: topics.filter((t) => t.status !== 3).length };
}

/** How many topics are exam-ready, and how many sit in each state. */
export function readiness(topics: Topic[]): { ready: number; total: number; byStatus: number[] } {
  const byStatus = [0, 0, 0, 0];
  for (const t of topics) byStatus[Math.min(t.status, 3)] = (byStatus[Math.min(t.status, 3)] ?? 0) + 1;
  return { ready: byStatus[3] ?? 0, total: topics.length, byStatus };
}

/** The soonest exam today or later. */
export function nextExam(exams: CourseExam[], today: string): CourseExam | undefined {
  return exams.filter((e) => e.on_date >= today).sort((a, b) => a.on_date.localeCompare(b.on_date) || a.at_time.localeCompare(b.at_time))[0];
}

export function inDaysLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export const daysUntil = (today: string, date: string): number => daysBetween(today, date);

export function shortDate(ymd: string): string {
  return parseYmd(ymd).toLocaleDateString("en", { day: "numeric", month: "short" });
}

/** "10:00" as "10:00 AM"; empty stays empty. */
export function clockLabel(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** "16 Nov, 10:00 AM" (the time is left out when there is none). */
export function whenLabel(e: { on_date: string; at_time: string }): string {
  return [shortDate(e.on_date), clockLabel(e.at_time)].filter(Boolean).join(", ");
}

/** The names on an exam's chips: the topics it covers, or "All Topics". */
export function examChips(e: CourseExam, topics: Topic[]): string[] {
  const chosen = topics.filter((t) => e.topic_ids.includes(t.id));
  return chosen.length === 0 || chosen.length === topics.length ? ["All Topics"] : chosen.map((t) => t.title);
}

/** Dates that are not past, soonest first, then the past ones. */
export function orderDates(dates: CourseDate[], today: string): CourseDate[] {
  const up = dates.filter((d) => d.on_date >= today).sort((a, b) => a.on_date.localeCompare(b.on_date));
  const past = dates.filter((d) => d.on_date < today).sort((a, b) => b.on_date.localeCompare(a.on_date));
  return [...up, ...past];
}

/** Focus time: "4 h 35 m", or "0 m". */
export function focusLabel(ms: number): string {
  const min = Math.floor(ms / 60_000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} m` : `${min} m`;
}
