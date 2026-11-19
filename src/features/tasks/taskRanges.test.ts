import { describe, expect, it } from "vitest";
import type { Task, TaskRow } from "@/ipc";
import { inRange, isMissed, missedRows, monthEnd, narrow, rowsInRange } from "./taskRanges";

const task = (o: Partial<Task>): Task => ({
  id: "t", title: "t", description: "", status: "PLANNED", priority: null, project: null, planned_date: null, due_date: null, note_id: null,
  source_action_item_id: null, created_at: 0, updated_at: 0, started_at: null, completed_at: null, cancelled_at: null, starred: false,
  repeat: null, repeat_until: null, days: [], links: [], ...o,
});
const row = (o: Partial<Task>): TaskRow => ({ task: task(o), overdue: false, done_today: false });

describe("missed tasks", () => {
  const today = "2026-11-19";
  it("a task planned for an earlier day with no deadline is missed", () => expect(isMissed(task({ planned_date: "2026-11-17" }), today)).toBe(true));
  it("a past deadline is missed", () => expect(isMissed(task({ due_date: "2026-11-10" }), today)).toBe(true));
  it("planned earlier but due later is not missed", () => expect(isMissed(task({ planned_date: "2026-11-17", due_date: "2026-11-25" }), today)).toBe(false));
  it("a multi-day plan with a day still ahead is not missed", () => expect(isMissed(task({ planned_date: "2026-11-17", days: ["2026-11-17", "2026-11-20"] }), today)).toBe(false));
  it("today, finished, cancelled, repeating and undated tasks are not missed", () => {
    expect(isMissed(task({ planned_date: today }), today)).toBe(false);
    expect(isMissed(task({ planned_date: "2026-11-01", status: "COMPLETED" }), today)).toBe(false);
    expect(isMissed(task({ planned_date: "2026-11-01", status: "CANCELLED" }), today)).toBe(false);
    expect(isMissed(task({ planned_date: "2026-11-01", repeat: { kind: "daily" } }), today)).toBe(false);
    expect(isMissed(task({}), today)).toBe(false);
  });
  it("lists the most recent first", () => {
    const rows = [row({ id: "a", planned_date: "2026-11-01" }), row({ id: "b", planned_date: "2026-11-15" })];
    expect(missedRows(rows, today).map((r) => r.task.id)).toEqual(["b", "a"]);
  });
});

describe("ranges", () => {
  it("month end", () => { expect(monthEnd("2026-11-19")).toBe("2026-11-30"); expect(monthEnd("2028-02-03")).toBe("2028-02-29"); });
  it("a range holds planned and deadline days, earliest first", () => {
    const rows = [row({ id: "late", planned_date: "2026-11-28" }), row({ id: "soon", due_date: "2026-11-21" }), row({ id: "out", planned_date: "2026-12-02" }), row({ id: "done", planned_date: "2026-11-22", status: "COMPLETED" })];
    expect(rowsInRange(rows, "2026-11-20", "2026-11-30").map((r) => r.task.id)).toEqual(["soon", "late"]);
    expect(inRange(task({ days: ["2026-11-25"] }), "2026-11-25", "2026-11-25")).toBe(true);
  });
  it("narrows by priority and project", () => {
    const rows = [row({ id: "a", priority: "HIGH", project: "Pluto" }), row({ id: "b", priority: "LOW", project: "pluto" })];
    expect(narrow(rows, { priority: "HIGH" }).map((r) => r.task.id)).toEqual(["a"]);
    expect(narrow(rows, { project: "PLUTO" })).toHaveLength(2);
  });
});
