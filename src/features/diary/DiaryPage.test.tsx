import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ipc } from "@/ipc";
import { ymd } from "@/lib/dates";
import { DiaryPage } from "./DiaryPage";

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const wrap = () => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DiaryPage /></QueryClientProvider>;
const type = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
const today = ymd(new Date());
/** Opens today's card from the calendar and returns the first entry's box, ready to type in. */
async function writeToday() {
  fireEvent.click(await screen.findByRole("button", { name: /^(Write today|Open today)$/ }));
  const box = (await screen.findByRole("textbox", { name: "Entry 1 text" })) as HTMLTextAreaElement;
  await waitFor(() => expect(box.disabled).toBe(false));
  return box;
}

describe("the diary page", () => {
  it("asks for a password first, promises a recovery key, and wants the password typed twice", async () => {
    await ipc.diaryErase();
    render(wrap());
    expect(await screen.findByText("Set a password for your diary")).toBeTruthy();
    expect(screen.getByText(/shows you a recovery key once/)).toBeTruthy();
    type("Password", "secret pass");
    type("Repeat the password", "other pass");
    fireEvent.click(screen.getByRole("button", { name: "Create diary" }));
    expect((await screen.findByRole("alert")).textContent).toContain("not the same");
    type("Repeat the password", "secret pass");
    fireEvent.click(screen.getByRole("button", { name: "Create diary" }));
    // The recovery key is shown once and must be acknowledged before the diary opens.
    expect(await screen.findByRole("region", { name: "Recovery key" })).toBeTruthy();
    expect(screen.getByLabelText("Recovery key value").textContent).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){7}$/);
    expect((screen.getByRole("button", { name: "Open my diary" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Open my diary" }));
    // The calendar opens first, and says how to begin.
    expect(await screen.findByRole("region", { name: "Diary month" })).toBeTruthy();
    expect(screen.getByText(/Press “Write today” to start/)).toBeTruthy();
  });

  it("a forgotten password is replaced with the recovery key", async () => {
    await ipc.diaryErase();
    const key = await ipc.diarySetup("secret pass");
    await ipc.diaryLock();
    render(wrap());
    fireEvent.click(await screen.findByRole("button", { name: /Use the recovery key/ }));
    type("Recovery key", "wrong-key");
    type("New password", "fresh pass1");
    type("Repeat the password", "fresh pass1");
    fireEvent.click(screen.getByRole("button", { name: "Recover diary" }));
    expect((await screen.findByRole("alert")).textContent).toContain("not the right recovery key");
    type("Recovery key", key.toLowerCase());
    fireEvent.click(screen.getByRole("button", { name: "Recover diary" }));
    expect(await screen.findByRole("region", { name: "Diary month" })).toBeTruthy();
    await ipc.diaryLock();
    await ipc.diaryUnlock("fresh pass1");
  });

  it("saves what you write by itself, locks on request, and opens again only with the right password", async () => {
    await ipc.diaryErase();
    await ipc.diarySetup("secret pass");
    render(wrap());
    const area = await writeToday();
    fireEvent.change(area, { target: { value: "Dear diary, today was calm." } });
    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy(), { timeout: 3000 });
    expect(await ipc.diaryDays()).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Lock now/ }));
    expect(await screen.findByText("Unlock your diary")).toBeTruthy();
    expect(screen.queryByText(/Dear diary/)).toBeNull();

    type("Password", "wrong");
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect((await screen.findByRole("alert")).textContent).toContain("not the right password");
    type("Password", "secret pass");
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    // Today's square is on now, and the day has the words in it.
    expect(await screen.findByRole("button", { name: /1 entry, 5 words/ })).toBeTruthy();
    const again = await writeToday();
    await waitFor(() => expect(again.value).toBe("Dear diary, today was calm."));
  });

  it("a day holds two entries as separate notes, and the month tile shows both", async () => {
    await ipc.diaryErase();
    await ipc.diarySetup("secret pass");
    render(wrap());
    const first = await writeToday();
    fireEvent.change(first, { target: { value: "Morning: the lab went well." } });
    fireEvent.click(screen.getByRole("button", { name: "Add another entry" }));
    const second = (await screen.findByRole("textbox", { name: "Entry 2 text" })) as HTMLTextAreaElement;
    // The new entry is where the cursor goes.
    await waitFor(() => expect(document.activeElement).toBe(second));
    fireEvent.change(second, { target: { value: "Evening: rain, a long walk." } });
    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy(), { timeout: 3000 });
    const saved = await ipc.diaryEntries(today);
    expect(saved.map((e) => e.text)).toEqual(["Morning: the lab went well.", "Evening: rain, a long walk."]);
    expect(screen.getByText(/· 2 entries$/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The tile lights up, says 2 entries, and one click opens the day again.
    const tile = await screen.findByRole("button", { name: /2 entries, 10 words/ });
    expect(tile.textContent).toContain("Morning: the lab went well.");
    fireEvent.click(tile);
    expect(await screen.findByRole("textbox", { name: "Entry 2 text" })).toBeTruthy();
  });

  it("deleting an entry asks first and keeps the other one", async () => {
    await ipc.diaryErase();
    await ipc.diarySetup("secret pass");
    await ipc.diaryEntriesSave(today, [{ id: "a", at: 1, text: "Keep me" }, { id: "b", at: 2, text: "Remove me" }]);
    render(wrap());
    await writeToday();
    fireEvent.click(await screen.findByRole("button", { name: "Delete entry 2" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect((await ipc.diaryEntries(today))).toHaveLength(2);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(async () => expect((await ipc.diaryEntries(today)).map((e) => e.text)).toEqual(["Keep me"]));
  });

  it("a click on an earlier square opens that day, and the arrows walk to its neighbours", async () => {
    await ipc.diaryErase();
    await ipc.diarySetup("secret pass");
    const d = new Date(); d.setDate(d.getDate() - 2);
    const two = ymd(d);
    await ipc.diarySave(two, "Met Rao at the chemistry lab");
    render(wrap());
    const square = await screen.findByRole("button", { name: /1 entry, 6 words/ });
    fireEvent.click(square);
    const box = (await screen.findByRole("textbox", { name: "Entry 1 text" })) as HTMLTextAreaElement;
    await waitFor(() => expect(box.value).toBe("Met Rao at the chemistry lab"));
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(async () => expect((screen.getByRole("textbox", { name: "Entry 1 text" }) as HTMLTextAreaElement).value).toBe(""));
    // A day ahead of today is not reachable.
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect((screen.getByRole("button", { name: "Next day" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the month shows its totals and the streak, lights only written days, and slides back and forth", async () => {
    await ipc.diaryErase();
    await ipc.diarySetup("secret pass");
    const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
    // Stay inside this month so the totals do not depend on the date the test runs.
    const dayOfMonth = new Date().getDate();
    const written = [0, 1, 2, 5].filter((n) => n < dayOfMonth);
    for (const n of written) await ipc.diarySave(day(n), "A few words here");
    render(wrap());
    const month = await screen.findByRole("region", { name: "Diary month" });
    await waitFor(() => expect(within(month).getByText(/entries? on/).textContent).toContain(`${written.length} ${written.length === 1 ? "entry" : "entries"} on ${written.length} ${written.length === 1 ? "day" : "days"}`));
    expect(within(month).getAllByRole("button", { name: /: 1 entry, 4 words$/ })).toHaveLength(written.length);
    const heading = () => within(month).getByRole("heading").textContent;
    const now = heading();
    expect((within(month).getByRole("button", { name: "Next month" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(month).getByRole("button", { name: "Previous month" }));
    expect(heading()).not.toBe(now);
    expect(within(month).getByText(/entries on/).textContent).toContain("0 entries on 0 days");
    expect((within(month).getByRole("button", { name: "Next month" }) as HTMLButtonElement).disabled).toBe(false);
    // A sideways swipe moves by a month too: left goes forward, back to this month.
    const grid = month.querySelector(".diary-slide-prev, .diary-slide-next") as HTMLElement;
    // (jsdom has no PointerEvent, so a mouse event of the pointer type carries the coordinates.)
    fireEvent(grid, new MouseEvent("pointerdown", { bubbles: true, clientX: 300, clientY: 100 }));
    fireEvent(grid, new MouseEvent("pointerup", { bubbles: true, clientX: 150, clientY: 110 }));
    expect(heading()).toBe(now);
    // The month strip jumps to a month of this year.
    fireEvent.click(within(month).getByRole("button", { name: /^Jan \d{4}, / }));
    expect(heading()).toMatch(/^January/);
  });

  it("underlines to-dos only when asked, and Make task adds the task with the date read from the words", async () => {
    await ipc.diaryErase();
    await ipc.diarySetup("secret pass");
    const add = vi.spyOn(ipc, "taskQuickAdd");
    const update = vi.spyOn(ipc, "taskUpdate");
    render(wrap());
    const area = await writeToday();
    fireEvent.change(area, { target: { value: "Long day.\nI need to submit the lab report tomorrow." } });
    expect(screen.queryByRole("list", { name: /Things that look like to-dos/ })).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Spot things to do" }));
    const list = await screen.findByRole("list", { name: "Things that look like to-dos in entry 1" });
    expect(within(list).getByText(/Submit the lab report/)).toBeTruthy();
    fireEvent.click(within(list).getByRole("button", { name: "Make task" }));
    await waitFor(() => expect(add).toHaveBeenCalledWith("Submit the lab report"));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0]?.[1].due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await within(list).findByText("Task made")).toBeTruthy();
  });

  it("erasing a forgotten diary asks first", async () => {
    await ipc.diaryErase();
    await ipc.diarySetup("secret pass");
    await ipc.diaryLock();
    render(wrap());
    fireEvent.click(await screen.findByRole("button", { name: "Erase the diary" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect((await ipc.diaryStatus()).configured).toBe(true);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Erase" }));
    expect(await screen.findByText("Set a password for your diary")).toBeTruthy();
  });

  it("searches every entry while open and opens the day of a result", async () => {
    await ipc.diaryErase();
    await ipc.diarySetup("secret pass");
    await ipc.diarySave("2026-10-20", "Met Rao at the chemistry lab");
    await ipc.diaryEntriesSave("2026-10-21", [{ id: "a", at: 1, text: "Long walk by the river" }, { id: "b", at: 2, text: "Evening: zebra crossing story" }]);
    render(wrap());
    const box = await screen.findByRole("searchbox", { name: "Search the diary" });
    fireEvent.change(box, { target: { value: "CHEMISTRY" } });
    const list = await screen.findByRole("list", { name: "Search results" });
    expect(await within(list).findByText("2026-10-20")).toBeTruthy();
    expect(within(list).queryByText("2026-10-21")).toBeNull();
    fireEvent.click(within(list).getByRole("button", { name: /2026-10-20/ }));
    const area = (await screen.findByRole("textbox", { name: "Entry 1 text" })) as HTMLTextAreaElement;
    await waitFor(() => expect(area.value).toBe("Met Rao at the chemistry lab"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The second entry of a day is found too.
    fireEvent.change(box, { target: { value: "zebra" } });
    expect(await within(await screen.findByRole("list", { name: "Search results" })).findByText("2026-10-21")).toBeTruthy();
    fireEvent.change(box, { target: { value: "nothingmatches" } });
    expect(await screen.findByText("No entry has those words.")).toBeTruthy();
  });
});
