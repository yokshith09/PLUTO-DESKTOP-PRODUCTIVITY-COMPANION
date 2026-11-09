import { describe, expect, it } from "vitest";
import { parseTantrum } from "./TabTantrumRow";

describe("Tab Tantrum preference", () => {
  it("is off at 15 until set, and keeps the limit in range", () => {
    expect(parseTantrum(null)).toEqual({ on: false, limit: 15 });
    expect(parseTantrum({ on: true, limit: 1 })).toEqual({ on: true, limit: 5 });
    expect(parseTantrum({ on: true, limit: 999 })).toEqual({ on: true, limit: 60 });
    expect(parseTantrum({ on: "yes", limit: "x" })).toEqual({ on: false, limit: 15 });
  });
});
