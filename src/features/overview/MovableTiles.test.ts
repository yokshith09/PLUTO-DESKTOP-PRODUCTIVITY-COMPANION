import { describe, expect, it } from "vitest";
import { cleanOrder, cleanSizes, defaultCols, DEFAULT_ORDER, snap } from "./MovableTiles";

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

describe("cleanSizes (U-5 free resize)", () => {
  it("keeps columns and rows, snapped to 3..12 and 1..4", () => {
    expect(cleanSizes({ agenda: { c: 8, r: 3 }, focus: { c: 1 }, time: { c: 40, r: 9 }, links: { c: 5.4, r: 0 } }))
      .toEqual({ agenda: { c: 8, r: 3 }, focus: { c: 3 }, time: { c: 12, r: 4 }, links: { c: 5, r: 1 } });
  });
  it("moves the older sizes over: full width is 12 columns, normal goes back to the usual width", () => {
    expect(cleanSizes({ agenda: "w", focus: "n", time: "l", routine: "s" })).toEqual({ agenda: { c: 12 }, time: { c: 12 } });
  });
  it("drops unknown tiles, junk sizes and bad input", () => {
    expect(cleanSizes({ nope: { c: 6 }, agenda: "huge", links: { c: "x" }, focus: { c: NaN } })).toEqual({});
    expect(cleanSizes(null)).toEqual({});
    expect(cleanSizes("x")).toEqual({});
  });
  it("starts Today and Time at half the page and the small tiles at a third", () => {
    expect([defaultCols("agenda"), defaultCols("time"), defaultCols("focus"), defaultCols("routine"), defaultCols("links")]).toEqual([6, 6, 4, 4, 4]);
    expect(snap({ c: 2.2 })).toEqual({ c: 3 });
  });
});

describe("cleanOrder after the 2026-11-02 layout", () => {
  it("the old default order, never moved, becomes the new default", () => {
    expect(cleanOrder(["agenda", "focus", "routine", "time", "links"])).toEqual(DEFAULT_ORDER);
  });
});
