import { describe, expect, it } from "vitest";
import type { TimetableClass } from "@/ipc/types";
import { DEFAULT_VIEW, boxTime, classesOn, fromBoxTime, isoWeek, layoutDay, minuteLabel, mondayOf, occursOn, outsideHours, parseView, slotStarts, snap, weekday, widened } from "./timetableLogic";

const cls = (id: string, day: number, start: number, end: number, over: Partial<TimetableClass> = {}): TimetableClass => ({
  id, course_id: null, title: id, day, start_min: start, end_min: end, place: "", teacher: "", repeat: "weekly", once_date: null, remind_min: null, ...over,
});

describe("timetable rules", () => {
  it("weekday counts from Monday and a week is the ISO week", () => {
    expect(weekday(new Date(2026, 10, 16))).toBe(0); // Monday 16 Nov 2026
    expect(weekday(new Date(2026, 10, 22))).toBe(6);
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeek(new Date(2026, 10, 16))).toBe(47);
    expect(mondayOf(new Date(2026, 10, 20)).getDate()).toBe(16);
    expect(mondayOf(new Date(2026, 10, 22)).getDate()).toBe(16);
  });
  it("a class repeats weekly, on odd or even weeks, or once", () => {
    const mon47 = new Date(2026, 10, 16); const mon48 = new Date(2026, 10, 23);
    expect(occursOn(cls("w", 0, 540, 600), mon47)).toBe(true);
    expect(occursOn(cls("w", 1, 540, 600), mon47)).toBe(false);
    expect(occursOn(cls("o", 0, 540, 600, { repeat: "odd" }), mon47)).toBe(true);
    expect(occursOn(cls("o", 0, 540, 600, { repeat: "odd" }), mon48)).toBe(false);
    expect(occursOn(cls("e", 0, 540, 600, { repeat: "even" }), mon48)).toBe(true);
    const once = cls("x", 4, 540, 600, { repeat: "once", once_date: "2026-11-20" });
    expect(occursOn(once, new Date(2026, 10, 20))).toBe(true);
    expect(occursOn(once, new Date(2026, 10, 27))).toBe(false);
  });
  it("a day's classes come in time order", () => {
    const all = [cls("b", 0, 660, 720), cls("a", 0, 540, 600), cls("c", 1, 480, 540)];
    expect(classesOn(all, new Date(2026, 10, 16)).map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("overlapping classes sit side by side and never share a lane while they overlap", () => {
    const placed = layoutDay([cls("a", 0, 540, 660), cls("b", 0, 600, 720), cls("c", 0, 600, 630), cls("d", 0, 800, 860)]);
    const by = Object.fromEntries(placed.map((p) => [p.c.id, p]));
    expect(by.a?.lanes).toBe(3);
    expect(new Set([by.a?.lane, by.b?.lane, by.c?.lane]).size).toBe(3);
    expect(by.d).toMatchObject({ lane: 0, lanes: 1 });
    const back = layoutDay([cls("x", 0, 540, 600), cls("y", 0, 600, 660)]);
    expect(back.map((p) => [p.lane, p.lanes])).toEqual([[0, 1], [0, 1]]);
  });
  it("reads a saved view and falls back when it is broken or out of range", () => {
    expect(parseView(null)).toEqual(DEFAULT_VIEW);
    expect(parseView({ from: 360, to: 1200, slot: 30, days: 5, density: "roomy" })).toEqual({ from: 360, to: 1200, slot: 30, days: 5, density: "roomy" });
    expect(parseView({ from: 100, to: 5000, slot: 45, days: 3, density: "huge" })).toEqual(DEFAULT_VIEW);
    expect(parseView("x")).toEqual(DEFAULT_VIEW);
  });
  it("classes outside the shown hours are counted and the view can widen to hold them", () => {
    const list = [cls("early", 0, 420, 480), cls("late", 0, 1080, 1170), cls("in", 0, 600, 660)];
    expect(outsideHours(list, DEFAULT_VIEW).map((c) => c.id)).toEqual(["early", "late"]);
    expect(widened(list, DEFAULT_VIEW)).toMatchObject({ from: 420, to: 1170 });
    expect(outsideHours(list, widened(list, DEFAULT_VIEW))).toEqual([]);
  });
  it("labels, box times and slots", () => {
    expect([minuteLabel(570), minuteLabel(0), minuteLabel(780)]).toEqual(["9:30 AM", "12:00 AM", "1:00 PM"]);
    expect([boxTime(570), fromBoxTime("09:30"), fromBoxTime("9:3")]).toEqual(["09:30", 570, null]);
    expect(slotStarts({ ...DEFAULT_VIEW, from: 480, to: 600, slot: 30 })).toEqual([480, 510, 540, 570]);
    expect([snap(575, 30), snap(575, 60), snap(600, 90)]).toEqual([570, 540, 540]);
  });
});
