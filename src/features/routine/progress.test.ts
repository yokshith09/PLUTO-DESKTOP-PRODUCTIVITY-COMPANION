import { describe, expect, it } from "vitest";
import { dayStat, encouragement, habitRates, nameOf, rangeTotals, roomLine, roomToGrow, weekLine, weekVsWeek } from "./progress";
import { addItem, emptyRoutine, rollOver, toggle } from "./routine";

/** Ten days of three routines: Stretch every day, Read on even days, Water only on the first two. */
function story() {
  let s = emptyRoutine("2026-11-01");
  s = addItem(addItem(addItem(s, "Stretch", "s"), "Read 20 pages", "r"), "Water", "w");
  for (let d = 1; d <= 10; d++) {
    const day = `2026-11-${String(d).padStart(2, "0")}`;
    if (s.day !== day) s = rollOver(s, day);
    s = toggle(s, "s");
    if (d % 2 === 0) s = toggle(s, "r");
    if (d <= 2) s = toggle(s, "w");
  }
  return s; // today is 2026-11-10
}
const TODAY = "2026-11-10";

describe("routine progress (FR-114, U-8)", () => {
  it("keeps each day's plan and what was done, a year back, and today from the live list", () => {
    const s = story();
    expect(dayStat(s, "2026-11-03", TODAY)).toEqual({ day: "2026-11-03", planned: ["s", "r", "w"], done: ["s"] });
    expect(dayStat(s, TODAY, TODAY).done).toEqual(["s", "r"]);
    expect(dayStat(s, "2026-11-20", TODAY).planned).toBeNull();
    expect(dayStat(s, "2026-10-01", TODAY).planned).toBeNull();
  });

  it("a day that was before the tracker shows what was done and no plan, and removed routines keep their name", () => {
    let s = story();
    s = { ...s, history: { ...s.history, "2026-09-01": ["s"] } };
    expect(dayStat(s, "2026-09-01", TODAY)).toEqual({ day: "2026-09-01", planned: null, done: ["s"] });
    const gone = { ...s, items: s.items.filter((i) => i.id !== "w") };
    expect(nameOf(gone, "w")).toBe("Water");
    expect(nameOf(gone, "nope")).toBe("A routine");
  });

  it("adds up the week against the week before, counting only recorded days", () => {
    const s = story();
    const w = weekVsWeek(s, TODAY);
    expect(w.thisWeek).toEqual({ done: 7 + 4, planned: 21, days: 7 });
    expect(w.lastWeek.days).toBe(3);
    expect(rangeTotals(s, TODAY, TODAY, 1)).toEqual({ done: 2, planned: 3, days: 1 });
  });

  it("rates each routine over 30 days and finds the one with the most room to grow", () => {
    const s = story();
    const rates = habitRates(s, TODAY);
    expect(rates.map((r) => [r.title, r.done, r.planned])).toEqual([["Stretch", 10, 10], ["Read 20 pages", 5, 10], ["Water", 2, 9]]);
    expect(rates[0]?.last7).toBe(7);
    // Today is still open: Water, not ticked yet today, is not counted against it.
    expect(rates.find((r) => r.id === "w")?.planned).toBe(9);
    const room = roomToGrow(rates);
    expect(room?.title).toBe("Water");
    expect(roomLine(room as NonNullable<typeof room>)).toBe("Water is your next win: 2 of 9 days so far. One tick today moves it up.");
    // Too few days to tell, or all strong: nothing is singled out.
    expect(roomToGrow(habitRates(emptyRoutine(TODAY), TODAY))).toBeNull();
    expect(roomToGrow([{ id: "a", title: "A", done: 9, planned: 10, rate: 0.9, last7: 7 }])).toBeNull();
  });

  it("every line of words lifts you: no fault, no failure", () => {
    const s = story();
    const lines = [
      encouragement(s, TODAY), encouragement(emptyRoutine(TODAY), TODAY), encouragement(toggle(s, "w"), TODAY),
      weekLine(weekVsWeek(s, TODAY)), weekLine({ thisWeek: { done: 0, planned: 0, days: 0 }, lastWeek: { done: 5, planned: 9, days: 3 } }),
      weekLine({ thisWeek: { done: 2, planned: 7, days: 2 }, lastWeek: { done: 9, planned: 14, days: 7 } }),
      weekLine({ thisWeek: { done: 0, planned: 7, days: 2 }, lastWeek: { done: 9, planned: 14, days: 7 } }),
    ];
    for (const l of lines) expect(l).not.toMatch(/miss|fail|behind|lazy|worse|streak|lost|only|but |bad|should/i);
    expect(lines[2]).toBe("All 3 done today. What a day.");
    expect(encouragement(s, TODAY)).toBe("2 of 3 done today. Every tick counts.");
    expect(weekLine({ thisWeek: { done: 12, planned: 21, days: 7 }, lastWeek: { done: 9, planned: 21, days: 7 } })).toBe("3 more done than last week. That is real progress.");
  });

  it("with nothing ticked yet today it names what is going well", () => {
    let s = rollOver(story(), "2026-11-11");
    // Ahead of last week, or (when it is not) the strongest routine: either way it is good news.
    expect(encouragement(s, "2026-11-11")).toMatch(/ahead of last week by \d+\. Keep going\.|real consistency/);
    const keep = (r: Record<string, string[]>) => Object.fromEntries(Object.entries(r).filter(([d]) => d >= "2026-11-05"));
    const flat = { ...s, history: keep(s.history), planned: keep(s.planned) };
    expect(encouragement(flat, "2026-11-11")).toBe("Stretch: 6 of the last 6 days. That is real consistency.");
    s = emptyRoutine("2026-11-11");
    expect(encouragement(addItem(s, "Walk", "k"), "2026-11-11")).toBe("A fresh day. Pick one routine and tick it; that is a good start.");
  });
});
