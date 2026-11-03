import { describe, expect, it } from "vitest";
import type { DayInfo } from "@/ipc";
import { level, monthLabels, streaks, yearTotals, yearWeeks } from "./calendar";

const info = (day: string, entries: number, words: number): DayInfo => ({ day, entries, words, snippet: "" });

describe("diary calendar", () => {
  it("draws more strongly the more was written, and nothing for an empty day", () => {
    expect(level(null)).toBe(0);
    expect(level({ entries: 0, words: 500 })).toBe(0);
    expect([5, 40, 119, 120, 249, 250].map((w) => level({ entries: 1, words: w }))).toEqual([1, 2, 2, 3, 3, 4]);
  });

  it("lays a year out in Sunday-first columns with every day once", () => {
    const weeks = yearWeeks(2026); // 1 Jan 2026 is a Thursday
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]).toEqual([null, null, null, null, "2026-01-01", "2026-01-02", "2026-01-03"]);
    const all = weeks.flat().filter(Boolean);
    expect(all).toHaveLength(365);
    expect(new Set(all).size).toBe(365);
    expect(all[all.length - 1]).toBe("2026-12-31");
    expect(yearWeeks(2028).flat().filter(Boolean)).toHaveLength(366);
  });

  it("names each month once, over the week it starts in", () => {
    const labels = monthLabels(yearWeeks(2026));
    expect(labels).toHaveLength(12);
    expect(labels[0]).toMatchObject({ col: 0 });
    expect(new Set(labels.map((l) => l.col)).size).toBe(12);
    expect(labels.map((l) => l.col)).toEqual([...labels.map((l) => l.col)].sort((a, b) => a - b));
  });

  it("counts the streak now and the longest", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-20", "2026-11-02", "2026-11-03"];
    expect(streaks(days, "2026-11-03")).toEqual({ current: 2, longest: 4 });
    // Today is still empty: yesterday keeps the streak alive.
    expect(streaks(days.slice(0, -1), "2026-11-03")).toEqual({ current: 1, longest: 4 });
    // A gap of a day ends it.
    expect(streaks(days.slice(0, -2), "2026-11-03")).toEqual({ current: 0, longest: 4 });
    expect(streaks([], "2026-11-03")).toEqual({ current: 0, longest: 0 });
  });

  it("adds up a year", () => {
    const infos = [info("2026-11-03", 2, 90), info("2026-01-05", 1, 10), info("2025-12-31", 3, 500)];
    expect(yearTotals(infos, 2026)).toEqual({ entries: 3, days: 2, words: 100 });
    expect(yearTotals(infos, 2024)).toEqual({ entries: 0, days: 0, words: 0 });
  });
});
