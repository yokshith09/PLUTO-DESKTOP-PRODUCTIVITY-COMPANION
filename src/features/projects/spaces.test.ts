import { describe, expect, it } from "vitest";
import type { TaskRow } from "@/ipc";
import { activity, addLink, cleanSpaces, EMPTY_SPACES, ensure, forget, linkKind, nameFor, removeLink, renameSpace, samePath, setFolder, shortName, spaceOf, unlinkedRepos } from "./spaces";

describe("cleanSpaces", () => {
  it("keeps good projects, drops junk, repeats and empty links", () => {
    const s = cleanSpaces({ projects: [
      { name: "Pluto", folder: "E:\\Projects\\pluto", links: [{ target: "https://github.com/x/pluto" }, { label: "x", target: "" }] },
      { name: "Pluto", folder: "dup" },
      { name: " " },
      "junk",
    ] });
    expect(s.projects).toEqual([{ name: "Pluto", folder: "E:\\Projects\\pluto", links: [{ label: "github.com", target: "https://github.com/x/pluto" }] }]);
    expect(cleanSpaces(null)).toEqual(EMPTY_SPACES);
  });
});

describe("links", () => {
  it("tells web pages, files and folders apart and names them shortly", () => {
    expect(linkKind("https://notion.so/x")).toBe("web");
    expect(linkKind("E:\\docs\\plan.md")).toBe("file");
    expect(linkKind("E:\\Designs\\icons")).toBe("folder");
    expect(shortName("E:\\Projects\\pluto\\")).toBe("pluto");
    expect(shortName("https://www.figma.com/file/1")).toBe("figma.com");
  });
  it("adds once, removes, and keeps everything through a rename", () => {
    let s = addLink(EMPTY_SPACES, "Pluto", "E:\\a\\plan.md");
    expect(addLink(s, "Pluto", "E:\\a\\plan.md")).toBe(s);
    s = setFolder(addLink(s, "Pluto", "https://x.dev", "Docs"), "Pluto", "E:\\p");
    s = renameSpace(s, "Pluto", "Pluto app");
    expect(spaceOf(s, "Pluto app")).toEqual({ name: "Pluto app", folder: "E:\\p", links: [{ label: "plan.md", target: "E:\\a\\plan.md" }, { label: "Docs", target: "https://x.dev" }] });
    expect(removeLink(s, "Pluto app", "https://x.dev").projects[0]?.links).toHaveLength(1);
    expect(forget(s, "Pluto app")).toEqual(EMPTY_SPACES);
  });
  it("a new empty project is kept (it used to vanish after a restart)", () => {
    expect(ensure(EMPTY_SPACES, "Exam prep").projects).toEqual([{ name: "Exam prep", folder: null, links: [] }]);
  });
});

describe("folders", () => {
  it("offers only git folders no project uses, and names a project after its folder", () => {
    const s = setFolder(EMPTY_SPACES, "Pluto", "E:\\Projects\\Pluto\\");
    expect(samePath("e:/projects/pluto", "E:\\Projects\\Pluto\\")).toBe(true);
    expect(unlinkedRepos(s, ["E:/projects/pluto", "E:\\Projects\\staysync"])).toEqual(["E:\\Projects\\staysync"]);
    expect(nameFor("E:\\Projects\\staysync", ["staysync"])).toBe("staysync 2");
  });
});

describe("activity", () => {
  const task = (title: string, done: number | null) => ({ task: { title, status: done ? "COMPLETED" : "PLANNED", completed_at: done } } as unknown as TaskRow);
  it("mixes this folder's commits and pushes (no messages), finished tasks and edited notes, newest first", () => {
    const list = activity(
      "E:\\p",
      [{ repo: "e:/p", kind: "git_push", atMs: 50 }, { repo: "E:\\p", kind: "git_commit", atMs: 40 }, { repo: "E:\\other", kind: "git_push", atMs: 60 }],
      [task("Ship it", 45), task("Open one", null)],
      [{ title: "", edited_at: 30 }],
    );
    expect(list.map((a) => a.text)).toEqual(["Pushed", "Finished “Ship it”", "Committed", "Edited the note “Untitled”"]);
  });
  it("a project without a folder shows no git activity", () => {
    expect(activity(null, [{ repo: "E:\\p", kind: "git_push", atMs: 1 }], [], [])).toEqual([]);
  });
});
