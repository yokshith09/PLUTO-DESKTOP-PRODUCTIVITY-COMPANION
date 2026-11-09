// What the person lets each assistant do (owner 2026-11-09): tools and pet reactions can be switched
// off per assistant, inside that assistant's Edit setup. Stored as lists of what is OFF in the
// `mcp.perms` preference, keyed by the assistant tile id, so everything starts on. The Rust side
// (`crates/pluto-core/src/mcp/perms.rs`) enforces it; a test keeps TOOLS equal to its list.

export type Perms = Record<string, { tools?: string[]; reactions?: string[] }>;

export const TOOLS = [
  { name: "status", label: "See what Pluto is doing", changes: false },
  { name: "today", label: "Read today's plan", changes: false },
  { name: "tasks_list", label: "Read your tasks", changes: false },
  { name: "task_get", label: "Read one task", changes: false },
  { name: "notes_search", label: "Search your notes", changes: false },
  { name: "note_get", label: "Read one note", changes: false },
  { name: "reminders_list", label: "Read reminders", changes: false },
  { name: "meetings_list", label: "Read meetings", changes: false },
  { name: "react", label: "Make the pet react", changes: false },
  { name: "say", label: "Show a short bubble on the pet", changes: false },
  { name: "ask_person", label: "Ask you a question on the pet", changes: false },
  { name: "task_add", label: "Add a task", changes: true },
  { name: "task_update", label: "Change a task", changes: true },
  { name: "task_complete", label: "Mark a task done", changes: true },
  { name: "reminder_add", label: "Add a reminder", changes: true },
  { name: "reminder_delete", label: "Move a reminder to the Bin", changes: true },
  { name: "meeting_delete", label: "Move a meeting to the Bin", changes: true },
  { name: "note_add", label: "Add a note", changes: true },
  { name: "note_append", label: "Add to a note", changes: true },
  { name: "setting_change", label: "Change a setting (you press Allow)", changes: true },
] as const;

export const REACTIONS = [
  { key: "needs", label: "Needs you or asks permission", text: "A bubble and a place on the waiting list." },
  { key: "done", label: "Done", text: "A bubble when a chat finishes." },
  { key: "away", label: "Welcome-back note", text: "Tells you once, when you are back, what finished while you were away." },
  { key: "long_run", label: "Says when a chat runs long", text: "A notice at 25 and at 60 minutes." },
  { key: "click", label: "Click goes to its window", text: "Press the bubble to bring that chat forward." },
] as const;

/** Which reactions each assistant can actually send today (the rest have no hook Pluto can use). */
export const REACT_KEYS: Record<string, readonly string[]> = {
  claude: ["needs", "done", "away", "long_run", "click"],
  codex: ["needs", "done", "away", "click"],
  cursor: ["needs", "done", "away", "click"],
  opencode: ["needs", "done", "away", "click"],
};

export function parsePerms(raw: unknown): Perms {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Perms = {};
  for (const [who, v] of Object.entries(raw)) {
    if (typeof v !== "object" || v === null) continue;
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : []);
    const { tools, reactions } = v as { tools?: unknown; reactions?: unknown };
    out[who] = { tools: list(tools), reactions: list(reactions) };
  }
  return out;
}

export const isOn = (p: Perms, who: string, kind: "tools" | "reactions", name: string) => !(p[who]?.[kind] ?? []).includes(name);

export function setOn(p: Perms, who: string, kind: "tools" | "reactions", name: string, on: boolean): Perms {
  const now = new Set(p[who]?.[kind] ?? []);
  if (on) now.delete(name); else now.add(name);
  return { ...p, [who]: { tools: p[who]?.tools ?? [], reactions: p[who]?.reactions ?? [], [kind]: [...now] } };
}

/** "12 tools on" for the tile. */
export function summary(p: Perms, who: string, reacts: number): string {
  const toolsOn = TOOLS.filter((t) => isOn(p, who, "tools", t.name)).length;
  const reactsOn = (REACT_KEYS[who] ?? []).filter((k) => isOn(p, who, "reactions", k)).length;
  return reacts > 0 ? `${toolsOn} of ${TOOLS.length} tools · ${reactsOn} of ${reacts} pet reactions` : `${toolsOn} of ${TOOLS.length} tools`;
}
