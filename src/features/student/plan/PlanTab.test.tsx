import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ipc } from "@/ipc";
import { ymd } from "@/lib/dates";
import { PlanTab } from "./PlanTab";

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const wrap = (ui: React.ReactElement) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

let run = 0;
/** Two courses with an exam, a task and a note each. The mock keeps data between tests, so names are unique per test. */
async function setup() {
  await ipc.prefsSet("study.planFilter", null);
  const k = `${++run}`;
  const P = `Physics${k}`; const M = `Maths${k}`;
  const physics = await ipc.courseCreate(P);
  const maths = await ipc.courseCreate(M);
  await ipc.examAdd(physics.id, `${P} mid-term`, inDays(4));
  await ipc.examAdd(maths.id, `${M} final`, inDays(20));
  const t1 = await ipc.taskQuickAdd(`${P} problem set`);
  const t2 = await ipc.taskQuickAdd(`${M} proofs`);
  await ipc.taskSetCourse(t1.id, physics.id);
  await ipc.taskSetCourse(t2.id, maths.id);
  const n1 = await ipc.noteCreate({ title: `${P} lecture 1` });
  const n2 = await ipc.noteCreate({ title: `${M} lecture 1` });
  await ipc.noteSetCourse(n1.id, physics.id);
  await ipc.noteSetCourse(n2.id, maths.id);
  return { P, M, physics, maths, t1 };
}

describe("Exams, notes, tasks", () => {
  it("All courses shows everything with a course; picking Physics shows only Physics (exams, tasks and notes)", async () => {
    const { P, M } = await setup();
    render(wrap(<PlanTab />));
    expect(await screen.findByText(`${P} mid-term`)).toBeTruthy();
    expect(screen.getByText(`${M} final`)).toBeTruthy();
    expect(screen.getByText(`${M} proofs`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: P }));
    await waitFor(() => expect(screen.queryByText(`${M} final`)).toBeNull());
    expect(screen.queryByText(`${M} proofs`)).toBeNull();
    expect(screen.queryByText(`${M} lecture 1`)).toBeNull();
    expect(screen.getByText(`${P} problem set`)).toBeTruthy();
    expect(screen.getByText(`${P} lecture 1`)).toBeTruthy();
    expect(screen.getByText("4 days")).toBeTruthy();
  });

  it("completing a task here completes the task itself", async () => {
    const { P, t1 } = await setup();
    render(wrap(<PlanTab />));
    fireEvent.click(await screen.findByRole("button", { name: P }));
    fireEvent.click(await screen.findByRole("checkbox", { name: `Done: ${P} problem set` }));
    await waitFor(async () => expect((await ipc.taskGet(t1.id)).status).toBe("COMPLETED"));
    fireEvent.click(await screen.findByRole("button", { name: /Show done/ }));
    expect(screen.getByRole("checkbox", { name: `Done: ${P} problem set` })).toBeTruthy();
  });

  it("adds a task and a note to the chosen course, and an exam with its course", async () => {
    const { M } = await setup();
    render(wrap(<PlanTab />));
    fireEvent.click(await screen.findByRole("button", { name: M }));
    fireEvent.change(screen.getByRole("textbox", { name: "New task" }), { target: { value: "Maths mock paper" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "New task" }).closest("form") as HTMLFormElement);
    expect(await screen.findByText("Maths mock paper")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "New note" }), { target: { value: "Maths revision plan" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "New note" }).closest("form") as HTMLFormElement);
    expect(await screen.findByText("Maths revision plan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add exam" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Exam name" }), { target: { value: "Maths viva" } });
    fireEvent.change(screen.getByLabelText("Exam date"), { target: { value: inDays(2) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const card = (await screen.findByText("Maths viva")).closest("li") as HTMLElement;
    expect(within(card).getByText(M)).toBeTruthy();
  });

  it("asks before deleting an exam, and opens a note in its own window", async () => {
    const { P, M } = await setup();
    const open = vi.spyOn(ipc, "noteWindowOpen").mockResolvedValue(null);
    render(wrap(<PlanTab />));
    fireEvent.click(await screen.findByRole("button", { name: `Open note ${P} lecture 1` }));
    expect(open).toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: `Delete ${M} final` }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText(`${M} final`)).toBeNull());
  });
});
