import { ymd } from "@/lib/dates";

/**
 * Daily routine (FR-85): a checklist that starts fresh every day. Pure functions only; the hook
 * (`useRoutine`) stores the state in preferences under `ui.routine`.
 */
export const MAX_ITEMS = 30;
export const TITLE_MAX = 60;
/** How long a past day is kept (owner 2026-11-04: 365). */
export const HISTORY_DAYS = 365;
/** The longest note on why a routine was skipped (owner 2026-11-09: an optional reason). */
export const REASON_MAX = 60;
export const DEFAULT_REMIND_AT = "18:00";

export interface RoutineItem { id: string; title: string }
export interface RoutineState {
  items: RoutineItem[];
  /** The day `done` belongs to (local YYYY-MM-DD). */
  day: string;
  done: string[];
  /** Past days: day → ids done that day (kept for the weekly count, FR-90). */
  history: Record<string, string[]>;
  /** Past days: day → ids planned that day (the routines that existed when the day ended). Days
   *  before this was recorded have no entry; they show what was done and no ratio. */
  planned: Record<string, string[]>;
  /** Every routine's last title by id, so a past day still names a routine that was renamed or removed. */
  names: Record<string, string>;
  /** Past days: day → routine id → why it was skipped, only when you chose to say. */
  reasons: Record<string, Record<string, string>>;
  remind: { on: boolean; at: string };
  /** The day the pending reminder was last shown, so it fires at most once a day. */
  remindedOn: string | null;
}

export const emptyRoutine = (day: string): RoutineState => ({
  items: [], day, done: [], history: {}, planned: {}, names: {}, reasons: {}, remind: { on: true, at: DEFAULT_REMIND_AT }, remindedOn: null,
});

/** Read whatever is stored; anything broken falls back to an empty routine. */
export function parseRoutine(raw: unknown, today: string): RoutineState {
  if (!raw || typeof raw !== "object") return emptyRoutine(today);
  const r = raw as Partial<RoutineState>;
  const items = Array.isArray(r.items)
    ? r.items.filter((i): i is RoutineItem => !!i && typeof i.id === "string" && typeof i.title === "string").slice(0, MAX_ITEMS)
    : [];
  const at = typeof r.remind?.at === "string" && /^\d{2}:\d{2}$/.test(r.remind.at) ? r.remind.at : DEFAULT_REMIND_AT;
  return rollOver({
    items,
    day: typeof r.day === "string" ? r.day : today,
    done: Array.isArray(r.done) ? r.done.filter((x): x is string => typeof x === "string") : [],
    history: r.history && typeof r.history === "object" ? r.history : {},
    planned: r.planned && typeof r.planned === "object" ? r.planned : {},
    names: r.names && typeof r.names === "object" ? Object.fromEntries(Object.entries(r.names).filter(([, v]) => typeof v === "string")) : {},
    reasons: cleanReasons(r.reasons),
    remind: { on: r.remind?.on !== false, at },
    remindedOn: typeof r.remindedOn === "string" ? r.remindedOn : null,
  }, today);
}

/** Stored reasons with anything that is not day → id → short text dropped. */
function cleanReasons(raw: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [day, byId] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !byId || typeof byId !== "object") continue;
    const kept = Object.fromEntries(Object.entries(byId).flatMap(([id, t]) => (typeof t === "string" && t.trim() ? [[id, t.trim().slice(0, REASON_MAX)]] : [])));
    if (Object.keys(kept).length) out[day] = kept;
  }
  return out;
}

/** Say why a routine was skipped on a past day (empty or null clears it). */
export function setReason(s: RoutineState, day: string, id: string, text: string | null): RoutineState {
  const t = (text ?? "").trim().slice(0, REASON_MAX);
  const others = Object.fromEntries(Object.entries(s.reasons[day] ?? {}).filter(([k]) => k !== id));
  const forDay = t ? { ...others, [id]: t } : others;
  const reasons = Object.fromEntries(Object.entries(s.reasons).filter(([d]) => d !== day));
  return { ...s, reasons: Object.keys(forDay).length ? { ...reasons, [day]: forDay } : reasons };
}

