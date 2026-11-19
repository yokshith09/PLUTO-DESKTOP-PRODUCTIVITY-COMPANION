import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ipc } from "@/ipc";
import { ymd } from "@/lib/dates";
import { CoursesTab } from "./CoursesTab";

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const wrap = (ui: React.ReactElement) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });

/** A course with two topics, made through the same commands the page uses. */
async function seed(name: string) {
  const c = await ipc.courseCreate(name);
  await ipc.courseEdit({ op: "topic_add", course_id: c.id, title: "B-Trees" });
  await ipc.courseEdit({ op: "topic_add", course_id: c.id, title: "Proofs" });
  return c;
}
/** The mock keeps its data between tests, so each test opens its own course from the list. */
async function openCourse(name: string) {
  fireEvent.click(await screen.findByRole("button", { name }));
  await screen.findByRole("heading", { name: new RegExp(name) });
}

describe("the Course page", () => {
  it("starts empty, adds a course, and shows its name, badge and summary", async () => {
    render(wrap(<CoursesTab />));
    expect(await screen.findByText(/Add your first course/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Course" }));
    type(screen.getByRole("textbox", { name: "New course name" }), "Advanced Algorithms & Analysis");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("heading", { name: /Advanced Algorithms/ })).toBeTruthy();
    expect(screen.getByText("AAA")).toBeTruthy();
    const sum = screen.getByRole("region", { name: "Course summary" });
    expect(within(sum).getByText("No exam yet")).toBeTruthy();
    const week = within(sum).getByRole("region", { name: "This week" });
    expect(within(week).getByText("Open tasks")).toBeTruthy();
    expect(within(sum).getByRole("img", { name: "0 of 0 topics exam-ready" })).toBeTruthy();
    expect(screen.getByText(/No topics yet/)).toBeTruthy();
  });

  it("adds topics, subtopics and short notes, and marks a note as written", async () => {
    await seed("Algorithms");
    render(wrap(<CoursesTab />));
    await openCourse("Algorithms");
    expect(await screen.findByRole("button", { name: "Expand B-Trees" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Expand B-Trees" }));
    expect(screen.getByText(/No subtopics yet/)).toBeTruthy();
    const sub = screen.getByRole("textbox", { name: "New subtopic for B-Trees" });
    type(sub, "Insert");
    fireEvent.submit(sub.closest("form") as HTMLFormElement);
    fireEvent.click(await screen.findByRole("button", { name: "Open short notes of Insert" }));
    const note = screen.getByRole("textbox", { name: "New short note for Insert" });
    type(note, "Split the node when full");
    fireEvent.submit(note.closest("form") as HTMLFormElement);
    expect(await screen.findByText("Split the node when full")).toBeTruthy();
    expect(screen.getByText("0/1 written")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Written in notebook/ }));
    expect(await screen.findByText("In Notebook")).toBeTruthy();
    expect(screen.getByText("1 / 0 subtopics".replace("1 / 0", "0 / 1"), { exact: false })).toBeTruthy();
  });

  it("the student sets the status and star, and the chips filter", async () => {
    await seed("Networks");
    render(wrap(<CoursesTab />));
    await openCourse("Networks");
    fireEvent.click(await screen.findByRole("button", { name: /Star B-Trees/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unstar B-Trees" }).getAttribute("aria-pressed")).toBe("true"));
    fireEvent.change(screen.getByRole("combobox", { name: "Status of Proofs" }), { target: { value: "3" } });
    await waitFor(() => expect((screen.getByRole("combobox", { name: "Status of Proofs" }) as HTMLSelectElement).value).toBe("3"));
    fireEvent.click(screen.getByRole("button", { name: /^Starred/ }));
    expect(screen.queryByText("Proofs")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Not Ready/ }));
    expect(screen.queryByText("Proofs")).toBeNull();
    expect(screen.getByText("B-Trees")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    type(screen.getByRole("textbox", { name: "Search topics" }), "proof");
    expect(screen.queryByText("B-Trees")).toBeNull();
    expect(screen.getByText("Proofs")).toBeTruthy();
  });

  it("moves a topic with the arrow keys", async () => {
    await seed("Order");
    render(wrap(<CoursesTab />));
    await openCourse("Order");
    const handle = await screen.findByRole("button", { name: /Move Proofs/ });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    await waitFor(() => {
      const names = within(screen.getByRole("list", { name: "Topics" })).getAllByRole("combobox").map((s) => s.getAttribute("aria-label"));
      expect(names).toEqual(["Status of Proofs", "Status of B-Trees"]);
    });
  });

  it("adds an exam with time, place and topics, and shows the countdown", async () => {
    await seed("Exams course");
    render(wrap(<CoursesTab />));
    await openCourse("Exams course");
    await screen.findByRole("button", { name: "Expand B-Trees" });
    const panel = screen.getByRole("region", { name: "Exams" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add Exam" }));
    type(within(panel).getByRole("textbox", { name: /Exam name/ }), "Midterm");
    type(within(panel).getByLabelText("Date"), inDays(6));
    type(within(panel).getByLabelText("Time"), "10:00");
    type(within(panel).getByRole("textbox", { name: /Place or seat/ }), "C-201");
    fireEvent.click(within(panel).getByRole("button", { name: "B-Trees" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Add exam" }));
    expect(await within(panel).findByText(/10:00 AM \| C-201/)).toBeTruthy();
    expect(within(panel).getByText("B-Trees")).toBeTruthy();
    const sum = screen.getByRole("region", { name: "Course summary" });
    expect(within(sum).getByText("6 days")).toBeTruthy();
    expect(within(sum).getByText(/Midterm/)).toBeTruthy();
  });

  it("adds an important date with a type and asks before deleting it", async () => {
    await seed("Dates course");
    render(wrap(<CoursesTab />));
    await openCourse("Dates course");
    await screen.findByRole("button", { name: "Expand B-Trees" });
    const panel = screen.getByRole("region", { name: "Important Dates" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add Date" }));
    type(within(panel).getByRole("textbox", { name: /Title/ }), "Lab 2 report");
    type(within(panel).getByLabelText("Date"), inDays(3));
    type(within(panel).getByRole("combobox", { name: /Type/ }), "lab");
    fireEvent.click(within(panel).getByRole("button", { name: "Add date" }));
    expect(await within(panel).findByText("Lab 2 report")).toBeTruthy();
    expect(within(panel).getByText("Lab")).toBeTruthy();
    expect(within(panel).getByText(/in 3 days/)).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Delete Lab 2 report" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(within(panel).queryByText("Lab 2 report")).toBeNull());
  });

  it("archives a course into the Archived row and restores it", async () => {
    const a = await ipc.courseCreate("Keep");
    await ipc.courseCreate("Old one");
    render(wrap(<CoursesTab />));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Course options for Old one" }));
    await user.click(await screen.findByRole("menuitem", { name: "Archive course" }));
    const toggle = await screen.findByRole("button", { name: /Archived \(1\)/ });
    expect(screen.queryByRole("button", { name: "Old one" })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Old one" })).toBeTruthy();
    expect(a.id).toBeTruthy();
  });

  it("saves the line under the name and the colour in Course Settings", async () => {
    await ipc.courseCreate("Settings course");
    render(wrap(<CoursesTab />));
    await openCourse("Settings course");
    fireEvent.click(await screen.findByRole("button", { name: "Course Settings" }));
    const line = screen.getByRole("textbox", { name: /Line under the name/ });
    type(line, "CSE • 5th Semester");
    fireEvent.blur(line);
    fireEvent.click(screen.getByRole("button", { name: "Colour 4" }));
    expect(await screen.findByText("CSE • 5th Semester", { selector: "p" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Colour 4" }).getAttribute("aria-pressed")).toBe("true"));
  });
});
