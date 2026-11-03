import { useEffect, useState } from "react";
import { ArrowRight, Bell, CalendarDays, ExternalLink, FilePlus2, FileText, Flag, FolderKanban, History, Lightbulb, Link2, MoreHorizontal, Pencil, Play, Plus, StickyNote, Timer, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NoteEditor } from "@/features/notes/NoteEditor";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useAllTasks, useNotes, useTask, useTaskActions, useTaskHistory, useWorkUpdates } from "@/hooks/usePluto";
import { overdueLabel, ymd } from "@/lib/dates";
import { STATUS_LABEL, isFinished, transitionsFrom } from "@/lib/taskStatus";
import { cn } from "@/lib/utils";
import { clockTime, formatWhen } from "@/lib/time";
import { errorMessage, ipc, type Priority, type Task, type TaskEvent } from "@/ipc";
import { notify } from "@/lib/notify";
import { clock as focusClock, hoursLabel } from "@/lib/focus";
import { toEdit } from "./edit";
import { useFocus, useFocusLength } from "@/hooks/useFocus";
import { FocusLength } from "@/features/focus/FocusTile";
import { TaskReminders } from "./TaskReminders";
import { StarButton } from "./TaskBits";
import { CoursePicker } from "@/features/student/CoursePicker";
import { dueLine, taskHints } from "./hints";
import { LinksEditor, PlanEditor, RepeatHistory, planOf, planStateOf, samePlan } from "./TaskPlanEditor";

const NONE = "none";
const DELETE_WINDOW_MS = 5 * 60_000;

