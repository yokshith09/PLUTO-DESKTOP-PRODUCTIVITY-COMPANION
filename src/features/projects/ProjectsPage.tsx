import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, FolderGit2, FolderKanban, FolderOpen, Link2, MoreHorizontal, Pencil, Plus, Search, Timer, Trash2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader, Tile } from "@/features/shell/PageHeader";
import { NoteEditor } from "@/features/notes/NoteEditor";
import { TaskDetail } from "@/features/tasks/TaskDetail";
import { Row } from "@/features/tasks/TasksPage";
import { toEdit } from "@/features/tasks/edit";
import { useAllTasks, useNotes, useTaskActions } from "@/hooks/usePluto";
import { useFocus, useFocusLength } from "@/hooks/useFocus";
import { ymd } from "@/lib/dates";
import { STATUS_LABEL } from "@/lib/taskStatus";
import { errorMessage, ipc, type GitEvent, type NoteSummary, type TaskRow } from "@/ipc";
import { notify } from "@/lib/notify";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { planRename, summarize } from "./summary";
import { activity, ensure, forget, linkKind, nameFor, renameSpace, samePath, setFolder, shortName, spaceOf, unlinkedRepos, type Space, type Spaces } from "./spaces";
import { ActivityPanel, LinksPanel, openPath } from "./SpaceParts";
import { useSpaces } from "./useSpaces";

interface Project { name: string; tasks: TaskRow[]; notes: NoteSummary[]; open: number }

/** Projects from the names used on tasks and notes; one being started has no items yet. */
export function projectsFrom(tasks: TaskRow[], notes: NoteSummary[], extra: string[] = []): Project[] {
  const names = new Set<string>(extra);
  for (const r of tasks) if (r.task.project && !r.task.source_action_item_id) names.add(r.task.project);
  for (const n of notes) if (n.project) names.add(n.project);
  return [...names].sort((a, b) => a.localeCompare(b)).map((name) => {
    const ts = tasks.filter((r) => r.task.project === name && !r.task.source_action_item_id);
    return { name, tasks: ts, notes: notes.filter((n) => n.project === name), open: ts.filter((r) => r.task.status !== "COMPLETED" && r.task.status !== "CANCELLED").length };
  });
}

/** Open first, then finished; each group in the order they were added. */
const ordered = (rows: TaskRow[]) => {
  const done = (r: TaskRow) => r.task.status === "COMPLETED" || r.task.status === "CANCELLED";
  return [...rows].sort((a, b) => Number(done(a)) - Number(done(b)) || a.task.created_at - b.task.created_at);
};
const isDone = (r: TaskRow) => r.task.status === "COMPLETED" || r.task.status === "CANCELLED";
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
const lastPush = (folder: string | null, events: GitEvent[]) => (folder ? events.find((e) => e.kind === "git_push" && samePath(e.repo, folder)) ?? null : null);

type Tab = "overview" | "tasks" | "notes" | "links" | "activity";

