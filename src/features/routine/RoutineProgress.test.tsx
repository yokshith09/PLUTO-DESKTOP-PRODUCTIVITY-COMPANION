import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoutineProgress } from "./RoutineProgress";
import { addItem, emptyRoutine, rollOver, setReason, toggle, type RoutineState } from "./routine";

afterEach(cleanup);
const TODAY = "2026-11-10";
function story() {
  let s = emptyRoutine("2026-11-01");
  s = addItem(addItem(s, "Stretch", "s"), "Water", "w");
  for (let d = 1; d <= 10; d++) {
    const day = `2026-11-${String(d).padStart(2, "0")}`;
    if (s.day !== day) s = rollOver(s, day);
    s = toggle(s, "s");
    if (d <= 3) s = toggle(s, "w");
  }
  return s;
}
const view = (state: RoutineState, onChange = vi.fn()) =>
  render(<RoutineProgress open onClose={vi.fn()} state={state} today={TODAY} onChange={onChange} />);
const water = () => screen.getByRole("group", { name: /^Water, 7 days to/ });
const earlier = () => fireEvent.click(screen.getByRole("button", { name: "Earlier" }));

describe("RoutineProgress, week letters (U-8)", () => {
  it("opens with kind words, one sentence for the week, seven letters per routine, and a next win", () => {
    view(story());
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Nov 4 to 10: Stretch done every day; Water skipped the 4th to the 9th and still open today.
    expect(screen.getByText("Last 7 days: 7 of 13 done. Stretch was your steadiest.")).toBeTruthy();
    const stretch = screen.getByRole("group", { name: /^Stretch, 7 days to Tuesday, November 10/ });
    // The letters are the weekdays, ending today (a Tuesday).
    expect(within(stretch).getAllByRole("img").map((l) => l.textContent).join("")).toBe("WTFSSMT");
    expect(within(stretch).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/is your next win/i)).toBeTruthy();
    expect(screen.getByText("This week and last week")).toBeTruthy();
  });

  it("skipped days are struck-through letters you can tap; done days, today and days to come are not", () => {
    view(story());
    const skipped = within(water()).getAllByRole("button");
    expect(skipped).toHaveLength(6);
    expect(skipped[0]?.getAttribute("aria-label")).toMatch(/November 4.*skipped, add a reason/);
    expect(within(water()).getByRole("img", { name: /Tuesday, November 10.*still open today/ })).toBeTruthy();
    earlier();
    // Oct 28 to Nov 3: Water done on the 1st to the 3rd, nothing recorded before.
    expect(within(water()).queryAllByRole("button")).toHaveLength(0);
    expect(within(water()).getAllByRole("img", { name: /done/ })).toHaveLength(3);
    expect(screen.getByText(/^Those 7 days: /)).toBeTruthy();
  });

  it("tapping a skipped letter offers quick reasons or your own words, and saves it (optional)", () => {
    const onChange = vi.fn();
    const s = story();
    view(s, onChange);
    fireEvent.click(within(water()).getAllByRole("button")[0] as HTMLElement);
    const sheet = screen.getByRole("group", { name: "What got in the way?" });
    expect(within(sheet).getByText(/Totally optional/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Too tired" }));
    expect(within(sheet).getByRole("button", { name: "Too tired" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = (onChange.mock.calls[0]?.[0] as (x: RoutineState) => RoutineState)(s);
    expect(next.reasons["2026-11-04"]).toEqual({ w: "Too tired" });
    expect(screen.queryByRole("group", { name: "What got in the way?" })).toBeNull();
  });

  it("your own words are used, and No reason clears one", () => {
    const onChange = vi.fn();
    const s = setReason(story(), "2026-11-04", "w", "Busy day");
    view(s, onChange);
    fireEvent.click(within(water()).getByRole("button", { name: /November 4.*skipped, Busy day/ }));
    const sheet = screen.getByRole("group", { name: "What got in the way?" });
    expect((within(sheet).getByLabelText("Reason in your own words") as HTMLInputElement).value).toBe("Busy day");
    fireEvent.change(within(sheet).getByLabelText("Reason in your own words"), { target: { value: "Early flight" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(((onChange.mock.calls[0]?.[0]) as (x: RoutineState) => RoutineState)(s).reasons["2026-11-04"]).toEqual({ w: "Early flight" });
    fireEvent.click(within(water()).getByRole("button", { name: /November 4/ }));
    fireEvent.click(screen.getByRole("button", { name: "No reason" }));
    expect(((onChange.mock.calls[1]?.[0]) as (x: RoutineState) => RoutineState)(s).reasons).toEqual({});
  });

  it("with no reasons yet the page invites rather than scolds", () => {
    view(story());
    expect(screen.getByText(/Nothing noted yet/)).toBeTruthy();
    expect(screen.getByText(/Pluto will suggest one small adjustment/)).toBeTruthy();
  });

  it("the reasons you gave are counted, with one kind suggestion", () => {
    let s = setReason(story(), "2026-11-04", "w", "Too tired");
    s = setReason(s, "2026-11-05", "w", "Too tired");
    s = setReason(s, "2026-11-06", "w", "Forgot");
    view(s);
    const box = screen.getByRole("region", { name: "What got in the way" });
    expect(within(box).getByText("Too tired")).toBeTruthy();
    expect(within(box).getByText("2")).toBeTruthy();
    expect(within(box).getByText(/Tired days happen/)).toBeTruthy();
  });

  it("goes back 7 days at a time, never past the first recorded day, and returns", () => {
    view(story());
    expect((screen.getByRole("button", { name: "Later" }) as HTMLButtonElement).disabled).toBe(true);
    earlier();
    expect(screen.getByRole("group", { name: /^Water, 7 days to Tuesday, November 3/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Earlier" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.getByText(/^Last 7 days: /)).toBeTruthy();
  });
});
