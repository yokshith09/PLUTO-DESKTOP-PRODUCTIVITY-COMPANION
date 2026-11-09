/**
 * Project Spaces (FR-53, owner 2026-11-02): a project's folder on disk and its links to files,
 * folders and web pages. Kept in the preference `projects.spaces` (the shell reads the same
 * shape to know which paths it may open). Pure functions; `useSpaces` stores the result.
 */
import type { TaskRow } from "@/ipc";

export interface SpaceLink { label: string; target: string }
/** The views a project can show (U-7). Overview is always there. */
export type TabId = "overview" | "tasks" | "notes" | "links" | "activity";
export const ALL_TABS: readonly TabId[] = ["overview", "tasks", "notes", "links", "activity"];
export interface Space { name: string; folder: string | null; links: SpaceLink[]; template?: TemplateId; tabs?: TabId[] }

/** Project templates (FR-113, owner 2026-11-02, approved 2026-11-04): a template only chooses which
 *  tabs a project starts with, in which order, and what the links tab is called. Tabs can be changed later. */
export type TemplateId = "developer" | "student" | "research" | "freelance" | "personal";
export const TEMPLATES: Record<TemplateId, { name: string; about: string; tabs: TabId[]; links: string }> = {
  developer: { name: "Developer", about: "Tasks, notes, links and files, and Activity from commits", tabs: ["overview", "tasks", "notes", "links", "activity"], links: "Links & files" },
  student: { name: "Student", about: "Tasks, notes and sources", tabs: ["overview", "tasks", "notes", "links"], links: "Sources" },
  research: { name: "Research", about: "Notes first, then sources and tasks", tabs: ["overview", "notes", "links", "tasks"], links: "Sources" },
  freelance: { name: "Freelance", about: "Tasks, notes and client links", tabs: ["overview", "tasks", "notes", "links"], links: "Client links" },
  personal: { name: "Personal", about: "Just tasks and notes", tabs: ["overview", "tasks", "notes"], links: "Links & files" },
};
export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];
export const isTemplate = (v: unknown): v is TemplateId => typeof v === "string" && v in TEMPLATES;

/** The tabs a space shows: its own choice, else its template's, else all five (projects made before templates). */
export function tabsOf(space: Pick<Space, "template" | "tabs">): TabId[] {
  const own = space.tabs?.length ? space.tabs : space.template ? TEMPLATES[space.template].tabs : [...ALL_TABS];
  return ["overview", ...own.filter((t) => t !== "overview")];
}
/** What the links tab is called here. */
export const linksLabel = (space: Pick<Space, "template">): string => (space.template ? TEMPLATES[space.template].links : "Links & files");
export interface Spaces { projects: Space[] }
export const EMPTY_SPACES: Spaces = { projects: [] };

export type LinkKind = "web" | "file" | "folder";
const WEB = /^(https?:\/\/|mailto:)/i;
/** A web page, or a path on disk (a path with a file extension is a file). */
export const linkKind = (target: string): LinkKind => (WEB.test(target.trim()) ? "web" : /\.[a-z0-9]{1,8}$/i.test(target.trim()) ? "file" : "folder");

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function cleanSpaces(stored: unknown): Spaces {
  const list = stored && typeof stored === "object" ? (stored as { projects?: unknown }).projects : null;
  if (!Array.isArray(list)) return EMPTY_SPACES;
  const seen = new Set<string>();
  const projects: Space[] = [];
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const name = str(o.name).slice(0, 100);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const links = Array.isArray(o.links)
      ? o.links.flatMap((l) => {
          const r = (l ?? {}) as Record<string, unknown>;
          const target = str(r.target);
          return target ? [{ label: str(r.label).slice(0, 100) || shortName(target), target }] : [];
        })
      : [];
    const tabs = Array.isArray(o.tabs) ? ALL_TABS.filter((t) => (o.tabs as unknown[]).includes(t)) : [];
    projects.push({ name, folder: str(o.folder) || null, links, ...(isTemplate(o.template) ? { template: o.template } : {}), ...(tabs.length ? { tabs } : {}) });
  }
  return { projects };
}

/** The last part of a path or the host of a web link: "E:\Projects\pluto" → "pluto". */
export function shortName(target: string): string {
  const t = target.trim();
  if (WEB.test(t)) {
    try { return new URL(t).hostname.replace(/^www\./, "") || t; } catch { return t; }
  }
  return t.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || t;
}

export const spaceOf = (s: Spaces, name: string): Space => s.projects.find((p) => p.name === name) ?? { name, folder: null, links: [] };

function put(s: Spaces, space: Space): Spaces {
  const i = s.projects.findIndex((p) => p.name === space.name);
  const projects = [...s.projects];
  if (i < 0) projects.push(space); else projects[i] = space;
  return { projects };
}

