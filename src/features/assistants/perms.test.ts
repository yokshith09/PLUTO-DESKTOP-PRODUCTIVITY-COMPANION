import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isOn, parsePerms, REACT_KEYS, REACTIONS, setOn, summary, TOOLS } from "./perms";

describe("assistant permissions", () => {
  it("lists the same tools as the Rust side, which tests them against the real server", () => {
    const rust = readFileSync("crates/pluto-core/src/mcp/perms.rs", "utf8");
    const block = rust.slice(rust.indexOf("pub const TOOLS"), rust.indexOf("pub const REACTIONS"));
    const names = [...block.matchAll(/\("([a-z_]+)", "/g)].map((m) => m[1]);
    expect(TOOLS.map((t) => t.name)).toEqual(names);
    const keys = [...rust.slice(rust.indexOf("pub const REACTIONS")).matchAll(/\("([a-z_]+)", "/g)].slice(0, REACTIONS.length).map((m) => m[1]);
    expect(REACTIONS.map((r) => r.key)).toEqual(keys);
  });

  it("everything is on until switched off, per assistant", () => {
    let p = parsePerms(undefined);
    expect(isOn(p, "claude", "tools", "task_add")).toBe(true);
    p = setOn(p, "claude", "tools", "task_add", false);
    expect(isOn(p, "claude", "tools", "task_add")).toBe(false);
    expect(isOn(p, "codex", "tools", "task_add")).toBe(true);
    p = setOn(p, "claude", "reactions", "away", false);
    expect(p.claude).toEqual({ tools: ["task_add"], reactions: ["away"] });
    p = setOn(p, "claude", "tools", "task_add", true);
    expect(p.claude?.tools).toEqual([]);
  });

  it("ignores broken saved values", () => {
    expect(parsePerms("x")).toEqual({});
    expect(parsePerms({ claude: 5, codex: { tools: ["a", 3] } })).toEqual({ codex: { tools: ["a"], reactions: [] } });
  });

  it("the tile summary counts what is on", () => {
    const p = setOn({}, "claude", "tools", "task_add", false);
    expect(summary(p, "claude", REACT_KEYS.claude?.length ?? 0)).toBe(`${TOOLS.length - 1} of ${TOOLS.length} tools · 5 of 5 pet reactions`);
    expect(summary({}, "windsurf", 0)).toBe(`${TOOLS.length} of ${TOOLS.length} tools`);
  });
});
