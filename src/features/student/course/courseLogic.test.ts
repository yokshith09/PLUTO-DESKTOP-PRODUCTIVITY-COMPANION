import { describe, expect, it } from "vitest";
import type { CourseExam, Topic } from "@/ipc/types";
import { clockLabel, examChips, filterCounts, filterTopics, focusLabel, inDaysLabel, initials, nextExam, orderDates, readiness, whenLabel } from "./courseLogic";

const t = (title: string, over: Partial<Topic> = {}): Topic => ({ id: title, title, starred: false, status: 0, subtopics: [], ...over });
const exam = (id: string, on_date: string, at_time = "", topic_ids: string[] = []): CourseExam => ({ id, title: id, on_date, at_time, place: "", topic_ids });

describe("course page rules", () => {
  it("badge letters come from up to three words", () => {
    expect(initials("Advanced Algorithms & Analysis")).toBe("AAA");
    expect(initials("Deep Learning")).toBe("DL");
    expect(initials("SDN")).toBe("S");
    expect(initials("  ")).toBe("?");
    expect(initials("Operating Systems and Concurrency Theory")).toBe("OSA");
  });
  it("filters by chip and by words in the topic or a subtopic", () => {
    const list = [t("Graphs", { starred: true, status: 3 }), t("B-Trees", { subtopics: [{ id: "s", title: "Insert", done: false, points: [] }] }), t("Proofs", { starred: true })];
    expect(filterCounts(list)).toEqual({ all: 3, starred: 2, not_ready: 2 });
    expect(filterTopics(list, "starred", "").map((x) => x.title)).toEqual(["Graphs", "Proofs"]);
    expect(filterTopics(list, "not_ready", "").map((x) => x.title)).toEqual(["B-Trees", "Proofs"]);
    expect(filterTopics(list, "all", "insert").map((x) => x.title)).toEqual(["B-Trees"]);
    expect(filterTopics(list, "all", " GRAPH ").map((x) => x.title)).toEqual(["Graphs"]);
  });
  it("readiness counts topics in each state", () => {
    expect(readiness([t("a", { status: 3 }), t("b"), t("c", { status: 2 })])).toEqual({ ready: 1, total: 3, byStatus: [1, 0, 1, 1] });
  });
  it("the next exam is the soonest one that is not past", () => {
    const list = [exam("old", "2026-10-01"), exam("late", "2026-11-20"), exam("soon", "2026-11-16", "10:00"), exam("same", "2026-11-16", "09:00")];
    expect(nextExam(list, "2026-11-10")?.id).toBe("same");
    expect(nextExam([exam("old", "2026-10-01")], "2026-11-10")).toBeUndefined();
  });
  it("says days in plain words and times with AM or PM", () => {
    expect([0, 1, 6, -3].map(inDaysLabel)).toEqual(["Today", "Tomorrow", "in 6 days", "3 days ago"]);
    expect([clockLabel("10:00"), clockLabel("00:05"), clockLabel("13:30"), clockLabel("")]).toEqual(["10:00 AM", "12:05 AM", "1:30 PM", ""]);
    expect(whenLabel({ on_date: "2026-11-16", at_time: "10:00" })).toMatch(/16 Nov.*10:00 AM|Nov 16.*10:00 AM/);
  });
  it("an exam with no chosen topics, or all of them, shows All Topics", () => {
    const topics = [t("LRU"), t("Graphs"), t("B-Trees")];
    expect(examChips(exam("e", "2026-11-16"), topics)).toEqual(["All Topics"]);
    expect(examChips(exam("e", "2026-11-16", "", ["LRU", "Graphs"]), topics)).toEqual(["LRU", "Graphs"]);
    expect(examChips(exam("e", "2026-11-16", "", ["LRU", "Graphs", "B-Trees"]), topics)).toEqual(["All Topics"]);
  });
  it("upcoming dates come first, past ones last", () => {
    const d = (id: string, on_date: string) => ({ id, title: id, on_date, kind: "quiz" });
    expect(orderDates([d("p", "2026-10-01"), d("b", "2026-12-01"), d("a", "2026-11-12")], "2026-11-10").map((x) => x.id)).toEqual(["a", "b", "p"]);
  });
  it("focus time reads as hours and minutes", () => {
    expect([0, 59 * 60_000, 275 * 60_000].map(focusLabel)).toEqual(["0 m", "59 m", "4 h 35 m"]);
  });
});