/** A new day: yesterday's ticks and plan move to history (a year of days) and today starts empty. */
export function rollOver(s: RoutineState, today: string): RoutineState {
  if (s.day === today) return s;
  const history = { ...s.history, [s.day]: s.done };
  const planned = { ...s.planned, [s.day]: [...new Set([...s.items.map((i) => i.id), ...s.done])] };
  const keep = Object.keys(history).sort().slice(-HISTORY_DAYS);
  const keepDays = new Set(keep);
  const hist = Object.fromEntries(keep.map((d) => [d, history[d] ?? []]));
  const plan = Object.fromEntries(Object.entries(planned).filter(([d]) => keepDays.has(d)));
  // Names are kept for every routine that is still listed or appears in a kept day.
  const used = new Set([...s.items.map((i) => i.id), ...Object.values(hist).flat(), ...Object.values(plan).flat()]);
  const names = Object.fromEntries(Object.entries({ ...s.names, ...Object.fromEntries(s.items.map((i) => [i.id, i.title])) }).filter(([id]) => used.has(id)));
  const reasons = Object.fromEntries(Object.entries(s.reasons).filter(([d]) => keepDays.has(d)));
  return { ...s, day: today, done: [], history: hist, planned: plan, names, reasons };
}

export const addItem = (s: RoutineState, title: string, id: string): RoutineState => {
  const t = title.trim().slice(0, TITLE_MAX);
  if (!t || s.items.length >= MAX_ITEMS) return s;
  return { ...s, items: [...s.items, { id, title: t }], names: { ...s.names, [id]: t } };
};
export const renameItem = (s: RoutineState, id: string, title: string): RoutineState => {
  const t = title.trim().slice(0, TITLE_MAX);
  return t ? { ...s, items: s.items.map((i) => (i.id === id ? { ...i, title: t } : i)), names: { ...s.names, [id]: t } } : s;
};
export const removeItem = (s: RoutineState, id: string): RoutineState =>
  ({ ...s, items: s.items.filter((i) => i.id !== id), done: s.done.filter((d) => d !== id) });
export const toggle = (s: RoutineState, id: string): RoutineState =>
  ({ ...s, done: s.done.includes(id) ? s.done.filter((d) => d !== id) : [...s.done, id] });

/** Items not ticked today. */
export const pending = (s: RoutineState): RoutineItem[] => s.items.filter((i) => !s.done.includes(i.id));

/**
 * On how many of the last 7 days (today included) this item was done (FR-90, no-guilt rule):
 * a missed day never wipes the count the way a streak would.
 */
export function weekCount(s: RoutineState, id: string, today: string): number {
  let n = s.done.includes(id) ? 1 : 0;
  const d = new Date(`${today}T12:00:00`);
  for (let i = 1; i < 7; i++) {
    d.setDate(d.getDate() - 1);
    if (s.history[ymd(d)]?.includes(id)) n += 1;
  }
  return n;
}

/** The reminder text, or null when there is nothing to say. */
export function pendingMessage(s: RoutineState): string | null {
  const n = pending(s).length;
  if (n === 0) return null;
  return `You have ${n} daily routine ${n === 1 ? "task" : "tasks"} pending`;
}

/** Should the reminder fire now? Only when on, past the time, something pending, and not yet today. */
export function shouldRemind(s: RoutineState, now: Date, today: string): boolean {
  if (!s.remind.on || s.remindedOn === today || pending(s).length === 0) return false;
  const [h, m] = s.remind.at.split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() >= (h ?? 18) * 60 + (m ?? 0);
}

/** Milliseconds until today's reminder time (0 if it has passed). */
export function msUntil(at: string, now: Date): number {
  const [h, m] = at.split(":").map(Number);
  const t = new Date(now);
  t.setHours(h ?? 18, m ?? 0, 0, 0);
  return Math.max(0, t.getTime() - now.getTime());
}
