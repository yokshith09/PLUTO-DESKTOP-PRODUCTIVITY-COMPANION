import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoutineProgress } from "./RoutineProgress";
import { addItem, emptyRoutine, rollOver, toggle } from "./routine";

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

describe("RoutineProgress (U-8)", () => {
  it("opens with kind words, a month of days, and a next win", () => {
    render(<RoutineProgress open onClose={vi.fn()} state={story()} today={TODAY} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("November 2026")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /2 of 2 done/ }).length).toBe(3);
    expect(screen.getByText(/is your next win/i)).toBeTruthy();
    expect(screen.getByText("This week and last week")).toBeTruthy();
  });

  it("hovering a day lists what was planned and done", () => {
    render(<RoutineProgress open onClose={vi.fn()} state={story()} today={TODAY} />);
    const tips = screen.getAllByRole("tooltip");
    const tip = tips.find((t) => within(t).queryByText("Water") && within(t).queryByText("Stretch") && /1 of 2/.test(t.textContent ?? ""));
    expect(tip).toBeTruthy();
  });

  it("moves back a month and never forward past this one", () => {
    render(<RoutineProgress open onClose={vi.fn()} state={story()} today={TODAY} />);
    expect((screen.getByRole("button", { name: "Next month" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("October 2026")).toBeTruthy();
  });
});
