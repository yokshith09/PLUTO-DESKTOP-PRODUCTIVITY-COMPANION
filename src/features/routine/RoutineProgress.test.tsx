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
const water = () => screen.getByRole("group", { name: /^Water, 14 days/ });

describe("RoutineProgress, stepping stones (U-8)", () => {
  it("opens with kind words, one path per routine, and a next win", () => {
    view(story());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("group", { name: /^Stretch, 14 days/ })).toBeTruthy();
    expect(water()).toBeTruthy();
    expect(screen.getByText(/is your next win/i)).toBeTruthy();
    expect(screen.getByText("This week and last week")).toBeTruthy();
    // Stretch was done every day: no hollow stones on its path.
    expect(within(screen.getByRole("group", { name: /^Stretch, 14 days/ })).queryAllByRole("button")).toHaveLength(0);
  });

  it("skipped days are hollow stones you can tap; done days and today are not buttons", () => {
    view(story());
    const skipped = within(water()).getAllByRole("button");
    // Water was done on days 1 to 3 only: days 4 to 9 were skipped, today is still open.
    expect(skipped).toHaveLength(6);
    expect(skipped[0]?.getAttribute("aria-label")).toMatch(/skipped, add a reason/);
    expect(within(water()).getByRole("img", { name: /Tuesday, November 10.*still open today/ })).toBeTruthy();
    expect(within(water()).getAllByRole("img", { name: /done/ }).length).toBe(3);
  });

  it("tapping a hollow stone offers quick reasons or your own words, and saves it (optional)", () => {
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

  it("goes back 14 days at a time, never past the first recorded day, and returns", () => {
    view(story());
    expect((screen.getByRole("button", { name: "Earlier" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Later" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
