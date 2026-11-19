import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ipc } from "@/ipc";
import { ymd } from "@/lib/dates";
import { CoursePicker, CourseTag } from "./CoursePicker";
import { ExamCountdown, countdownLabel } from "./ExamCountdown";
import { hoursLabel } from "@/lib/focus";
import { StudyPage } from "./StudyPage";

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const wrap = (ui: React.ReactElement) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
function prefs(initial: Record<string, unknown>) {
  const store = { ...initial };
  vi.spyOn(ipc, "prefsGet").mockImplementation(async (k: string) => (store[k] ?? null) as never);
  vi.spyOn(ipc, "prefsSet").mockImplementation(async (k: string, v: unknown) => { store[k] = v; return null as never; });
  return store;
}
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

describe("student pack helpers", () => {
  it("counts down in plain words", () => {
    expect(countdownLabel(0)).toBe("Today");
    expect(countdownLabel(1)).toBe("Tomorrow");
    expect(countdownLabel(12)).toBe("12 days");
  });
  it("shows focus time as minutes, then hours", () => {
    expect(hoursLabel(0)).toBe("0 min");
    expect(hoursLabel(50 * 60_000)).toBe("50 min");
    expect(hoursLabel(125 * 60_000)).toBe("2 h 05 min");
  });
});

describe("the course label", () => {
  it("is on for a student, off for the rest, and a saved switch beats the role", async () => {
    prefs({ "ui.role": "general" });
    const { container, unmount } = render(wrap(<CoursePicker kind="task" id="t1" />));
    await new Promise((r) => setTimeout(r, 30));
    expect(container.textContent).toBe("");
    unmount();

    prefs({ "ui.role": "student" });
    render(wrap(<CoursePicker kind="task" id="t1" />));
    expect(await screen.findByRole("combobox", { name: "Course" })).toBeTruthy();
    cleanup();

    prefs({ "ui.role": "student", "ui.studentPack": false });
    const off = render(wrap(<CoursePicker kind="task" id="t1" />));
    await new Promise((r) => setTimeout(r, 30));
    expect(off.container.textContent).toBe("");
    cleanup();

    prefs({ "ui.role": "developer", "ui.studentPack": true });
    render(wrap(<CoursePicker kind="note" id="n1" />));
    expect(await screen.findByRole("combobox", { name: "Course" })).toBeTruthy();
  });

  it("makes a course on the spot, puts the task in it, and shows the tag", async () => {
    prefs({ "ui.role": "student" });
    render(wrap(<><CoursePicker kind="task" id="tpick" /><CourseTag kind="task" id="tpick" /></>));
    const select = (await screen.findByRole("combobox", { name: "Course" })) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "__new__" } });
    const input = screen.getByRole("textbox", { name: "New course name" });
    fireEvent.change(input, { target: { value: "Chemistry" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(screen.getByText("Chemistry", { selector: "span" })).toBeTruthy());
    expect((await screen.findByRole("combobox", { name: "Course" }) as HTMLSelectElement).selectedOptions[0]?.textContent).toBe("Chemistry");
    fireEvent.change(screen.getByRole("combobox", { name: "Course" }), { target: { value: "" } });
    await waitFor(() => expect(screen.queryByText("Chemistry", { selector: "span" })).toBeNull());
  });
});

describe("the exam countdown", () => {
  it("lists the next exams with days to go, and stays away when the pack is off", async () => {
    prefs({ "ui.role": "student" });
    await ipc.examAdd(null, "Mid-term", inDays(5));
    await ipc.examAdd(null, "Viva", inDays(1));
    const onManage = vi.fn();
    render(wrap(<ExamCountdown onManage={onManage} />));
    const region = await screen.findByRole("region", { name: "Exam countdown" });
    expect(within(region).getByText("Tomorrow")).toBeTruthy();
    expect(within(region).getByText("5 days")).toBeTruthy();
    const text = region.textContent ?? "";
    expect(text.indexOf("Viva")).toBeLessThan(text.indexOf("Mid-term"));
    fireEvent.click(within(region).getByRole("button", { name: "Manage" }));
    expect(onManage).toHaveBeenCalled();
    cleanup();

    prefs({ "ui.role": "general" });
    const off = render(wrap(<ExamCountdown onManage={onManage} />));
    await new Promise((r) => setTimeout(r, 30));
    expect(off.container.textContent).toBe("");
  });
});

describe("the Study page", () => {
  const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

  it("adds a course, adds an exam, has no Weekly report tab and deletes the course after asking", async () => {
    prefs({ "ui.role": "student" });
    render(wrap(<StudyPage />));
    fireEvent.click(await screen.findByRole("button", { name: "Add Course" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New course name" }), { target: { value: "Biology" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("heading", { name: /Biology/ })).toBeTruthy();

    openTab("Exams, notes, tasks");
    fireEvent.click(await screen.findByRole("button", { name: "Add exam" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Exam name" }), { target: { value: "Lab exam" } });
    fireEvent.change(screen.getByLabelText("Exam date"), { target: { value: inDays(9) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("9 days")).toBeTruthy();

    expect(screen.queryByRole("tab", { name: "Weekly report" })).toBeNull();

    openTab("Courses");
    fireEvent.click(await screen.findByRole("button", { name: "Course Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete course" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Biology/ })).toBeNull());
  });

  it("says Friends are planned for later", async () => {
    prefs({ "ui.role": "student" });
    render(wrap(<StudyPage />));
    openTab("Friends");
    expect(screen.getByText(/Planned for later/)).toBeTruthy();
  });
});
