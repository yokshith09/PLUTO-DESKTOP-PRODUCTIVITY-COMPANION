import { describe, expect, it } from "vitest";
import type { DayInfo } from "@/ipc";
import { level, monthCounts, monthTotals, streaks, yearTotals } from "./calendar";

const info = (day: string, entries: number, words: number): DayInfo => ({ day, entries, words, snippet: "" });

describe("diary calendar", () => {
  it("draws more strongly the more was written, and nothing for an empty day", () => {
    expect(level(null)).toBe(0);
    expect(level({ entries: 0, words: 500 })).toBe(0);
    expect([5, 40, 119, 120, 249, 250].map((w) => level({ entries: 1, words: w }))).toEqual([1, 2, 2, 3, 3, 4]);
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

  it("adds up a month and counts the days written in each month of a year", () => {
    const infos = [info("2026-11-03", 2, 90), info("2026-11-05", 1, 10), info("2026-01-05", 1, 10), info("2025-11-30", 1, 7)];
    expect(monthTotals(infos, "2026-11-01")).toEqual({ entries: 3, days: 2, words: 100 });
    expect(monthTotals(infos, "2026-02-01")).toEqual({ entries: 0, days: 0, words: 0 });
    expect(monthCounts(infos, 2026)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0]);
  });
});
