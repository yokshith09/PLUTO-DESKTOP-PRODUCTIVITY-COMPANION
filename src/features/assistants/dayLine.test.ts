import { describe, expect, it } from "vitest";
import { ymd } from "@/lib/dates";
import { dayLine } from "./dayLine";

const today = new Date(2026, 10, 9, 12).getTime();
const yesterday = new Date(2026, 10, 8, 12).getTime();
const event = (kind: string, folder = "DESKTOP-PET", atMs = today) => ({ assistant: "Claude Code", folder, kind, atMs });

describe("dayLine", () => {
  const date = ymd(new Date(today));

  it("uses singular chat wording for one finished chat", () => {
    expect(dayLine([event("done")], date)).toBe("Today with assistants: 1 chat finished. Most in DESKTOP-PET.");
  });

  it("counts finished chats and permission requests, with a clear busiest folder", () => {
    expect(dayLine([event("done"), event("done"), event("done", "OTHER"), event("permission")], date)).toBe(
      "Today with assistants: 3 chats finished, 1 asked for permission. Most in DESKTOP-PET.",
    );
  });

  it("leaves out Most in when finished chats tie", () => {
    expect(dayLine([event("done", "ONE"), event("done", "TWO")], date)).toBe("Today with assistants: 2 chats finished.");
  });

  it("says only what is known when there are permission requests but no finished chats", () => {
    expect(dayLine([event("permission"), event("permission", "OTHER")], date)).toBe("Today with assistants: 2 asked for permission.");
  });

  it("says nothing for no countable events", () => {
    expect(dayLine([event("needs")], date)).toBeNull();
  });

  it("ignores events from other local days", () => {
    expect(dayLine([event("done", "DESKTOP-PET", yesterday), event("permission", "DESKTOP-PET", yesterday)], date)).toBeNull();
  });
});