/** One card of the editor (U-3, owner's reference 2026-11-03): an icon, a title, one short line. */
function Card({ icon, title, hint, right, children, className }: {
  icon: React.ReactNode; title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section aria-label={title} className={cn("min-w-0 rounded-xl border bg-card p-4", className)}>
      <div className="flex items-center gap-2 [&>svg]:size-[18px] [&>svg]:shrink-0">
        {icon}<h3 className="text-[14px] font-semibold">{title}</h3>
        {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function HintButton({ action, run }: { action: { id: "move-today" | "start" | "set-today"; label: string }; run: (id: "move-today" | "start" | "set-today") => Promise<void> }) {
  return <Button size="sm" variant="outline" onClick={() => void run(action.id)}>{action.label}</Button>;
}

/** Priority as four choices in two rows, each saying what it means; the marks match the task lists. */
const PRIORITY_CHOICES = [
  { value: "HIGH", label: "High", glyph: "▲", hint: "Shows first", cls: "text-primary" },
  { value: "MEDIUM", label: "Medium", glyph: "■", hint: "This week", cls: "text-foreground/70" },
  { value: "LOW", label: "Low", glyph: "▼", hint: "Can wait", cls: "text-muted-foreground" },
  { value: NONE, label: "None", glyph: "–", hint: "No priority", cls: "text-muted-foreground" },
] as const;

function PriorityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v)} aria-label="Priority" className="grid w-full grid-cols-2 gap-2">
      {PRIORITY_CHOICES.map((p) => (
        <ToggleGroupItem key={p.value} value={p.value} aria-label={p.label}
          className="h-auto justify-start gap-2.5 rounded-lg border px-3 py-2 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/10">
          <span aria-hidden className={cn("w-3 text-center text-[13px]", p.cls)}>{p.glyph}</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-foreground">{p.label}</span>
            <span className="block text-[11px] font-normal text-muted-foreground">{p.hint}</span>
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const day = (s: string | null) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" }) : "");

function describe(e: TaskEvent): string {
  switch (e.kind) {
    case "CREATED": return "Created";
    case "STATUS": return `${STATUS_LABEL[(e.from_status ?? "PLANNED") as Task["status"]] ?? e.from_status} → ${STATUS_LABEL[(e.to_status ?? "PLANNED") as Task["status"]] ?? e.to_status}`;
    case "DEFERRED": return `Moved from ${day(e.from_date) || "no day"} to ${day(e.to_date)}`;
    case "EDITED": return e.to_date !== null ? `Planned day set to ${day(e.to_date)}` : "Edited";
    default: return e.kind.charAt(0) + e.kind.slice(1).toLowerCase();
  }
}

/** Everything about one task: edit it, move it through its life, defer it, log progress, see its history. */
export function TaskDetail({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { data: task } = useTask(taskId);
  return (
    <Dialog open={taskId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(74rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {task ? <Body key={task.id} task={task} onClose={onClose} /> : <div className="p-8 text-center text-[13px] text-muted-foreground"><DialogTitle className="sr-only">Task</DialogTitle>Loading…</div>}
      </DialogContent>
    </Dialog>
  );
}

function Body({ task, onClose }: { task: Task; onClose: () => void }) {
  const actions = useTaskActions();
  const focus = useFocus();
  const { data: focusedMs = 0 } = useQuery({ queryKey: ["focus-total", task.id, focus.session?.id ?? null], queryFn: () => ipc.focusTaskTotal(task.id) });
  const { minutes, set: setMinutes } = useFocusLength();
  const { data: allTasks = [] } = useAllTasks();
  const { data: notes = [] } = useNotes(false, null, "last_edited");
  const { data: history = [] } = useTaskHistory(task.id);
  const { data: updates = [] } = useWorkUpdates(task.id);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [project, setProject] = useState(task.project ?? "");
  const [priority, setPriority] = useState<string>(task.priority ?? NONE);
  const [planned, setPlanned] = useState(task.planned_date ?? "");
  const [due, setDue] = useState(task.due_date ?? "");
  const [noteId, setNoteId] = useState(task.note_id ?? "");
  const [plan, setPlan] = useState(() => planStateOf(task));
  const planChanged = !samePlan(planOf(plan), planOf(planStateOf(task)));
  const [update, setUpdate] = useState("");
  const [deferTo, setDeferTo] = useState("");
  const [moving, setMoving] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const qc = useQueryClient();
  /** FR-42: make a note from this task (title and details), link it, and open it. */
  const noteFromTask = async () => {
    try {
      const note = await ipc.noteCreate({ title: title.trim() || task.title, body: description });
      await actions.update(task.id, { ...toEdit(task), note_id: note.id });
      setNoteId(note.id);
      await qc.invalidateQueries({ queryKey: ["notes"] });
      setOpenNote(note.id);
    } catch (e) {
      notify.error(errorMessage(e));
    }
  };
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const finished = isFinished(task.status);
  const dirty = title.trim() !== task.title || description !== task.description || project.trim() !== (task.project ?? "")
    || priority !== (task.priority ?? NONE) || planned !== (task.planned_date ?? "") || due !== (task.due_date ?? "") || noteId !== (task.note_id ?? "") || planChanged;
  const tomorrow = ymd(new Date(new Date().setDate(new Date().getDate() + 1)));

  const save = async () => {
    if (!title.trim()) return notify.warning("Give the task a title.");
    // Nothing changed: Save still closes, like the owner expects (never a dead button).
    if (!dirty) return onClose();
    if (plan.mode === "repeat" && plan.repeat.kind === "weekly" && plan.repeat.days.length === 0) return notify.warning("Pick at least one day of the week.");
    if (plan.mode === "days" && plan.days.length === 0) return notify.warning("Pick at least one day.");
    await actions.update(task.id, {
      ...toEdit(task), title: title.trim(), description, project: project.trim() || null,
      priority: priority === NONE ? null : (priority as Priority), planned_date: planned || null, due_date: due || null, note_id: noteId || null,
    });
    if (planChanged) await actions.setPlan(task.id, planOf(plan));
    notify.success("Task saved");
    // FR-41: after an edit, back to the screen the task was opened from (Today or Tasks).
    onClose();
  };
  const addUpdate = async () => {
    if (!update.trim()) return;
    await actions.addUpdate(task.id, update);
    setUpdate("");
  };

  const todayStr = ymd(new Date(now));
  const draft: Task = { ...task, planned_date: planned || null, due_date: due || null };
  const hints = taskHints(draft, todayStr);
  const dueText = finished ? "" : dueLine(draft, todayStr);
  const primaryTo = task.status === "IN_PROGRESS" ? "COMPLETED" : finished ? "PLANNED" : "IN_PROGRESS";
  const runHint = async (id: "move-today" | "start" | "set-today") => {
    if (id === "start") return void actions.transition(task.id, "IN_PROGRESS");
    // These only fill the form; Save makes them stick, like any other edit.
    if (id === "move-today") setDue(todayStr);
    setPlanned(todayStr);
  };
  const overdueText = due && due < todayStr && !finished ? overdueLabel(due, todayStr) : null;
  const projects = [...new Set(allTasks.map((r) => r.task.project).filter((p): p is string => !!p))].sort();

  const others = transitionsFrom(task.status).filter((t) => t.to !== primaryTo);
  const primary = transitionsFrom(task.status).find((t) => t.to === primaryTo);
  // Updates and history in one list, newest first (U-3).
  type Line = { key: string; at: number; text: React.ReactNode; update?: { id: string } };
  const lines: Line[] = [
    ...updates.map((u): Line => ({ key: `u${u.id}`, at: u.created_at, text: <>Update: <q className="whitespace-pre-line">{u.body}</q></>, update: { id: u.id } })),
    ...history.map((e, i): Line => ({ key: `h${i}`, at: e.at, text: describe(e) })),
  ].sort((x, y) => y.at - x.at);
  const canMove = !finished && plan.mode === "one";

  return (
    <div className="contents" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); } }}>
      <div className="border-b px-6 pb-4 pt-5 pr-14">
        <DialogDescription className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span aria-label={`Status: ${STATUS_LABEL[task.status]}`} className="rounded-md bg-primary/12 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">{STATUS_LABEL[task.status]}</span>
          {task.project && <span className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-0.5 text-foreground"><FolderKanban aria-hidden className="size-3" />{task.project}</span>}
          {dueText && <span className={overdueText ? "font-medium text-destructive" : "font-medium text-foreground"}>{dueText}</span>}
          {focusedMs > 0 && <span className="tabular-nums" title="Finished focus sessions on this task">Focused {hoursLabel(focusedMs)}</span>}
          {focus.session?.task_id === task.id && <span className="font-medium text-primary tabular-nums">Focusing · {focusClock(focus.remaining)} left</span>}
        </DialogDescription>
        <div className="flex items-center gap-2">
          <DialogTitle className="sr-only">Task: {task.title}</DialogTitle>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} aria-label="Title"
            className="min-w-0 flex-1 bg-transparent text-[22px] font-semibold tracking-tight outline-none placeholder:text-muted-foreground"
          />
          <StarButton starred={task.starred} title={task.title} onToggle={() => void actions.star(task.id, !task.starred)} className="opacity-100" />
          {primary && (
            <div role="group" aria-label="Status">
              <Button size="sm" onClick={() => void actions.transition(task.id, primary.to)}>{primary.label}</Button>
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="More actions" title="More actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {others.map((t) => <DropdownMenuItem key={t.to} onSelect={() => void actions.transition(task.id, t.to)}>{t.label}</DropdownMenuItem>)}
              {canMove && (
                <>
                  {others.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem onSelect={() => void actions.defer(task.id, tomorrow)}>Move to tomorrow</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setMoving(true)}>Move to a day…</DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setAskDelete(true)}>Delete task…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {moving && (
          <form className="mt-3 flex flex-wrap items-center gap-2" aria-label="Move to a day" onSubmit={(e) => { e.preventDefault(); if (deferTo) void actions.defer(task.id, deferTo).then(() => { setDeferTo(""); setMoving(false); }); }}>
            <span className="text-xs text-muted-foreground">Move to</span>
            <Input type="date" value={deferTo} min={tomorrow} onChange={(e) => setDeferTo(e.target.value)} aria-label="Defer to" className="h-8 w-40" autoFocus />
            <Button type="submit" size="sm" variant="outline" disabled={!deferTo}>Move</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMoving(false)}>Cancel</Button>
          </form>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {hints[0] && (
          <p aria-label="Suggestions" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-primary/8 px-3 py-2 text-[13px]">
            <Lightbulb aria-hidden className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">{hints[0].text}</span>
            {hints[0].action && <HintButton action={hints[0].action} run={runHint} />}
          </p>
        )}

        <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 gap-3.5">
            <Card icon={<CalendarDays />} title="Schedule" hint="When you work on it, and the last day it can be done.">
              <PlanEditor value={plan} onChange={setPlan} planned={planned} onPlanned={setPlanned} deadline={due} onDeadline={setDue} />
              <div className="mt-3 empty:hidden"><RepeatHistory task={task} /></div>
            </Card>
            <Card icon={<StickyNote />} title="Details" hint="What this task is about.">
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={20000} aria-label="Description" placeholder="Add details…"
                className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-[13.5px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              {description.length > 18000 && <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground">{description.length.toLocaleString()} / 20,000</p>}
            </Card>
            <Card icon={<Bell />} title="Reminder" hint="A notification and the pet ring before it starts.">
              <TaskReminders task={task} />
            </Card>
          </div>

          <div className="grid min-w-0 gap-3.5">
            <Card icon={<Flag />} title="Priority" hint="How important it is.">
              <PriorityPicker value={priority} onChange={setPriority} />
            </Card>
            <Card icon={<FolderKanban />} title="Project">
              <Input id="td-project" value={project} maxLength={100} onChange={(e) => setProject(e.target.value)} placeholder="No project" aria-label="Project name" list="td-projects" />
              <datalist id="td-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
              <div className="mt-2 empty:hidden"><CoursePicker kind="task" id={task.id} /></div>
            </Card>
            {!finished && (
              <Card icon={<Timer />} title="Focus timer" hint="Work on this task with a timer.">
                {focus.session ? (
                  <p className="text-[13px] text-muted-foreground">{focus.session.task_id === task.id ? <>Focusing on this task · <span className="tabular-nums text-foreground">{focusClock(focus.remaining)}</span> left</> : "A focus session is already running."}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <FocusLength minutes={minutes} onChange={(m) => void setMinutes(m)} />
                    <Button size="sm" variant="outline" className="border-primary/60 text-primary hover:bg-primary/10" aria-label={`Focus ${minutes} min`}
                      onClick={() => void focus.start("FOCUS", minutes, task.id)}><Play />Start focus</Button>
                  </div>
                )}
              </Card>
            )}
            <Card icon={<FileText />} title="Note">
              <div className="flex gap-2">
                <select id="td-note" aria-label="Linked note" value={noteId} onChange={(e) => setNoteId(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="">No note</option>
                  {notes.map((n) => <option key={n.id} value={n.id}>{n.title || "Untitled"}</option>)}
                </select>
                {noteId ? (
                  <Button size="sm" variant="outline" className="h-9" aria-label="Open note" onClick={() => setOpenNote(noteId)}><ExternalLink />Open</Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-9" aria-label="New note from this task" onClick={() => void noteFromTask()}><FilePlus2 />New note</Button>
                )}
              </div>
            </Card>
            <Card icon={<Link2 />} title="Links" hint="Web pages for this task. Click one to open it.">
              <LinksEditor task={task} />
            </Card>
          </div>

          <Card icon={<History />} title="Updates and history" hint="Write a short progress note; everything that happened to the task is listed with the time." className="lg:col-span-2">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void addUpdate(); }}>
              <Input value={update} onChange={(e) => setUpdate(e.target.value)} placeholder="What happened?" aria-label="New work update" maxLength={5000} />
              <Button type="submit" size="sm" variant="secondary" className="h-9" disabled={!update.trim()}><Plus />Add</Button>
            </form>
            <ol className="mt-2" aria-label="History">
              {lines.map((l) => (
                <li key={l.key} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-t py-2 first:border-t-0">
                  <span aria-hidden className={cn("grid size-7 place-items-center rounded-full border bg-muted/40", l.update ? "text-primary" : "text-muted-foreground")}>
                    {l.update ? <Pencil className="size-3.5" /> : <ArrowRight className="size-3.5" />}
                  </span>
                  <span className="min-w-0 text-[13px]">{l.text}</span>
                  <span className="flex items-center gap-1 whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
                    {formatWhen(l.at, now)}
                    {l.update && now - l.at <= DELETE_WINDOW_MS && (
                      <ConfirmUpdateDelete onConfirm={() => l.update && void actions.removeUpdate(l.update.id)} />
                    )}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-1 text-[11px] text-muted-foreground">Created {formatWhen(task.created_at, now)}{task.completed_at ? ` · finished at ${clockTime(task.completed_at)}` : ""}</p>
          </Card>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t px-4 py-3">
        {askDelete ? (
          <div role="alertdialog" aria-label="Delete this task?" className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium">{finished ? "Delete this task and its history for good?" : "This task isn’t finished. Delete it anyway?"}</span>
            <Button size="sm" variant="outline" onClick={() => setAskDelete(false)} autoFocus>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={() => void actions.removeAny(task).then(onClose)}>Delete</Button>
          </div>
        ) : dirty && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden className="size-1.5 rounded-full bg-primary" />Unsaved changes</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={() => void save()}>Save changes<kbd aria-hidden className="ml-1 hidden text-[10px] opacity-70 sm:inline">{navigator.platform.includes("Mac") ? "⌘S" : "Ctrl S"}</kbd></Button>
        </div>
      </div>
      <NoteEditor noteId={openNote} onClose={() => setOpenNote(null)} />
    </div>
  );
}

function ConfirmUpdateDelete({ onConfirm }: { onConfirm: () => void }) {
  return (
    <ConfirmAction message="Delete this update?" onConfirm={onConfirm}>
      <button type="button" aria-label="Delete update" title="Can be deleted for 5 minutes"
        className="grid size-6 place-items-center rounded text-muted-foreground outline-none hover:bg-destructive/15 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"><X className="size-3.5" /></button>
    </ConfirmAction>
  );
}
