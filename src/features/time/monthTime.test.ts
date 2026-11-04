import { describe, expect, it } from "vitest";
import { dayCategories, monthStats, timeLevel } from "./monthTime";

describe("time month helpers (U-6)", () => {
  it("draws nothing for an empty day and four steps up to the busiest day", () => {
    expect([0, 1, 3600, 7200, 14_400].map((s) => timeLevel(s, 14_400))).toEqual([0, 1, 1, 2, 4]);
    expect(timeLevel(10_800, 14_400)).toBe(3);
    expect(timeLevel(500, 0)).toBe(0);
  });

  it("adds a day up by category, longest first", () => {
    const apps = [
      { app: "VS Code", category: "Coding", is_browser: false, total_seconds: 4000, sessions: 2 },
      { app: "Chrome", category: "Research", is_browser: true, total_seconds: 5000, sessions: 3 },
      { app: "Terminal", category: "Coding", is_browser: false, total_seconds: 2000, sessions: 1 },
      { app: "Mystery", category: "", is_browser: false, total_seconds: 60, sessions: 1 },
    ];
    expect(dayCategories({ apps })).toEqual([["Coding", 6000], ["Research", 5000], ["Other", 60]]);
    expect(dayCategories(undefined)).toEqual([]);
  });

  it("totals a month and averages over the days that have time", () => {
    expect(monthStats([0, 3600, 0, 7200])).toEqual({ total: 10_800, tracked: 2, busiest: 7200, average: 5400 });
    expect(monthStats([0, 0])).toEqual({ total: 0, tracked: 0, busiest: 0, average: 0 });
  });
});
