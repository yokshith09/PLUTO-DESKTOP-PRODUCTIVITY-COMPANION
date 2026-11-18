import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, StickyNote, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePref } from "@/features/guide/usePref";
import { useAllTasks, useTaskActions } from "@/hooks/usePluto";
import { ipc } from "@/ipc";
import { ymd } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { courseColor } from "../course/courseLogic";
import { useCourseCards } from "../course/useCoursePage";
import { useCourseData } from "../useStudent";
import { doneRecently, examWhen, inFilter, parseFilter, splitExams } from "./planLogic";

const FILTER_PREF = "study.planFilter";
const sel = "h-8 rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const fail = (e: unknown) => notify.error((e as { message?: string })?.message ?? "That did not work.");

function Card({ title, label, children }: { title: string; label: string; children: React.ReactNode }) {
  return <section aria-label={label} className="rounded-xl border bg-card p-4"><h2 className="mb-3 text-sm font-semibold">{title}</h2>{children}</section>;
}

/** Study › Exams, notes, tasks: everything with a course, in one place. A chip picks the course. */
export function PlanTab() {
  const qc = useQueryClient();
  const cards = (useCourseCards().data ?? []).filter((c) => !c.archived);
  const { taskCourse, noteCourse } = useCourseData();
  const pref = usePref<string | null>(FILTER_PREF, parseFilter);
  const picked = pref.value ?? null;
  const filter = picked && cards.some((c) => c.id === picked) ? picked : null;
  const dot = (id: string | null | undefined) => courseColor(cards.find((c) => c.id === id)?.color ?? 7);
  const name = (id: string | null | undefined) => cards.find((c) => c.id === id)?.name;
  const today = ymd(new Date());
  const refresh = () => Promise.all(["exams", "tasks", "notes", "courses"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  // exams
  const examsQ = useQuery({ queryKey: ["exams", "all"], queryFn: () => ipc.examsFrom("1970-01-01") });
  const exams = (examsQ.data ?? []).filter((e) => filter === null || e.course_id === filter);
  const { upcoming, past } = splitExams(exams, today);
  const [showPast, setShowPast] = useState(false);
  const [adding, setAdding] = useState(false);
  const [exam, setExam] = useState({ title: "", date: "", course: "" });

  // tasks
  const all = useAllTasks().data ?? [];
  const actions = useTaskActions();
  const [showDone, setShowDone] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [taskCourseId, setTaskCourseId] = useState("");
  const mine = all.filter((r) => inFilter(taskCourse(r.task.id)?.id, filter));
  const open = mine.filter((r) => r.task.status !== "COMPLETED" && r.task.status !== "CANCELLED");
  const done = mine.filter((r) => r.task.status === "COMPLETED" && doneRecently(r.task.completed_at, Date.now()));

  // notes
  const notesQ = useQuery({ queryKey: ["notes", "study"], queryFn: () => ipc.notesList(false, null) });
  const notes = (notesQ.data ?? []).filter((n) => inFilter(noteCourse(n.id)?.id, filter));
  const [newNote, setNewNote] = useState("");
  const target = filter ?? taskCourseId;

  const choose = (id: string | null) => void pref.set(id);
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Course" className="flex flex-wrap gap-1.5">
        {[{ id: null as string | null, label: "All courses" }, ...cards.map((c) => ({ id: c.id as string | null, label: c.name }))].map((c) => (
          <button key={c.id ?? "all"} type="button" aria-pressed={filter === c.id} onClick={() => choose(c.id)} className={cn("flex h-8 items-center gap-2 rounded-full border px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring", filter === c.id ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent")}>
            {c.id && <span className="size-2 rounded-full" style={{ background: dot(c.id) }} aria-hidden />}{c.label}
          </button>
        ))}
      </div>

      <Card title="Exams" label="Exams">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setAdding(!adding); setExam((x) => ({ ...x, course: filter ?? x.course })); }}><Plus />Add exam</Button>
          {past.length > 0 && <Button variant="ghost" size="sm" aria-pressed={showPast} onClick={() => setShowPast(!showPast)}>{showPast ? "Hide" : "Show"} past exams ({past.length})</Button>}
        </div>
        {adding && (
          <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); ipc.examAdd(exam.course || null, exam.title, exam.date).then(() => { setExam({ title: "", date: "", course: "" }); setAdding(false); return refresh(); }).catch(fail); }}>
            <Input autoFocus value={exam.title} maxLength={100} onChange={(e) => setExam({ ...exam, title: e.target.value })} placeholder="Exam, e.g. Mid-term" aria-label="Exam name" className="h-8 w-48" />
            <Input type="date" value={exam.date} onChange={(e) => setExam({ ...exam, date: e.target.value })} aria-label="Exam date" className="h-8 w-40" />
            <select aria-label="Exam course" value={exam.course} onChange={(e) => setExam({ ...exam, course: e.target.value })} className={sel}><option value="">No course</option>{cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <Button type="submit" size="sm" disabled={!exam.title.trim() || !exam.date}>Save</Button>
          </form>
        )}
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[...upcoming, ...(showPast ? past : [])].map((e) => {
            const d = new Date(`${e.on_date}T00:00:00`);
            return (
              <li key={e.id} className={cn("flex items-center gap-3 rounded-lg border p-3", e.on_date < today && "opacity-60")}>
                <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted text-center leading-tight" aria-hidden>
                  <span className="text-[10px] uppercase text-muted-foreground">{d.toLocaleDateString("en", { month: "short" })}</span><span className="text-base font-semibold tabular-nums">{d.getDate()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{e.title}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"><span className="size-2 shrink-0 rounded-full" style={{ background: dot(e.course_id) }} aria-hidden />{name(e.course_id) ?? "No course"}</p>
                  <p className="text-xs font-medium tabular-nums">{examWhen(today, e.on_date)}</p>
                </div>
                <ConfirmAction message={`Delete ${e.title}?`} onConfirm={() => ipc.examDelete(e.id).then(refresh).catch(fail)}>
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Delete ${e.title}`}><Trash2 /></Button>
                </ConfirmAction>
              </li>
            );
          })}
        </ul>
        {upcoming.length === 0 && !showPast && <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><CalendarClock className="size-4" />No exams coming up.</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Tasks" label="Tasks">
          <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!newTask.trim() || !target) return; actions.quickAdd(newTask).then((t) => ipc.taskSetCourse(t.id, target)).then(() => { setNewTask(""); return refresh(); }).catch(fail); }}>
            <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="New task" aria-label="New task" className="h-8 min-w-32 flex-1" />
            {!filter && <select aria-label="Task course" value={taskCourseId} onChange={(e) => setTaskCourseId(e.target.value)} className={sel}><option value="">Course…</option>{cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
            <Button type="submit" variant="secondary" size="sm" disabled={!newTask.trim() || !target}><Plus />Add</Button>
          </form>
          <ul className="divide-y">
            {[...open, ...(showDone ? done : [])].map((r) => {
              const finished = r.task.status === "COMPLETED";
              return (
                <li key={r.task.id} className="flex items-center gap-2.5 py-2 text-[13px]">
                  <input type="checkbox" checked={finished} aria-label={`Done: ${r.task.title}`} onChange={(e) => void actions.setDone(r.task.id, e.target.checked).then(refresh)} className="size-4 accent-primary" />
                  <span className={cn("min-w-0 flex-1 truncate", finished && "text-muted-foreground line-through")}>{r.task.title}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><span className="size-2 rounded-full" style={{ background: dot(taskCourse(r.task.id)?.id) }} aria-hidden />{taskCourse(r.task.id)?.name}</span>
                  {r.task.due_date && <span className={cn("shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums", r.overdue && "text-destructive")}>{r.task.due_date}</span>}
                </li>
              );
            })}
          </ul>
          {open.length === 0 && <p className="text-[13px] text-muted-foreground">No open tasks{filter ? " for this course" : " with a course"}. Add one above.</p>}
          {done.length > 0 && <Button variant="ghost" size="sm" className="mt-2" aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? "Hide" : "Show"} done ({done.length})</Button>}
        </Card>

        <Card title="Notes" label="Notes">
          <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!newNote.trim() || !target) return; ipc.noteCreate({ title: newNote.trim() }).then((n) => ipc.noteSetCourse(n.id, target)).then(() => { setNewNote(""); return refresh(); }).catch(fail); }}>
            <Input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="New note title" aria-label="New note" className="h-8 min-w-32 flex-1" />
            <Button type="submit" variant="secondary" size="sm" disabled={!newNote.trim() || !target}><Plus />Add</Button>
          </form>
          <ul className="divide-y">
            {notes.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => void ipc.noteWindowOpen(n.id).catch(fail)} className="flex w-full items-center gap-2.5 rounded py-2 text-left text-[13px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open note ${n.title || "Untitled"}`}>
                  <StickyNote className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{n.title || "Untitled"}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><span className="size-2 rounded-full" style={{ background: dot(noteCourse(n.id)?.id) }} aria-hidden />{noteCourse(n.id)?.name}</span>
                  <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{new Date(n.edited_at).toLocaleDateString("en", { month: "short", day: "numeric" })}</time>
                </button>
              </li>
            ))}
          </ul>
          {notes.length === 0 && <p className="text-[13px] text-muted-foreground">No notes {filter ? "for this course" : "with a course"} yet. Pick a course on a note, or add one above.</p>}
        </Card>
      </div>
      {!filter && cards.length === 0 && <p className="text-[13px] text-muted-foreground">Add a course in the Courses tab first; tasks and notes join a course there or on their own page.</p>}
    </div>
  );
}
