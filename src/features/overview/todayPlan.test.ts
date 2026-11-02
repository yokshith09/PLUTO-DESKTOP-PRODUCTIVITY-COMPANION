import { describe, expect, it } from "vitest";
import type { Task } from "@/ipc";
import { addToQueue, cleanPlan, EMPTY_PLAN, following, liveQueue, moveInOrder, moveToNext, orderTasks, queueUp, takeOut, type TodayPlan } from "./todayPlan";

const row = (id: string, extra: Partial<Task> = {}) => ({ task: { id, title: id, priority: null, due_date: null, ...extra } as unknown as Task, overdue: false });
const plan = (p: Partial<TodayPlan>): TodayPlan => ({ ...EMPTY_PLAN, ...p });
const names = (rows: { task: Task }[]) => rows.map((r) => r.task.id);

describe("cleanPlan", () => {
  it("drops junk and repeats", () => {
    expect(cleanPlan(null)).toEqual(EMPTY_PLAN);
    expect(cleanPlan({ mode: "nope", mine: ["a", "a", 3], next: "x" })).toEqual({ mode: "mine", mine: ["a"], next: [] });
    expect(cleanPlan({ mode: "due", mine: [], next: ["b", "c"] })).toEqual({ mode: "due", mine: [], next: ["b", "c"] });
  });
});

describe("orderTasks", () => {
  const rows = [row("a", { priority: "LOW", due_date: "2026-11-05" }), row("b"), row("c", { priority: "HIGH", due_date: "2026-11-03" })];
  it("My order follows your list; new tasks keep their place after it", () => {
    expect(names(orderTasks(rows, plan({ mine: ["c", "a"] })))).toEqual(["c", "a", "b"]);
  });
  it("Priority: high first, none last", () => {
    expect(names(orderTasks(rows, plan({ mode: "priority" })))).toEqual(["c", "a", "b"]);
  });
  it("Due: soonest first, no date last", () => {
    expect(names(orderTasks(rows, plan({ mode: "due" })))).toEqual(["c", "a", "b"]);
  });
});

describe("Next up (no limit)", () => {
  it("Move to next puts the task first; add puts it last; take out removes it", () => {
    let p = plan({ next: ["a", "b"] });
    p = moveToNext(p, "c");
    expect(p.next).toEqual(["c", "a", "b"]);
    p = moveToNext(p, "b");
    expect(p.next).toEqual(["b", "c", "a"]);
    p = addToQueue(p, "d");
    expect(p.next).toEqual(["b", "c", "a", "d"]);
    expect(addToQueue(p, "d")).toBe(p);
    expect(takeOut(p, "c").next).toEqual(["b", "a", "d"]);
  });
  it("Move up swaps with the one before; the first stays", () => {
    const p = plan({ next: ["a", "b", "c"] });
    expect(queueUp(p, "c").next).toEqual(["a", "c", "b"]);
    expect(queueUp(p, "a")).toBe(p);
  });
  it("finished tasks drop out of the queue", () => {
    expect(liveQueue(plan({ next: ["a", "gone", "b"] }), ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("following: what starts when Now ends (no question asked)", () => {
  it("starts the first open task in the queue and takes it and the current one out", () => {
    const r = following(plan({ next: ["gone", "now", "b", "c"] }), ["now", "b", "c"], "now");
    expect(r.start).toBe("b");
    expect(r.plan.next).toEqual(["gone", "c"]);
  });
  it("an empty queue starts nothing", () => {
    expect(following(plan({ next: [] }), ["x"], "x").start).toBeNull();
  });
});

describe("moveInOrder", () => {
  it("moves one place and switches to My order from what you see", () => {
    expect(moveInOrder(plan({ mode: "priority" }), ["a", "b", "c"], "c", -1)).toEqual({ mode: "mine", mine: ["a", "c", "b"], next: [] });
    expect(moveInOrder(plan({}), ["a", "b"], "a", -1).mine).toEqual(["a", "b"]);
  });
});