/** Projects (owner 2026-11-02, preview v2): cards to pick a project, then its own space. */
export function ProjectsPage() {
  const qc = useQueryClient();
  const { data: tasks = [] } = useAllTasks();
  const { data: notes = [] } = useNotes(false, null, "last_edited");
  const { spaces, save } = useSpaces();
  const { data: watch } = useQuery({ queryKey: ["dev", "git"], queryFn: ipc.devGitWatch });
  const { data: events = [] } = useQuery({ queryKey: ["dev", "events"], queryFn: ipc.devGitEvents, refetchInterval: 15_000 });
  const names = useMemo(() => spaces.projects.map((p) => p.name), [spaces]);
  const projects = useMemo(() => projectsFrom(tasks, notes, names), [tasks, notes, names]);
  const found = unlinkedRepos(spaces, watch?.repos ?? []);
  const [chosen, setChosen] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const current = projects.find((p) => p.name === chosen) ?? null;

  const open = (name: string) => { setChosen(name); setTab("overview"); };
  const start = () => {
    const name = newName.trim().slice(0, 100);
    if (!name) return;
    void save(ensure(spaces, name));
    setNewName("");
    setAdding(false);
    open(name);
  };
  const makeFrom = (folder: string) => {
    const name = nameFor(folder, projects.map((p) => p.name));
    void save(setFolder(ensure(spaces, name), name, folder)).then(() => notify.success(`Made the project “${name}”`, { description: "Rename it any time from ⋯." }));
    open(name);
  };
  const pickAndMake = () => void ipc.projectPathPick("folder").then((f) => f && makeFrom(f)).catch((e: unknown) => notify.error(errorMessage(e)));

  /** Changes the name on every task and note in the project, and moves its folder and links. */
  const rename = async (from: string, to: string) => {
    const plan = planRename(tasks, notes, from, to);
    if (!plan.ok) return;
    const name = to.trim().slice(0, 100);
    try {
      for (const id of plan.taskIds) {
        const row = tasks.find((r) => r.task.id === id);
        if (row) await ipc.taskUpdate(id, { ...toEdit(row.task), project: name });
      }
      for (const id of plan.noteIds) await ipc.noteUpdate(id, { project: name });
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      await qc.invalidateQueries({ queryKey: ["notes"] });
      await save(renameSpace(spaces, from, name));
      setChosen(name);
      notify.success(`Renamed to “${name}”`);
    } catch (e) {
      notify.error(errorMessage(e));
    }
  };

  const list = projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      {current ? (
        <ProjectSpace
          project={current} space={spaceOf(spaces, current.name)} spaces={spaces} save={save} events={events}
          tab={tab} setTab={setTab} onBack={() => setChosen(null)} onRename={(to) => void rename(current.name, to)}
          onRemoved={() => setChosen(null)} onOpenTask={setOpenTask} onOpenNote={setOpenNote}
        />
      ) : (
        <>
          <PageHeader
            title="Projects"
            description="A project’s tasks, notes, folder and links in one place."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" aria-label="Search projects" className="h-9 w-56 pl-8" />
                </label>
                {adding ? (
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(); }}>
                    <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAdding(false)} placeholder="Project name" aria-label="New project name" maxLength={100} className="h-9 w-48" />
                    <Button type="submit" disabled={!newName.trim()}>Create</Button>
                  </form>
                ) : (
                  <Button onClick={() => setAdding(true)}><Plus />New project</Button>
                )}
              </div>
            }
          />
          {projects.length === 0 ? (
            <div className="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center">
              <div>
                <span className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground"><FolderKanban className="size-5" /></span>
                <p className="text-sm font-medium">No projects yet</p>
                <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">A project keeps its tasks, notes, folder and links together. Start one by name, or from a folder on your computer.</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button onClick={() => setAdding(true)}><Plus />New project</Button>
                  <Button variant="outline" onClick={pickAndMake}><FolderOpen />Make one from a folder</Button>
                </div>
              </div>
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-xl border bg-card px-6 py-12 text-center">
              <p className="text-sm font-medium">No projects match “{query}”</p>
              <Button className="mt-3" variant="outline" onClick={() => setQuery("")}>Clear search</Button>
            </div>
          ) : (
            <ul aria-label="Projects" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
              {list.map((p) => <ProjectCard key={p.name} p={p} space={spaceOf(spaces, p.name)} events={events} onOpen={() => open(p.name)} />)}
            </ul>
          )}
          {found.length > 0 && (
            <section aria-label="Found in your folders" className="space-y-3 rounded-xl border border-dashed p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-[13px] font-semibold">Found in your folders</h2>
                <p className="text-[12px] text-muted-foreground">Git projects that are not a project in Pluto yet</p>
              </div>
              <ul className="space-y-2">
                {found.slice(0, 12).map((r) => (
                  <li key={r} className="flex items-center gap-3">
                    <FolderGit2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted-foreground" title={r}>{r}</span>
                    <Button size="sm" variant="outline" aria-label={`Make ${shortName(r)} a project`} onClick={() => makeFrom(r)}>Make a project</Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <TaskDetail taskId={openTask} onClose={() => setOpenTask(null)} />
      <NoteEditor noteId={openNote} onClose={() => setOpenNote(null)} />
    </div>
  );
}

/** One project on the Projects page: the same parts in the same place on every card. */
function ProjectCard({ p, space, events, onOpen }: { p: Project; space: Space; events: GitEvent[]; onOpen: () => void }) {
  const today = ymd(new Date());
  const s = summarize(p.tasks, today);
  const last = activity(space.folder, events, p.tasks, p.notes.map((n) => ({ title: n.title, edited_at: n.edited_at })), 1)[0];
  const links = space.links.length;
  return (
    <li>
      <button type="button" onClick={onOpen} aria-label={`Open project ${p.name}`}
        className="grid h-full min-h-44 w-full grid-rows-[auto_auto_1fr_auto] gap-3 rounded-xl border bg-card p-4 text-left outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{p.name}</span>
          {s.overdue > 0
            ? <span className="shrink-0 rounded-md bg-destructive/15 px-2 py-0.5 text-[11.5px] font-medium text-destructive">{s.overdue} overdue</span>
            : <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11.5px] tabular-nums text-muted-foreground">{s.open} open</span>}
        </span>
        <span className="block h-1 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: `${s.percent}%` }} /></span>
        <span className="text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="line-clamp-1">{s.next ? `Next: ${s.next.task.title}` : s.total ? "All done" : "No tasks yet"}</span>
          <span className="block">{p.notes.length} {p.notes.length === 1 ? "note" : "notes"}{links ? ` · ${links} ${links === 1 ? "link" : "links"}` : ""}</span>
        </span>
        <span className="flex items-center justify-between gap-2 border-t pt-3 text-[12px] text-muted-foreground">
          {space.folder
            ? <span className="min-w-0 truncate rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary" title={space.folder}>{space.folder}</span>
            : <span>No folder</span>}
          <span className="shrink-0">{last ? `${last.text.split(" “")[0]} ${timeAgo(last.at)}` : ""}</span>
        </span>
      </button>
    </li>
  );
}

function Stat({ value, label, warn = false }: { value: string; label: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className={cn("text-lg font-semibold tabular-nums", warn && "text-destructive")}>{value}</p>
      <p className="text-[12px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** A project's own screen: header, four numbers, tabs (owner-approved preview v2). */
function ProjectSpace({ project, space, spaces, save, events, tab, setTab, onBack, onRename, onRemoved, onOpenTask, onOpenNote }: {
  project: Project; space: Space; spaces: Spaces; save: (s: Spaces) => Promise<void>; events: GitEvent[];
  tab: Tab; setTab: (t: Tab) => void; onBack: () => void; onRename: (to: string) => void; onRemoved: () => void;
  onOpenTask: (id: string) => void; onOpenNote: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { quickAdd, update } = useTaskActions();
  const focus = useFocus();
  const { minutes } = useFocusLength();
  const today = ymd(new Date());
  const stats = summarize(project.tasks, today);
  const sorted = ordered(project.tasks);
  const openRows = sorted.filter((r) => !isDone(r));
  const doneRows = sorted.filter(isDone);
  const pushed = lastPush(space.folder, events);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const pickFolder = async () => {
    try {
      const path = await ipc.projectPathPick("folder");
      if (path) {
        await save(setFolder(spaces, project.name, path));
        notify.success(`Linked ${shortName(path)}`, { description: "Commits and pushes there now show in Activity." });
      }
    } catch (e) { notify.error(errorMessage(e)); }
  };
  const addTask = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    try {
      const t = await quickAdd(title);
      await update(t.id, { ...toEdit(t), project: project.name });
    } catch (e) { notify.error(errorMessage(e)); }
  };
  const addNote = async () => {
    try {
      const n = await ipc.noteCreate({ project: project.name });
      await qc.invalidateQueries({ queryKey: ["notes"] });
      onOpenNote(n.id);
    } catch (e) { notify.error(errorMessage(e)); }
  };
  const composer = (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void addTask(); }}>
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add a task to ${project.name}`} aria-label="New project task" maxLength={300} />
      <Button type="submit" variant="secondary" size="icon" aria-label="Add project task" disabled={!draft.trim()}><Plus /></Button>
    </form>
  );
  const seeAll = (to: Tab) => <Button size="sm" variant="ghost" className="h-7 text-[12px] text-muted-foreground" onClick={() => setTab(to)}>See all<ChevronRight className="size-3.5" /></Button>;
  const TABS: [Tab, string, number | null][] = [["overview", "Overview", null], ["tasks", "Tasks", project.open], ["notes", "Notes", project.notes.length], ["links", "Links & files", space.links.length], ["activity", "Activity", null]];

  return (
    <section aria-label={`Project ${project.name}`} className="space-y-6">
      <header className="space-y-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1 rounded text-[12.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="size-3.5" />All projects</button>
        <div className="flex flex-wrap items-center gap-3">
          {renaming !== null ? (
            <form onSubmit={(e) => { e.preventDefault(); onRename(renaming); setRenaming(null); }}>
              <Input autoFocus value={renaming} maxLength={100} aria-label="Project name" onChange={(e) => setRenaming(e.target.value)}
                onBlur={() => { onRename(renaming); setRenaming(null); }} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} className="h-9 w-64 text-lg font-semibold" />
            </form>
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          )}
          {space.folder
            ? <span className="min-w-0 max-w-full truncate rounded-md bg-primary/10 px-2 py-1 font-mono text-[11.5px] text-primary" title={space.folder}>{space.folder}</span>
            : <Button size="sm" variant="outline" onClick={() => void pickFolder()}><Link2 className="size-3.5" />Link a folder</Button>}
          <span className="flex-1" />
          {space.folder && <Button size="sm" variant="outline" onClick={() => void openPath(space.folder as string)}><FolderOpen className="size-3.5" />Open folder</Button>}
          <Button size="sm" variant="ghost" aria-label={`Rename ${project.name}`} onClick={() => setRenaming(project.name)}><Pencil className="size-3.5" />Rename</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`More for ${project.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="[&_svg]:size-3.5" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuItem onSelect={() => void pickFolder()}><FolderOpen />{space.folder ? "Change folder" : "Link a folder"}</DropdownMenuItem>
              {space.folder && <DropdownMenuItem onSelect={() => void save(setFolder(spaces, project.name, null)).then(() => notify.success("Folder unlinked", { description: "Nothing on disk was changed." }))}><Unlink />Unlink folder</DropdownMenuItem>}
              {project.tasks.length === 0 && project.notes.length === 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void save(forget(spaces, project.name)).then(onRemoved)} className="text-destructive"><Trash2 />Remove project</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div aria-label="Project summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat value={`${stats.open}`} label="open tasks" />
        <Stat value={`${stats.overdue}`} label="overdue" warn={stats.overdue > 0} />
        <Stat value={`${stats.percent}%`} label={`done (${stats.done} of ${stats.total})`} />
        <Stat value={pushed ? timeAgo(pushed.atMs).replace(/ ago$/, "") : "—"} label={pushed ? "since last push" : space.folder ? "no push seen yet" : "no folder linked"} />
      </div>

      <div role="tablist" aria-label="Project views" className="flex gap-1 overflow-x-auto border-b">
        {TABS.map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === id ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {label}{n ? <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">{n}</span> : null}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="grid gap-4">
            {stats.next && (
              <section aria-label="Next up" className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/[0.08] p-4">
                <div className="min-w-48 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Next up</p>
                  <p className="mt-0.5 text-[15px] font-semibold">{stats.next.task.title}</p>
                  <p className="text-[12px] text-muted-foreground">{[STATUS_LABEL[stats.next.task.status], stats.next.task.due_date && `due ${shortDate(stats.next.task.due_date)}`].filter(Boolean).join(" · ")}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onOpenTask((stats.next as TaskRow).task.id)}>Open</Button>
                {!focus.session && <Button size="sm" onClick={() => void focus.start("FOCUS", minutes, (stats.next as TaskRow).task.id)}><Timer />Focus {minutes} min</Button>}
              </section>
            )}
            <Tile title="Open tasks" count={openRows.length} action={seeAll("tasks")} footer={composer}>
              {openRows.length === 0
                ? <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">{project.tasks.length ? "Everything is done." : "No tasks yet. Add the first one below."}</p>
                : <ul aria-label="Open tasks">{openRows.slice(0, 6).map((r, i) => <Row key={r.task.id} row={r} onOpen={onOpenTask} n={i + 1} inProject />)}</ul>}
            </Tile>
          </div>
          <div className="grid gap-4">
            <Tile title="Links & files" count={space.links.length} action={space.links.length ? seeAll("links") : <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => setTab("links")}><Plus className="size-3.5" />Add</Button>}>
              {space.links.length === 0
                ? <p className="px-2 py-4 text-[12.5px] text-muted-foreground">The repo, design file or docs you open every day.</p>
                : <ul>{space.links.slice(0, 4).map((l) => (
                    <li key={l.target}>
                      <button type="button" onClick={() => (linkKind(l.target) === "web" ? void ipc.openUrl(l.target) : void openPath(l.target))} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="min-w-0 flex-1"><span className="block truncate text-[13px]">{l.label}</span><span className="block truncate font-mono text-[11px] text-muted-foreground">{l.target}</span></span>
                        <span className="shrink-0 rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{{ web: "Web", file: "File", folder: "Folder" }[linkKind(l.target)]}</span>
                      </button>
                    </li>))}
                  </ul>}
            </Tile>
            <Tile title="Recent activity" action={seeAll("activity")}>
              <RecentActivity space={space} project={project} events={events} />
            </Tile>
            <Tile title="Notes" count={project.notes.length} action={project.notes.length ? seeAll("notes") : <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => void addNote()}><Plus className="size-3.5" />Note</Button>}>
              {project.notes.length === 0
                ? <p className="px-2 py-4 text-[12.5px] text-muted-foreground">No notes yet.</p>
                : <NoteList notes={project.notes.slice(0, 3)} onOpen={onOpenNote} />}
            </Tile>
          </div>
        </div>
      )}

      {tab === "tasks" && (
        <Tile title="Tasks" count={`${stats.open} open · ${stats.done} done`} footer={composer}>
          {project.tasks.length === 0 ? (
            <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">No tasks yet. Add the first one below.</p>
          ) : (
            <>
              <ul aria-label="Tasks">{openRows.map((r, i) => <Row key={r.task.id} row={r} onOpen={onOpenTask} n={i + 1} inProject />)}</ul>
              {doneRows.length > 0 && (
                <details className="group mt-3 border-t pt-3">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />Done ({doneRows.length})
                  </summary>
                  <ul className="mt-1">{doneRows.map((r, i) => <Row key={r.task.id} row={r} onOpen={onOpenTask} n={openRows.length + i + 1} inProject />)}</ul>
                </details>
              )}
            </>
          )}
        </Tile>
      )}

      {tab === "notes" && (
        <Tile title="Notes" count={project.notes.length} action={<Button size="sm" variant="outline" onClick={() => void addNote()}><Plus />Note</Button>}>
          {project.notes.length === 0 ? <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">No notes yet.</p> : <NoteList notes={project.notes} onOpen={onOpenNote} />}
        </Tile>
      )}
      {tab === "links" && <LinksPanel space={space} spaces={spaces} save={save} />}
      {tab === "activity" && <ActivityPanel space={space} tasks={project.tasks} notes={project.notes} />}
    </section>
  );
}

function NoteList({ notes, onOpen }: { notes: NoteSummary[]; onOpen: (id: string) => void }) {
  return (
    <ol className="divide-y">
      {notes.map((n) => (
        <li key={n.id}>
          <button type="button" onClick={() => onOpen(n.id)} aria-label={`Open note ${n.title || "Untitled"}`}
            className="w-full px-2 py-2.5 text-left outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{n.title || "Untitled"}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.edited_at)}</span>
            </span>
            {n.excerpt && <span className="mt-0.5 line-clamp-1 text-[12.5px] text-muted-foreground">{n.excerpt}</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}

function RecentActivity({ space, project, events }: { space: Space; project: Project; events: GitEvent[] }) {
  const list = activity(space.folder, events, project.tasks, project.notes.map((n) => ({ title: n.title, edited_at: n.edited_at })), 4);
  if (list.length === 0) return <p className="px-2 py-4 text-[12.5px] text-muted-foreground">{space.folder ? "Commits, pushes, finished tasks and edited notes show here." : "Finished tasks and edited notes show here. Link the folder to see commits and pushes."}</p>;
  return (
    <ol className="divide-y">
      {list.map((a, i) => (
        <li key={`${a.at}-${i}`} className="flex items-center gap-3 px-2 py-2 text-[12.5px]">
          <span className={cn("size-1.5 shrink-0 rounded-full", a.kind === "pushed" || a.kind === "committed" ? "bg-primary" : "bg-muted-foreground/50")} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{a.text}</span>
          <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{timeAgo(a.at)}</time>
        </li>
      ))}
    </ol>
  );
}
