import { useEffect } from "react";
import { ipc, onWake, petSay } from "@/ipc";
import { tryNudge } from "@/features/companion/useCompanion";
import { ymd } from "@/lib/dates";
import { dayLine } from "./dayLine";

const PREF = "ui.day_with_assistants";
const START = 17 * 60 + 30;
const END = 21 * 60 + 30;

const minutes = (now: Date) => now.getHours() * 60 + now.getMinutes();
const inWindow = (now: Date) => minutes(now) >= START && minutes(now) <= END;

/** Milliseconds to the next local 17:30, for the one daily timer (A-5). */
function untilEvening(now: Date): number {
  const at = new Date(now);
  at.setHours(17, 30, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at.getTime() - now.getTime();
}

/** A once-a-day evening thank-you for the assistant chats Pluto knows about. */
export function useDayWithAssistants() {
  useEffect(() => {
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const now = new Date();
        const today = ymd(now);
        if (!inWindow(now) || await ipc.prefsGet<string>(PREF) === today) return;
        const text = dayLine(await ipc.devChatEvents(), today);
        if (!text) return;
        const shown = await tryNudge("with-assistants", now, () => petSay({ text, pose: "wave", ms: 10_000 }));
        if (shown) await ipc.prefsSet(PREF, today);
      } finally {
        checking = false;
      }
    };
    void check();
    // One timer to the next 17:30, re-armed each time it fires, so a Pluto left running for days still checks every evening.
    let timer = 0;
    const arm = () => {
      timer = window.setTimeout(() => { void check(); arm(); }, untilEvening(new Date()));
    };
    arm();
    const offWake = onWake(() => void check());
    return () => { window.clearTimeout(timer); offWake(); };
  }, []);
}
