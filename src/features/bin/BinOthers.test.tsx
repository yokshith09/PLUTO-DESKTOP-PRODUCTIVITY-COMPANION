import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/ipc";
import { BinOthers } from "./BinOthers";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Bin: reminders and meetings", () => {
  it("lists deleted reminders and meetings and restores them", async () => {
    vi.spyOn(ipc, "remindersBinned").mockResolvedValue([{ id: "r1", title: "Pay rent", remind_at: 0, note_id: null, fired_at: null, done_at: null, created_at: 0, starred: false, task_id: null, lead_min: 0, sound: true }]);
    vi.spyOn(ipc, "meetingsBinned").mockResolvedValue([{ id: "m1", title: "Retro", starts_at: 0 }]);
    const restore = vi.spyOn(ipc, "reminderRestore").mockResolvedValue(null as never);
    const meeting = vi.spyOn(ipc, "meetingRestore").mockResolvedValue(null);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BinOthers /></QueryClientProvider>);
    const reminders = await screen.findByRole("region", { name: "Reminders in the Bin" });
    fireEvent.click(within(reminders).getByRole("button", { name: "Restore “Pay rent”" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith("r1"));
    fireEvent.click(within(screen.getByRole("region", { name: "Meetings in the Bin" })).getByRole("button", { name: "Restore “Retro”" }));
    await waitFor(() => expect(meeting).toHaveBeenCalledWith("m1"));
  });

  it("shows nothing when both are empty", async () => {
    vi.spyOn(ipc, "remindersBinned").mockResolvedValue([]);
    vi.spyOn(ipc, "meetingsBinned").mockResolvedValue([]);
    const { container } = render(<QueryClientProvider client={new QueryClient()}><BinOthers /></QueryClientProvider>);
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
