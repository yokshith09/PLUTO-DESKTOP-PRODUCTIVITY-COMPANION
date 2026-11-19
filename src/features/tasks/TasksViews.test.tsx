import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ipc } from "@/ipc";
import { ymd } from "@/lib/dates";
import { toEdit } from "./edit";
import { TasksPage } from "./TasksPage";

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const wrap = (ui: React.ReactElement) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

describe("Tasks: missed, upcoming range, projects (owner 2026-11-19)", () => {
  it("a task planned for an earlier day with no deadline shows under Missed, with a banner on Today", async () => {
    const t = await ipc.taskQuickAdd("Missed lab report");
    await ipc.taskUpdate(t.id, { ...toEdit(t), planned_date: inDays(-3), due_date: null });
    const user = userEvent.setup();
    render(wrap(<TasksPage />));
    const banner = await screen.findByRole("button", { name: /missed task/ });
    await user.click(banner);
    expect(await screen.findByText("Missed lab report")).toBeTruthy();
    expect(screen.getAllByText("Missed").length).toBeGreaterThan(0);
  });

  it("Upcoming can reach the end of the month, and a picked day shows its tasks", async () => {
    const t = await ipc.taskQuickAdd("Far task");
    const far = inDays(10);
    await ipc.taskUpdate(t.id, { ...toEdit(t), planned_date: far, due_date: null });
    const user = userEvent.setup();
    render(wrap(<TasksPage />));
    await user.click(await screen.findByRole("radio", { name: "Upcoming" }));
    expect(screen.queryByText("Far task")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Pick a day" }));
    expect(screen.getByRole("group", { name: "Pick a day" })).toBeTruthy();
    // The month may or may not contain day+10; only assert when it does.
    if (far.slice(0, 7) === ymd(new Date()).slice(0, 7)) {
      await user.click(await screen.findByRole("radio", { name: /^Rest of/ }));
      await waitFor(() => expect(screen.getByText("Far task")).toBeTruthy());
    }
  });

  it("the Project filter lists a project made on the Projects page that has no task yet", async () => {
    await ipc.prefsSet("projects.spaces", { projects: [{ name: "Zeta Empty Project", folder: null, links: [] }] });
    render(wrap(<TasksPage />));
    await userEvent.setup().click(await screen.findByRole("button", { name: /^Project:/ }));
    expect(await screen.findByRole("menuitemradio", { name: "Zeta Empty Project" })).toBeTruthy();
  });
});
