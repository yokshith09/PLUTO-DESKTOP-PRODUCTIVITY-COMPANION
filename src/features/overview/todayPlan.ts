/**
 * Today's plan (owner 2026-11-02): the order of today's tasks, the task you are doing now, and a
 * "Next up" queue (no limit). Pure functions; the hook in `useTodayPlan` stores the result.
 */
import type { Priority, Task } from "@/ipc";

export type OrderMode = "mine" | "priority" | "due";
export const ORDER_MODES: { id: OrderMode; label: string }[] = [
  { id: "mine", label: "My order" },
  { id: "priority", label: "Priority" },
  { id: "due", label: "Due" },
];

export interface TodayPlan {
  mode: OrderMode;
  /** Task ids in your own order; tasks not in it keep the order they come in, after these. */
  mine: string[];
  /** The Next up queue, first = the one that starts next. */
  next: string[];
}

export const EMPTY_PLAN: TodayPlan = { mode: "mine", mine: [], next: [] };

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];

/** A stored plan, with anything broken dropped. */
export function cleanPlan(stored: unknown): TodayPlan {
  if (!stored || typeof stored !== "object") return EMPTY_PLAN;
  const s = stored as Record<string, unknown>;
  const mode = ORDER_MODES.some((m) => m.id === s.mode) ? (s.mode as OrderMode) : "mine";
  return { mode, mine: ids(s.mine), next: ids(s.next) };
}

const RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Today's tasks in the chosen order. Ties keep the order they came in. */
export function orderTasks<T extends { task: Task }>(rows: T[], plan: TodayPlan): T[] {
  const at = (r: T, i: number) => ({ r, i });
  const list = rows.map(at);
  if (plan.mode === "priority") {
    list.sort((a, b) => (a.r.task.priority ? RANK[a.r.task.priority] : 3) - (b.r.task.priority ? RANK[b.r.task.priority] : 3) || a.i - b.i);
  } else if (plan.mode === "due") {
    list.sort((a, b) => (a.r.task.due_date ?? "9999").localeCompare(b.r.task.due_date ?? "9999") || a.i - b.i);
  } else {
    const pos = (id: string) => {
      const p = plan.mine.indexOf(id);
      return p < 0 ? Number.MAX_SAFE_INTEGER : p;
    };
    list.sort((a, b) => pos(a.r.task.id) - pos(b.r.task.id) || a.i - b.i);
  }
  return list.map((x) => x.r);
}

/** The queue with finished or missing tasks taken out. */
export function liveQueue(plan: TodayPlan, open: string[]): string[] {
  return plan.next.filter((id) => open.includes(id));
}

/** "Move to next": the task goes to the front of Next up. */
export function moveToNext(plan: TodayPlan, id: string): TodayPlan {
  return { ...plan, next: [id, ...plan.next.filter((x) => x !== id)] };
}

/** Add to the end of Next up. */
export function addToQueue(plan: TodayPlan, id: string): TodayPlan {
  return plan.next.includes(id) ? plan : { ...plan, next: [...plan.next, id] };
}

const swap = (list: string[], i: number, j: number) => list.map((x, k) => (k === i ? (list[j] ?? x) : k === j ? (list[i] ?? x) : x));

export function takeOut(plan: TodayPlan, id: string): TodayPlan {
  return { ...plan, next: plan.next.filter((x) => x !== id) };
}

/** One place up in Next up (the first stays first). */
export function queueUp(plan: TodayPlan, id: string): TodayPlan {
  const i = plan.next.indexOf(id);
  if (i <= 0) return plan;
  return { ...plan, next: swap(plan.next, i - 1, i) };
}

/** One place up or down in your own order (switches to My order, starting from what you see). */
export function moveInOrder(plan: TodayPlan, shown: string[], id: string, by: -1 | 1): TodayPlan {
  const list = [...shown];
  const i = list.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return { ...plan, mode: "mine", mine: list };
  return { ...plan, mode: "mine", mine: swap(list, i, j) };
}

/**
 * What to start when the task now in progress ends (done or Next): the first open task in the
 * queue that is not the current one, and the queue without it. Starts right away (owner: no ask).
 */
export function following(plan: TodayPlan, open: string[], current: string | null): { start: string | null; plan: TodayPlan } {
  const queue = liveQueue(plan, open).filter((id) => id !== current);
  const start = queue[0] ?? null;
  return { start, plan: { ...plan, next: start ? plan.next.filter((x) => x !== start && x !== current) : plan.next.filter((x) => x !== current) } };
}