/** Starts a project with a template's tabs. */
export function withTemplate(s: Spaces, name: string, template: TemplateId): Spaces {
  const sp = spaceOf(s, name);
  return put(s, { name: sp.name, folder: sp.folder, links: sp.links, template });
}
/** Shows or hides one tab of a project (Overview cannot be hidden); a tab shown again goes last. */
export function toggleTab(s: Spaces, name: string, tab: TabId): Spaces {
  if (tab === "overview") return s;
  const sp = spaceOf(s, name);
  const now = tabsOf(sp);
  const next = now.includes(tab) ? now.filter((t) => t !== tab) : [...now, tab];
  return put(s, { ...sp, tabs: next });
}

/** Keeps a project that has no tasks or notes yet (before, a new project vanished on restart). */
export const ensure = (s: Spaces, name: string): Spaces => (s.projects.some((p) => p.name === name) ? s : put(s, spaceOf(s, name)));
export const setFolder = (s: Spaces, name: string, folder: string | null): Spaces => put(s, { ...spaceOf(s, name), folder: folder?.trim() || null });
export function addLink(s: Spaces, name: string, target: string, label = ""): Spaces {
  const t = target.trim();
  const sp = spaceOf(s, name);
  if (!t || sp.links.some((l) => l.target === t)) return s;
  return put(s, { ...sp, links: [...sp.links, { label: label.trim() || shortName(t), target: t }] });
}
export const removeLink = (s: Spaces, name: string, target: string): Spaces => put(s, { ...spaceOf(s, name), links: spaceOf(s, name).links.filter((l) => l.target !== target) });
/** A renamed project keeps its folder and links. */
export function renameSpace(s: Spaces, from: string, to: string): Spaces {
  return { projects: s.projects.filter((p) => p.name !== to).map((p) => (p.name === from ? { ...p, name: to } : p)) };
}
/** Forget a project's space (its tasks and notes are untouched). */
export const forget = (s: Spaces, name: string): Spaces => ({ projects: s.projects.filter((p) => p.name !== name) });

/** Paths compare without case or separator differences ("E:\a\" = "e:/a"). */
export const samePath = (a: string, b: string) => a.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() === b.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** Git projects found by the folder watcher that no project uses yet, for "Make a project". */
export function unlinkedRepos(s: Spaces, repos: string[]): string[] {
  return repos.filter((r) => !s.projects.some((p) => p.folder && samePath(p.folder, r)));
}

/** A name for a project made from a folder, made unique against the names in use. */
export function nameFor(folder: string, taken: string[]): string {
  const base = shortName(folder).slice(0, 90) || "Project";
  let name = base;
  for (let i = 2; taken.includes(name); i++) name = `${base} ${i}`;
  return name;
}

export interface ActivityItem { at: number; kind: "committed" | "pushed" | "task-done" | "note" | "chat-done" | "chat-needs" | "chat-permission"; text: string }

/**
 * A project's Activity: commits and pushes in its folder ("Committed" / "Pushed" and the time,
 * owner: no commit messages), tasks finished and notes edited. Newest first, at most `max`.
 */
export function activity(
  folder: string | null,
  events: { repo: string; kind: string; atMs: number }[],
  tasks: TaskRow[],
  notes: { title: string; edited_at: number }[],
  max = 50,
  chats: { assistant: string; folder: string; kind: string; atMs: number }[] = [],
): ActivityItem[] {
  const out: ActivityItem[] = [];
  if (folder) {
    for (const e of events) {
      if (!samePath(e.repo, folder)) continue;
      if (e.kind === "git_commit") out.push({ at: e.atMs, kind: "committed", text: "Committed" });
      if (e.kind === "git_push") out.push({ at: e.atMs, kind: "pushed", text: "Pushed" });
    }
  }
  if (folder) {
    const name = shortName(folder).toLowerCase();
    for (const event of chats) {
      if (event.folder.toLowerCase() !== name) continue;
      if (event.kind === "done") out.push({ at: event.atMs, kind: "chat-done", text: `${event.assistant} finished` });
      if (event.kind === "needs") out.push({ at: event.atMs, kind: "chat-needs", text: `${event.assistant} needed you` });
      if (event.kind === "permission") out.push({ at: event.atMs, kind: "chat-permission", text: `${event.assistant} asked for permission` });
    }
  }
  for (const r of tasks) {
    if (r.task.status === "COMPLETED" && r.task.completed_at) out.push({ at: r.task.completed_at, kind: "task-done", text: `Finished “${r.task.title}”` });
  }
  for (const n of notes) out.push({ at: n.edited_at, kind: "note", text: `Edited the note “${n.title || "Untitled"}”` });
  return out.sort((a, b) => b.at - a.at).slice(0, max);
}
