/**
 * Project Spaces (FR-53, owner 2026-11-02): a project's folder on disk and its links to files,
 * folders and web pages. Kept in the preference `projects.spaces` (the shell reads the same
 * shape to know which paths it may open). Pure functions; `useSpaces` stores the result.
 */
import type { TaskRow } from "@/ipc";

export interface SpaceLink { label: string; target: string }
export interface Space { name: string; folder: string | null; links: SpaceLink[] }
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
    projects.push({ name, folder: str(o.folder) || null, links });
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

export interface ActivityItem { at: number; kind: "committed" | "pushed" | "task-done" | "note"; text: string }

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
): ActivityItem[] {
  const out: ActivityItem[] = [];
  if (folder) {
    for (const e of events) {
      if (!samePath(e.repo, folder)) continue;
      if (e.kind === "git_commit") out.push({ at: e.atMs, kind: "committed", text: "Committed" });
      if (e.kind === "git_push") out.push({ at: e.atMs, kind: "pushed", text: "Pushed" });
    }
  }
  for (const r of tasks) {
    if (r.task.status === "COMPLETED" && r.task.completed_at) out.push({ at: r.task.completed_at, kind: "task-done", text: `Finished “${r.task.title}”` });
  }
  for (const n of notes) out.push({ at: n.edited_at, kind: "note", text: `Edited the note “${n.title || "Untitled"}”` });
  return out.sort((a, b) => b.at - a.at).slice(0, max);
}
