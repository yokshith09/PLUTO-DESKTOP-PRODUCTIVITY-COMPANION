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
const water = () => screen.getByRole("group", { name: /^Water, week of/ });
const earlier = () => fireEvent.click(screen.getByRole("button", { name: "Earlier" }));

describe("Habit tracker (owner reference 2026-11-19)", () => {
  it("shows today as a ring and one sentence, each habit with its week Monday to Sunday, the week chart and a kind word", () => {
    view(story());
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Today (Tue Nov 10): Stretch done, Water not yet.
    expect(screen.getByRole("img", { name: "Today: 1 of 2 habits done" })).toBeTruthy();
    expect(screen.getByText("1 of 2 habits done today")).toBeTruthy();
    const stretch = screen.getByRole("group", { name: /^Stretch, week of Monday, November 9/ });
    // Mon and Tue done; Wed to Sun still to come.
    expect(within(stretch).getAllByRole("img", { name: /: done$/ })).toHaveLength(2);
    expect(within(stretch).getAllByRole("img", { name: /still to come/ })).toHaveLength(5);
    expect(screen.getByRole("region", { name: "This week" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "A kind word" })).toBeTruthy();
    // Nothing is red or struck through.
    expect(document.querySelector(".line-through, .text-destructive")).toBeNull();
  });

  it("days to come never count against you: the count is days done of the days so far", () => {
    view(story());
    const rows = screen.getAllByRole("listitem");
    const waterRow = rows.find((r) => within(r).queryByText("Water"));
    // Water: Monday not done, today still open: 0 of 1.
    expect(waterRow && within(waterRow).getByText("0 of 1")).toBeTruthy();
  });

  it("ticks today from the tracker and renames from Edit", () => {
    const onChange = vi.fn();
    const s = story();
    view(s, onChange);
    fireEvent.click(screen.getByRole("checkbox", { name: "Water today" }));
    expect((onChange.mock.calls[0]?.[0] as (x: RoutineState) => RoutineState)(s).done).toContain("w");
    fireEvent.click(screen.getByRole("button", { name: "Edit Water" }));
    const box = screen.getByLabelText("New name for Water");
    fireEvent.change(box, { target: { value: "2 litres of water" } });
    fireEvent.submit(box.closest("form") as HTMLFormElement);
    expect((onChange.mock.calls[1]?.[0] as (x: RoutineState) => RoutineState)(s).items.map((i) => i.title)).toContain("2 litres of water");
  });

  it("a day not done is a quiet empty dot you can tap to note why (optional), and saves it", () => {
    const onChange = vi.fn();
    const s = story();
    view(s, onChange);
    const missed = within(water()).getAllByRole("button");
    // Monday the 9th only: today is still open and later days are to come.
    expect(missed).toHaveLength(1);
    expect(missed[0]?.getAttribute("aria-label")).toMatch(/November 9.*not done, add a note if you like/);
    fireEvent.click(missed[0] as HTMLElement);
    const sheet = screen.getByRole("group", { name: "What got in the way?" });
    expect(within(sheet).getByText(/Totally optional/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Too tired" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(((onChange.mock.calls[0]?.[0]) as (x: RoutineState) => RoutineState)(s).reasons["2026-11-09"]).toEqual({ w: "Too tired" });
  });

  it("your own words are used, and No reason clears one", () => {
    const onChange = vi.fn();
    const s = setReason(story(), "2026-11-09", "w", "Busy day");
    view(s, onChange);
    fireEvent.click(within(water()).getByRole("button", { name: /November 9.*not done, Busy day/ }));
    const sheet = screen.getByRole("group", { name: "What got in the way?" });
    expect((within(sheet).getByLabelText("Reason in your own words") as HTMLInputElement).value).toBe("Busy day");
    fireEvent.click(within(sheet).getByRole("button", { name: "No reason" }));
    expect(((onChange.mock.calls[0]?.[0]) as (x: RoutineState) => RoutineState)(s).reasons).toEqual({});
  });

  it("with no reasons yet it invites rather than scolds, and counts the reasons you gave", () => {
    view(story());
    expect(screen.getByText(/Nothing noted yet/)).toBeTruthy();
    cleanup();
    let s = setReason(story(), "2026-11-04", "w", "Too tired");
    s = setReason(s, "2026-11-05", "w", "Too tired");
    view(s);
    const box = screen.getByRole("region", { name: "What got in the way" });
    expect(within(box).getByText("Too tired")).toBeTruthy();
    expect(within(box).getByText(/Tired days happen/)).toBeTruthy();
  });

  it("goes back a week at a time, never before the first recorded week, and returns", () => {
    view(story());
    expect((screen.getByRole("button", { name: "Later" }) as HTMLButtonElement).disabled).toBe(true);
    earlier();
    expect(screen.getByRole("group", { name: /^Water, week of Monday, November 2/ })).toBeTruthy();
    // No tick for today on a past week.
    expect(screen.queryByRole("checkbox", { name: "Water today" })).toBeNull();
    earlier();
    expect((screen.getByRole("button", { name: "Earlier" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.getAllByText("This week").length).toBe(2);
  });
});
