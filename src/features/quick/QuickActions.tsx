import { useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, FileText, GraduationCap, LayoutGrid, Plus, Rocket, Search, Timer } from "lucide-react";
import { useLaunchSets } from "@/features/launch/useLaunchSets";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAllTasks, useNotes } from "@/hooks/usePluto";
import { useCourseData } from "@/features/student/useStudent";
import { cn } from "@/lib/utils";
import type { Page } from "@/features/shell/Sidebar";
import type { Course, NoteSummary, TaskRow } from "@/ipc";

/**
 * Quick Actions (P5 item 1, MASTER_PLAN): one bar for the common jobs. Opens with Ctrl/⌘+K in
 * Pluto, or the global shortcut (default Ctrl/⌘+Shift+Space) from any app. Every action here is
 * also reachable without it. Launch Buddy sets (P5 item 2) open from here too.
 */

export type QuickAction =
  | { kind: "new-task"; title: string }
  | { kind: "new-note" }
  | { kind: "focus" }
  | { kind: "page"; page: Page }
  | { kind: "task"; id: string; title: string }
  | { kind: "note"; id: string }
  | { kind: "course"; id: string }
  | { kind: "launch"; id: string; name: string };

export interface QuickItem {
  id: string;
  group: "Do" | "Launch" | "Go to" | "Tasks" | "Notes" | "Courses";
  label: string;
  hint?: string;
  action: QuickAction;
}

export const PAGE_NAMES: Record<Page, string> = {
  today: "Today overview", tasks: "Tasks", time: "Time", notes: "Notes", projects: "Projects", study: "Study",
  diary: "Diary", meetings: "Meetings", archive: "Archive", bin: "Bin", character: "Character", mcp: "Assistants", settings: "Settings",
};

const norm = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
/** Every word typed appears somewhere in the text (any order), so "math hw" finds "Maths homework". */
const matches = (text: string, q: string) => q.split(/\s+/).filter(Boolean).every((w) => norm(text).includes(w));

/** The list for what was typed: pure, so it is tested on its own. */
export function quickItems(
  query: string,
  data: { tasks: TaskRow[]; notes: NoteSummary[]; courses: Course[]; pages: readonly Page[]; sets?: { id: string; name: string; items: unknown[] }[] },
  limit = 6,
): QuickItem[] {
  const q = norm(query.trim());
  const typed = query.trim();
  const out: QuickItem[] = [];
  // "Do" first: what you can make from what you typed.
  if (typed) out.push({ id: "new-task", group: "Do", label: `New task: ${typed}`, hint: "Enter", action: { kind: "new-task", title: typed } });
  const doItems: QuickItem[] = [
    { id: "new-note", group: "Do", label: "New note", action: { kind: "new-note" } },
    { id: "focus", group: "Do", label: "Start focus", action: { kind: "focus" } },
  ];
  if (!typed) out.push({ id: "new-task-empty", group: "Do", label: "New task", hint: "type its name", action: { kind: "new-task", title: "" } });
  out.push(...doItems.filter((i) => !q || matches(i.label, q)));
  // Launch Buddy sets (P5 item 2): "Physics" opens everything saved for it.
  out.push(...(data.sets ?? []).filter((s) => s.items.length && (!q || matches(`open launch ${s.name}`, q))).slice(0, limit)
    .map((s): QuickItem => ({ id: `launch:${s.id}`, group: "Launch", label: `Open ${s.name}`, hint: `${s.items.length} ${s.items.length === 1 ? "thing" : "things"}`, action: { kind: "launch", id: s.id, name: s.name } })));
  out.push(...data.pages.filter((p) => !q || matches(PAGE_NAMES[p], q)).slice(0, q ? limit : 4)
    .map((p): QuickItem => ({ id: `page:${p}`, group: "Go to", label: PAGE_NAMES[p], action: { kind: "page", page: p } })));
  if (!q) return out;
  out.push(...data.tasks
    .filter(({ task }) => task.status !== "CANCELLED" && matches(task.title, q))
    .sort((a, b) => Number(a.task.status === "COMPLETED") - Number(b.task.status === "COMPLETED"))
    .slice(0, limit)
    .map(({ task }): QuickItem => ({ id: `task:${task.id}`, group: "Tasks", label: task.title, ...(task.status === "COMPLETED" ? { hint: "done" } : {}), action: { kind: "task", id: task.id, title: task.title } })));
  out.push(...data.notes
    .filter((n) => matches(`${n.title} ${n.excerpt}`, q))
    .slice(0, limit)
    .map((n): QuickItem => ({ id: `note:${n.id}`, group: "Notes", label: n.title || n.excerpt.slice(0, 60) || "Untitled note", action: { kind: "note", id: n.id } })));
  out.push(...data.courses
    .filter((c) => matches(c.name, q))
    .slice(0, limit)
    .map((c): QuickItem => ({ id: `course:${c.id}`, group: "Courses", label: c.name, action: { kind: "course", id: c.id } })));
  return out;
}

const ICON: Record<QuickItem["group"], React.ReactNode> = {
  Do: <Plus />, Launch: <Rocket />, "Go to": <LayoutGrid />, Tasks: <CheckSquare />, Notes: <FileText />, Courses: <GraduationCap />,
};

export function QuickActions({ open, onOpenChange, pages, onRun }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: readonly Page[];
  onRun: (action: QuickAction) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { data: tasks = [] } = useAllTasks();
  const { data: notes = [] } = useNotes(false, null, "last_edited");
  const { courses } = useCourseData();
  const { sets } = useLaunchSets();
  const items = useMemo(() => quickItems(query, { tasks, notes, courses, pages, sets: sets.sets }), [query, tasks, notes, courses, pages, sets]);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => { if (open) { setQuery(""); setActive(0); } }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const run = (item: QuickItem | undefined) => {
    if (!item) return;
    onOpenChange(false);
    onRun(item.action);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(items[active]); }
  };

  let lastGroup = "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden" onKeyDown={onKey}>
        <DialogTitle className="sr-only">Quick Actions</DialogTitle>
        <DialogDescription className="sr-only">Type to add a task, find a task, note or course, or go to a page. Arrow keys to choose, Enter to run.</DialogDescription>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Add a task, or find anything…" aria-label="Quick Actions"
            role="combobox" aria-expanded="true" aria-controls="quick-list" aria-activedescendant={items[active] ? `quick-${items[active].id}` : undefined}
            className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul id="quick-list" ref={list} role="listbox" aria-label="Actions" className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">Nothing found.</li>}
          {items.map((item, i) => {
            const head = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {head && <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-muted-foreground" aria-hidden>{head}</p>}
                <div
                  id={`quick-${item.id}`} role="option" aria-selected={i === active} data-index={i}
                  onMouseMove={() => setActive(i)} onClick={() => run(item)}
                  className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
                    i === active && "bg-accent text-foreground")}
                >
                  {item.action.kind === "focus" ? <Timer /> : ICON[item.group]}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="shrink-0 text-[11px] text-muted-foreground">{item.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">↑ ↓ to choose · Enter to run · Esc to close</p>
      </DialogContent>
    </Dialog>
  );
}
