import { useAllTasks } from "@/hooks/usePluto";
import { useNotes } from "@/hooks/usePluto";
import { useSpaces } from "./useSpaces";

/**
 * Every project name: those made on the Projects page (even with no task or note yet) and those
 * already used on a task or note. One list for every project dropdown (owner 2026-11-19: a project
 * made on the Projects page was missing from the pickers).
 */
export function useProjectNames(): string[] {
  const { data: tasks = [] } = useAllTasks();
  const { data: notes = [] } = useNotes(false, null, "last_edited");
  const { spaces } = useSpaces();
  const all = [...spaces.projects.map((p) => p.name), ...tasks.map((r) => r.task.project), ...notes.map((n) => n.project)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of all) {
    const n = name?.trim();
    if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n); }
  }
  return out.sort((a, b) => a.localeCompare(b));
}
