import { describe, expect, it } from "vitest";
import { quickItems } from "./QuickActions";
import type { NoteSummary, TaskRow } from "@/ipc";

const task = (id: string, title: string, status = "PLANNED") => ({ task: { id, title, status }, overdue: false, done_today: false }) as unknown as TaskRow;
const note = (id: string, title: string, excerpt = "") => ({ id, title, excerpt }) as unknown as NoteSummary;
const data = {
  tasks: [task("t1", "Maths homework"), task("t2", "Maths revision", "COMPLETED"), task("t3", "Old idea", "CANCELLED")],
  notes: [note("n1", "Lecture 4", "eigenvalues and maths"), note("n2", "", "shopping list")],
  courses: [{ id: "c1", name: "Mathematics" }],
  pages: ["today", "tasks", "notes", "settings"] as const,
};

describe("Quick Actions list", () => {
  it("with nothing typed: the everyday actions and a few pages, no search results", () => {
    const items = quickItems("", data);
    expect(items.map((i) => i.label)).toEqual(["New task", "New note", "Start focus", "Today overview", "Tasks", "Notes", "Settings"]);
  });

  it("what you type can become a task, and finds tasks, notes and courses by every word", () => {
    const items = quickItems("math hw", { ...data, tasks: [task("t1", "Maths HW")] });
    expect(items[0]).toMatchObject({ group: "Do", label: "New task: math hw", action: { kind: "new-task", title: "math hw" } });
    expect(items.find((i) => i.group === "Tasks")?.action).toEqual({ kind: "task", id: "t1", title: "Maths HW" });
    const maths = quickItems("maths", data);
    expect(maths.filter((i) => i.group === "Tasks").map((i) => i.label)).toEqual(["Maths homework", "Maths revision"]);
    expect(maths.find((i) => i.label === "Maths revision")?.hint).toBe("done");
    expect(maths.some((i) => i.label === "Old idea")).toBe(false);
    expect(maths.find((i) => i.group === "Notes")?.label).toBe("Lecture 4");
    expect(quickItems("mathem", data).find((i) => i.group === "Courses")?.action).toEqual({ kind: "course", id: "c1" });
  });

  it("ignores case and accents, gives untitled notes a name, and filters pages and actions", () => {
    expect(quickItems("SHOPPING", data).find((i) => i.group === "Notes")?.label).toBe("shopping list");
    expect(quickItems("mathématiques", { ...data, courses: [{ id: "c", name: "Mathematiques" }] }).some((i) => i.group === "Courses")).toBe(true);
    const sett = quickItems("sett", data);
    expect(sett.filter((i) => i.group === "Go to").map((i) => i.label)).toEqual(["Settings"]);
    expect(quickItems("focus", data).some((i) => i.action.kind === "focus")).toBe(true);
  });
});
