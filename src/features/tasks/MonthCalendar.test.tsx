import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonthCalendar, addMonths, monthGrid, monthOf } from "./MonthCalendar";

afterEach(cleanup);

describe("month calendar (U-3)", () => {
  it("lays a month out in weeks from Sunday", () => {
    const g = monthGrid("2026-11-01"); // 1 Nov 2026 is a Sunday
    expect(g[0]).toBe("2026-11-01");
    expect(g.filter(Boolean)).toHaveLength(30);
    expect(g.length % 7).toBe(0);
    const feb = monthGrid("2027-02-01"); // a Monday
    expect(feb[0]).toBeNull();
    expect(feb[1]).toBe("2027-02-01");
    expect(feb.filter(Boolean)).toHaveLength(28);
    expect(monthOf("2026-11-17")).toBe("2026-11-01");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("marks the planned days and the deadline, opens on the first planned day, and pages months", async () => {
    const user = userEvent.setup();
    const pick = vi.fn();
    render(<MonthCalendar label="Calendar" marked={["2030-05-03", "2030-05-05"]} deadline="2030-05-10" onPick={pick} />);
    const cal = screen.getByRole("group", { name: "Calendar" });
    const third = new Date(2030, 4, 3).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    const tenth = new Date(2030, 4, 10).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    expect(within(cal).getByRole("button", { name: third }).getAttribute("aria-pressed")).toBe("true");
    expect(within(cal).getByRole("button", { name: `${tenth}, deadline` })).toBeTruthy();
    await user.click(within(cal).getByRole("button", { name: `${tenth}, deadline` }));
    expect(pick).toHaveBeenCalledWith("2030-05-10");
    await user.click(within(cal).getByRole("button", { name: "Next month" }));
    expect(within(cal).queryByRole("button", { name: third })).toBeNull();
    await user.click(within(cal).getByRole("button", { name: "Previous month" }));
    expect(within(cal).getByRole("button", { name: third })).toBeTruthy();
  });
});
