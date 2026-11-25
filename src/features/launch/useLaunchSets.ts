import { useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage, ipc } from "@/ipc";
import { notify } from "@/lib/notify";
import { cleanSets, EMPTY, LAUNCH_PREF, type LaunchSet, type LaunchSets } from "./sets";

const KEY = ["prefs", LAUNCH_PREF] as const;

/** The saved launch sets (`launch.sets`). */
export function useLaunchSets() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => cleanSets(await ipc.prefsGet(LAUNCH_PREF)) });
  const save = async (next: LaunchSets) => {
    qc.setQueryData(KEY, next);
    await ipc.prefsSet(LAUNCH_PREF, next);
  };
  return { sets: data ?? EMPTY, save };
}

/** One sentence about what happened, naming anything that didn't open. */
export function reportText(name: string, r: { opened: string[]; shown: string[]; missing: string[]; failed: string[] }): { ok: boolean; text: string; detail?: string } {
  const parts: string[] = [];
  if (r.missing.length) parts.push(`Not found: ${r.missing.join(", ")}. It may have been moved or renamed.`);
  if (r.shown.length) parts.push(`Shown in its folder (Pluto doesn't run scripts): ${r.shown.join(", ")}.`);
  if (r.failed.length) parts.push(`Couldn't open: ${r.failed.join(", ")}.`);
  const n = r.opened.length;
  const text = n ? `Opened ${n} ${n === 1 ? "thing" : "things"} from ${name}` : `Nothing from ${name} opened`;
  return { ok: !r.missing.length && !r.failed.length && n > 0, text, ...(parts.length ? { detail: parts.join(" ") } : {}) };
}

/** Run a set: the shell opens what was saved; then a focus session if the set asks for one. */
export async function runSet(set: Pick<LaunchSet, "id" | "name">) {
  try {
    const report = await ipc.launchSetRun(set.id);
    const msg = reportText(set.name, report);
    (msg.ok ? notify.success : notify.warning)(msg.text, msg.detail ? { description: msg.detail } : undefined);
    if (report.focus_minutes) {
      await ipc.focusStart({ kind: "FOCUS", minutes: report.focus_minutes });
      notify.info(`Focus started: ${report.focus_minutes} minutes`);
    }
  } catch (error) {
    notify.error(errorMessage(error));
  }
}
