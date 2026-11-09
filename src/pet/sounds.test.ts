import { describe, expect, it } from "vitest";
import { DEFAULT_SOUNDS, SOUND_KINDS, SOUNDS, parseSounds, soundFor } from "./sounds";

describe("A-8 sounds per reaction", () => {
  it("every kind has its own sound by default, all different", () => {
    const ids = SOUND_KINDS.map((k) => DEFAULT_SOUNDS.map[k]);
    expect(new Set(ids).size).toBe(SOUND_KINDS.length);
    expect(soundFor(DEFAULT_SOUNDS, "done")).toBe(SOUNDS.glass.src);
  });
  it("off, none, unknown kinds and nothing stay silent", () => {
    expect(soundFor({ ...DEFAULT_SOUNDS, on: false }, "done")).toBeNull();
    expect(soundFor({ ...DEFAULT_SOUNDS, map: { ...DEFAULT_SOUNDS.map, needs: "none" } }, "needs")).toBeNull();
    expect(soundFor(DEFAULT_SOUNDS, "git_commit")).toBeNull();
    expect(soundFor(DEFAULT_SOUNDS, undefined)).toBeNull();
  });
  it("reads saved choices and ignores broken ones", () => {
    const p = parseSounds({ on: true, volume: 3, map: { done: "koto", needs: "nope", error: "none" } });
    expect(p.volume).toBe(1);
    expect(p.map).toEqual({ done: "koto", needs: "chord", permission: "polite", error: "none" });
    expect(parseSounds("x")).toEqual(DEFAULT_SOUNDS);
  });
});
