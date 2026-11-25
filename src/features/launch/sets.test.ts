import { describe, expect, it } from "vitest";
import { cleanSets, labelOf, remove, shortName, upsert, webTarget } from "./sets";
import { reportText } from "./useLaunchSets";

describe("launch sets", () => {
  it("keeps only well-formed sets and items, like the shell's parse", () => {
    const clean = cleanSets({ sets: [
      { id: "s1", name: " Physics ", focus_minutes: 50, items: [{ label: "", target: "C:\\Uni\\a.pdf" }, { target: "  " }, "junk"] },
      { id: "", name: "No id" },
      { id: "s2", name: "Work", focus_minutes: 999, items: "junk" },
    ] });
    expect(clean.sets).toEqual([
      { id: "s1", name: "Physics", focus_minutes: 50, items: [{ label: "", target: "C:\\Uni\\a.pdf" }] },
      { id: "s2", name: "Work", focus_minutes: null, items: [] },
    ]);
    expect(cleanSets(null)).toEqual({ sets: [] });
    expect(cleanSets({ sets: "x" })).toEqual({ sets: [] });
  });

  it("names items the same way the shell does", () => {
    expect(shortName("C:\\Notes\\Physics.pdf")).toBe("Physics.pdf");
    expect(shortName("/Users/me/Uni/")).toBe("Uni");
    expect(shortName("https://moodle.uni.edu/course/12?x=1")).toBe("moodle.uni.edu");
    expect(shortName("mailto:prof@uni.edu")).toBe("prof@uni.edu");
    expect(labelOf({ label: " Notes ", target: "C:\\x.pdf" })).toBe("Notes");
  });

  it("accepts web addresses with or without https://, and nothing else", () => {
    expect(webTarget("moodle.uni.edu/course/12")).toBe("https://moodle.uni.edu/course/12");
    expect(webTarget("http://x.y")).toBe("http://x.y");
    for (const bad of ["", "notes", "javascript:alert(1)", "C:\\x.pdf", "ftp://x.y"]) expect(webTarget(bad)).toBeNull();
  });

  it("adds, replaces and removes sets by id", () => {
    const a = { id: "a", name: "A", items: [], focus_minutes: null };
    const one = upsert({ sets: [] }, a);
    expect(upsert(one, { ...a, name: "A2" }).sets).toEqual([{ ...a, name: "A2" }]);
    expect(remove(one, "a").sets).toEqual([]);
  });

  it("says what opened and names what didn't", () => {
    expect(reportText("Physics", { opened: ["a", "b"], shown: [], missing: [], failed: [] })).toEqual({ ok: true, text: "Opened 2 things from Physics" });
    const bad = reportText("Physics", { opened: ["a"], shown: ["run.bat"], missing: ["notes.pdf"], failed: [] });
    expect(bad.ok).toBe(false);
    expect(bad.detail).toContain("Not found: notes.pdf");
    expect(bad.detail).toContain("run.bat");
    expect(reportText("X", { opened: [], shown: [], missing: [], failed: ["y"] }).text).toBe("Nothing from X opened");
  });
});
