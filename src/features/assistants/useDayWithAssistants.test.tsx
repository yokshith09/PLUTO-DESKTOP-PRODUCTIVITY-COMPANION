import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/ipc";

const tryNudge = vi.hoisted(() => vi.fn());
vi.mock("@/features/companion/useCompanion", () => ({ tryNudge }));

import { useDayWithAssistants } from "./useDayWithAssistants";

function Harness() { useDayWithAssistants(); return null; }

const event = (kind: string, atMs = new Date(2026, 10, 9, 18).getTime()) => ({ assistant: "Claude Code", folder: "DESKTOP-PET", kind, atMs });

describe("day with assistants", () => {
  let saved: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 9, 18));
    saved = {};
    vi.spyOn(api.ipc, "prefsGet").mockImplementation(async (key: string) => (saved[key] ?? null) as never);
    vi.spyOn(api.ipc, "prefsSet").mockImplementation(async (key, value) => { saved[key] = value; return null as never; });
    vi.spyOn(api.ipc, "devChatEvents").mockResolvedValue([event("done"), event("permission")] as never);
    tryNudge.mockImplementation(async (_kind, _now, show) => { await show(); return true; });
  });

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); tryNudge.mockReset(); });

  it("shows once inside the evening window and remembers the day only after showing", async () => {
    const say = vi.spyOn(api, "petSay").mockResolvedValue(undefined as never);
    render(<Harness />);
    await vi.advanceTimersByTimeAsync(0);
    expect(say).toHaveBeenCalledWith({ text: "Today with assistants: 1 chat finished, 1 asked for permission. Most in DESKTOP-PET.", pose: "wave", ms: 10_000 });
    expect(saved["ui.day_with_assistants"]).toBe("2026-11-09");
    window.dispatchEvent(new Event("pluto-wake"));
    await vi.advanceTimersByTimeAsync(0);
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("waits until 17:30, and does not show after 21:30", async () => {
    vi.setSystemTime(new Date(2026, 10, 9, 17));
    const say = vi.spyOn(api, "petSay").mockResolvedValue(undefined as never);
    const first = render(<Harness />);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(say).toHaveBeenCalledTimes(1);
    first.unmount();

    vi.setSystemTime(new Date(2026, 10, 9, 21, 31));
    saved = {};
    render(<Harness />);
    await vi.advanceTimersByTimeAsync(0);
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("does not remember the day when the notification budget refuses", async () => {
    tryNudge.mockResolvedValue(false);
    const say = vi.spyOn(api, "petSay").mockResolvedValue(undefined as never);
    render(<Harness />);
    await vi.advanceTimersByTimeAsync(0);
    expect(tryNudge).toHaveBeenCalledTimes(1);
    expect(say).not.toHaveBeenCalled();
    expect(saved["ui.day_with_assistants"]).toBeUndefined();
  });
});
