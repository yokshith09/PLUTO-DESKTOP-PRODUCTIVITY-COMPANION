import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ipc } from "@/ipc";
import { parseCsv } from "@/ipc/mockClasses";
import { ImportDialog, CHATGPT_PROMPT } from "./ImportDialog";
import { TimetableTab } from "./TimetableTab";

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const wrap = (ui: React.ReactElement) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const clear = async () => { for (const c of await ipc.classesList()) await ipc.classDelete(c.id); };

describe("the timetable", () => {
  it("shows the week, adds a class, and puts it in the right day", async () => {
    await clear();
    render(wrap(<TimetableTab />));
    expect(await screen.findByText(/No classes yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add class" }));
    const dialog = await screen.findByRole("dialog");
    type(within(dialog).getByLabelText(/^Name/), "Algorithms");
    type(within(dialog).getByLabelText("Day"), "2");
    type(within(dialog).getByLabelText("Starts"), "10:00");
    type(within(dialog).getByLabelText("Ends"), "11:30");
    type(within(dialog).getByLabelText("Place"), "C-201");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const block = await screen.findByRole("button", { name: /Algorithms, 10:00 AM to 11:30 AM, C-201/ });
    expect(block.closest("[role=group]")?.getAttribute("aria-label")).toMatch(/^Wed /);
  });

  it("changes a class from its block and deletes it after asking", async () => {
    await clear();
    await ipc.classAdd({ course_id: null, title: "Maths", day: 0, start_min: 540, end_min: 600, place: "", teacher: "", repeat: "weekly", once_date: null, remind_min: null });
    render(wrap(<TimetableTab />));
    fireEvent.click(await screen.findByRole("button", { name: /Maths, 9:00 AM/ }));
    const dialog = await screen.findByRole("dialog");
    type(within(dialog).getByLabelText("Teacher"), "Dr Rao");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(async () => expect((await ipc.classesList())[0]?.teacher).toBe("Dr Rao"));
    fireEvent.click(await screen.findByRole("button", { name: /Maths, 9:00 AM/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Maths, 9:00 AM/ })).toBeNull());
  });

  it("refuses a class that ends before it starts and says why", async () => {
    await clear();
    render(wrap(<TimetableTab />));
    fireEvent.click(await screen.findByRole("button", { name: "Add class" }));
    const dialog = await screen.findByRole("dialog");
    type(within(dialog).getByLabelText(/^Name/), "Backwards");
    type(within(dialog).getByLabelText("Starts"), "11:00");
    type(within(dialog).getByLabelText("Ends"), "10:00");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/end after it starts/);
  });

  it("offers to widen the day when classes fall outside the shown hours", async () => {
    await clear();
    await ipc.classAdd({ course_id: null, title: "Early bird", day: 0, start_min: 6 * 60 + 30, end_min: 7 * 60 + 30, place: "", teacher: "", repeat: "weekly", once_date: null, remind_min: null });
    render(wrap(<TimetableTab />));
    const note = await screen.findByRole("status");
    expect(note.textContent).toMatch(/1 class is outside 8:00 AM to 6:00 PM/);
    fireEvent.click(within(note).getByRole("button", { name: "Widen the day" }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getByRole("button", { name: /Early bird/ })).toBeTruthy();
  });

  it("saves the view settings", async () => {
    await clear();
    const set = vi.spyOn(ipc, "prefsSet");
    render(wrap(<TimetableTab />));
    fireEvent.click(await screen.findByRole("button", { name: "View" }));
    type(screen.getByLabelText("Days shown"), "5");
    await waitFor(() => expect(set).toHaveBeenCalledWith("study.timetable", expect.objectContaining({ days: 5 })));
    expect(screen.queryByRole("group", { name: /^Sat / })).toBeNull();
  });
});

describe("timetable import and export", () => {
  it("previews a CSV with its bad lines, then replaces the timetable", async () => {
    await clear();
    await ipc.classAdd({ course_id: null, title: "Old", day: 0, start_min: 480, end_min: 540, place: "", teacher: "", repeat: "weekly", once_date: null, remind_min: null });
    const onChanged = vi.fn();
    render(wrap(<ImportDialog open onClose={() => {}} onChanged={onChanged} />));
    const file = new File(["course,day,start,end,place,teacher\nPhysics,Mon,09:00,10:00,A1,Ms Ito\nBroken,Funday,09:00,10:00\n"], "tt.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Choose a CSV or Excel file"), { target: { files: [file] } });
    const preview = await screen.findByRole("group", { name: "Preview" });
    expect(within(preview).getByText(/tt.csv: 1 class found, 1 line skipped/)).toBeTruthy();
    expect(within(preview).getByText(/Line 3: The day must be/)).toBeTruthy();
    fireEvent.click(within(preview).getByRole("button", { name: "Replace my timetable" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((await ipc.classesList()).map((c) => c.title)).toEqual(["Physics"]);
  });

  it("exports the same columns it imports, and the ChatGPT prompt names them", async () => {
    await clear();
    await ipc.classesImport("Algorithms,Mon,09:30,10:30,C-201,Dr Rao\n\"Maths, applied\",Tue,13:00,14:00,,", true);
    const csv = await ipc.classesExport();
    expect(csv).toBe("course,day,start,end,place,teacher\nAlgorithms,Mon,09:30,10:30,C-201,Dr Rao\n\"Maths, applied\",Tue,13:00,14:00,,\n");
    expect(parseCsv(csv).rows).toHaveLength(2);
    expect(CHATGPT_PROMPT).toContain("course,day,start,end,place,teacher");
  });
});
