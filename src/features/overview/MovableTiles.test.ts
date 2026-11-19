import { describe, expect, it } from "vitest";
import { cleanOrder, cleanSizes, DEFAULT_ORDER, packRows } from "./MovableTiles";

describe("cleanOrder", () => {
  it("keeps a valid saved order", () => {
    expect(cleanOrder(["links", "agenda", "time", "focus", "routine"])).toEqual(["links", "agenda", "time", "focus", "routine"]);
  });
  it("drops unknown and repeated ids and appends missing ones", () => {
    // "activity" and "done" were removed on 2026-10-25; a saved order that has them still works.
    expect(cleanOrder(["time", "nope", "time", "done", "activity"])).toEqual(["time", "agenda", "focus", "routine", "links"]);
  });
  it("falls back to the default for junk", () => {
    expect(cleanOrder(null)).toEqual(DEFAULT_ORDER);
    expect(cleanOrder("x")).toEqual(DEFAULT_ORDER);
  });
});

describe("cleanSizes", () => {
  it("keeps known sizes for known tiles", () => {
    expect(cleanSizes({ agenda: "w", focus: "n" })).toEqual({ agenda: "w", focus: "n" });
  });
  it("turns the old three sizes into two: large is full width, small and medium are normal", () => {
    expect(cleanSizes({ agenda: "l", focus: "s", time: "m" })).toEqual({ agenda: "w", focus: "n", time: "n" });
  });
  it("drops unknown tiles and sizes, and bad input", () => {
    expect(cleanSizes({ agenda: "huge", nope: "l", links: "s" })).toEqual({ links: "n" });
    expect(cleanSizes(null)).toEqual({});
    expect(cleanSizes("x")).toEqual({});
  });
});

describe("packRows (tiles share a row equally, height follows content)", () => {
  it("puts Today and Time side by side, then the three small tiles", () => {
    expect(packRows(DEFAULT_ORDER, {})).toEqual([["agenda", "time"], ["focus", "routine", "links"]]);
  });
  it("a tile moved beside Today shares the row with it, half each", () => {
    expect(packRows(["agenda", "focus", "time", "routine", "links"], {})).toEqual([["agenda", "focus"], ["time", "routine"], ["links"]]);
  });
  it("a full-width tile gets a row of its own", () => {
    expect(packRows(DEFAULT_ORDER, { agenda: "w" })).toEqual([["agenda"], ["time", "focus"], ["routine", "links"]]);
  });
  it("a big tile never joins two small ones", () => {
    expect(packRows(["focus", "routine", "agenda", "time", "links"], {})).toEqual([["focus", "routine"], ["agenda", "time"], ["links"]]);
  });
});

describe("cleanOrder after the 2026-11-02 layout", () => {
  it("the old default order, never moved, becomes the new default", () => {
    expect(cleanOrder(["agenda", "focus", "routine", "time", "links"])).toEqual(DEFAULT_ORDER);
  });
});
