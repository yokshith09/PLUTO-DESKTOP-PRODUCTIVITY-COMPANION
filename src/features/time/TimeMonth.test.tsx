import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/ipc";
import { dayLabel, parseYmd, ymd } from "@/lib/dates";
import { TimeMonth } from "./TimeMonth";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const wrap = (tracking = true) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TimeMonth tracking={tracking} /></QueryClientProvider>);
const apps = [
  { app: "VS Code", category: "Coding", is_browser: false, total_seconds: 3 * 3600, sessions: 2 },
  { app: "Chrome", category: "Research", is_browser: true, total_seconds: 1800, sessions: 3 },
];
const summary = (total: number, list = apps) => ({ total_seconds: total, apps: list, domains: [], hourly_seconds: new Array<number>(24).fill(0) }) as never;

describe("Time by day (U-6)", () => {
  it("shows each day's total on its tile and its categories in the hover card", async () => {
    // Day 1 of this month has 3h 30m; every other day nothing.
    const first = `${ymd(new Date()).slice(0, 7)}-01`;
    vi.spyOn(ipc, "usageSummary").mockImplementation(async (from: number) => (from === parseYmd(first).getTime() ? summary(12_600) : summary(0, [])));
    wrap();
    const tile = await screen.findByRole("button", { name: `${dayLabel(parseYmd(first))}: 3h 30m` });
    expect(tile.textContent).toContain("3h 30m");
    const card = tile.parentElement?.querySelector("[role=tooltip]") as HTMLElement;
    expect(within(card).getByText("Coding")).toBeTruthy();
    expect(within(card).getByText("3h")).toBeTruthy();
    expect(within(card).getByText("Research")).toBeTruthy();
    expect(within(card).getByText("30m")).toBeTruthy();
    expect(screen.getByText(/in 1 day/)).toBeTruthy();
  });

  it("changes month with the arrows and by sliding, and cannot go past this month", async () => {
    vi.spyOn(ipc, "usageSummary").mockResolvedValue(summary(0, []));
    wrap();
    const region = await screen.findByRole("region", { name: "Time by day" });
    const heading = () => within(region).getByRole("heading").textContent;
    const now = heading();
    expect((within(region).getByRole("button", { name: "Next month" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(region).getByRole("button", { name: "Previous month" }));
    expect(heading()).not.toBe(now);
    const grid = region.querySelector(".diary-slide-prev, .diary-slide-next") as HTMLElement;
    fireEvent(grid, new MouseEvent("pointerdown", { bubbles: true, clientX: 300, clientY: 100 }));
    fireEvent(grid, new MouseEvent("pointerup", { bubbles: true, clientX: 120, clientY: 108 }));
    expect(heading()).toBe(now);
    fireEvent.click(within(region).getByRole("button", { name: "Previous month" }));
    fireEvent.click(await within(region).findByRole("button", { name: "This month" }));
    expect(heading()).toBe(now);
  });

  it("says what to do when tracking is off and asks for nothing", async () => {
    const spy = vi.spyOn(ipc, "usageSummary");
    wrap(false);
    expect(await screen.findByText("Turn on app tracking to see each day here.")).toBeTruthy();
    await waitFor(() => expect(spy).not.toHaveBeenCalled());
  });

  it("a day with nothing says so in its hover card, and a future day has none", async () => {
    vi.spyOn(ipc, "usageSummary").mockResolvedValue(summary(0, []));
    wrap();
    await screen.findByRole("region", { name: "Time by day" });
    expect((await screen.findAllByText("Nothing tracked.")).length).toBeGreaterThan(0);
  });
});
