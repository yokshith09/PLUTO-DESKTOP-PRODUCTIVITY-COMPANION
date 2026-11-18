import { describe, expect, it } from "vitest";
import { doneRecently, examWhen, inFilter, parseFilter, splitExams } from "./planLogic";

describe("exams, notes, tasks rules", () => {
  it("All courses keeps only items that have a course; a chosen course keeps only its own", () => {
    expect(inFilter("c1", null)).toBe(true);
    expect(inFilter(undefined, null)).toBe(false);
    expect(inFilter("c1", "c1")).toBe(true);
    expect(inFilter("c2", "c1")).toBe(false);
  });
  it("a saved filter must be text", () => {
    expect([parseFilter("c1"), parseFilter(""), parseFilter(3), parseFilter(null)]).toEqual(["c1", null, null, null]);
  });
  it("exams split into upcoming (soonest first) and past (latest first)", () => {
    const e = (id: string, on_date: string) => ({ id, on_date });
    const r = splitExams([e("a", "2026-11-20"), e("old", "2026-10-01"), e("b", "2026-11-12"), e("older", "2026-09-01")], "2026-11-10");
    expect(r.upcoming.map((x) => x.id)).toEqual(["b", "a"]);
    expect(r.past.map((x) => x.id)).toEqual(["old", "older"]);
  });
  it("says when in plain words", () => {
    expect([examWhen("2026-11-10", "2026-11-10"), examWhen("2026-11-10", "2026-11-11"), examWhen("2026-11-10", "2026-11-19"), examWhen("2026-11-10", "2026-11-08")]).toEqual(["Today", "Tomorrow", "9 days", "2 days ago"]);
  });
  it("done tasks show for a week", () => {
    const now = 10 * 86_400_000;
    expect([doneRecently(now - 6 * 86_400_000, now), doneRecently(now - 8 * 86_400_000, now), doneRecently(null, now)]).toEqual([true, false, false]);
  });
});
