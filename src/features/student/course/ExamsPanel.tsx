import { BookOpenCheck, CalendarClock, ChevronRight, ClipboardList, FlaskConical, FolderKanban, HelpCircle, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CourseDate, CourseDetail, CourseExam, SyllabusEdit } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { DATE_KINDS, courseColor, daysUntil, examChips, inDaysLabel, kindLabel, orderDates, shortDate, whenLabel } from "./courseLogic";

type Edit = (e: SyllabusEdit, then?: () => void) => void;
const field = "h-8";
const label = "text-xs text-muted-foreground";

function Panel({ title, count, addLabel, onAdd, children }: { title: string; count: number; addLabel: string; onAdd: () => void; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title} <span className="font-normal text-muted-foreground tabular-nums">({count})</span></h2>
        <Button variant="outline" size="sm" className="ml-auto" onClick={onAdd}><Plus />{addLabel}</Button>
      </div>
      {children}
    </section>
  );
}

function ExamForm({ course, exam, topics, edit, done }: { course: string; exam?: CourseExam; topics: CourseDetail["topics"]; edit: Edit; done: () => void }) {
  const [title, setTitle] = useState(exam?.title ?? "");
  const [date, setDate] = useState(exam?.on_date ?? "");
  const [time, setTime] = useState(exam?.at_time ?? "");
  const [place, setPlace] = useState(exam?.place ?? "");
  const [picked, setPicked] = useState<string[]>(exam?.topic_ids ?? []);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <form className="space-y-2 rounded-lg border bg-background p-3" onSubmit={(e) => { e.preventDefault(); edit({ op: "exam_save", id: exam?.id ?? null, course_id: course, title, on_date: date, at_time: time, place, topic_ids: picked }, done); }}>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 space-y-1"><span className={label}>Exam name</span><Input className={field} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Midterm" autoFocus /></label>
        <label className="space-y-1"><span className={label}>Date</span><Input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="space-y-1"><span className={label}>Time</span><Input className={field} type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <label className="col-span-2 space-y-1"><span className={label}>Place or seat</span><Input className={field} value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} placeholder="C-201" /></label>
      </div>
      {topics.length > 0 && (
        <fieldset className="space-y-1">
          <legend className={label}>Topics in this exam (none picked means all)</legend>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <button key={t.id} type="button" aria-pressed={picked.includes(t.id)} onClick={() => toggle(t.id)} className={cn("rounded-full border px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring", picked.includes(t.id) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>{t.title}</button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={done}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!title.trim() || !date}>{exam ? "Save" : "Add exam"}</Button>
      </div>
    </form>
  );
}

function ExamCard({ e, detail, today, edit }: { e: CourseExam; detail: CourseDetail; today: string; edit: Edit }) {
  const [editing, setEditing] = useState(false);
  const dot = courseColor(detail.card.color);
  if (editing) return <li><ExamForm course={detail.card.id} exam={e} topics={detail.topics} edit={edit} done={() => setEditing(false)} /></li>;
  const days = daysUntil(today, e.on_date);
  return (
    <li className={cn("rounded-lg border p-3", days < 0 && "opacity-60")}>
      <div className="flex items-start gap-2">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{e.title} <span className="font-normal text-muted-foreground">· {inDaysLabel(days)}</span></p>
          <p className="text-xs text-muted-foreground">{whenLabel(e)}{e.place && ` | ${e.place}`}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{examChips(e, detail.topics).map((c) => <span key={c} className="max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-xs" title={c}>{c}</span>)}</div>
        </div>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`Edit ${e.title}`} onClick={() => setEditing(true)}><ChevronRight /></Button>
        <ConfirmAction message={`Delete ${e.title}?`} onConfirm={() => edit({ op: "exam_delete", id: e.id })}>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Delete ${e.title}`}><Trash2 /></Button>
        </ConfirmAction>
      </div>
    </li>
  );
}

const KIND_ICON: Record<string, ReactNode> = {
  assignment: <ClipboardList className="size-4" />, lab: <FlaskConical className="size-4" />, quiz: <HelpCircle className="size-4" />,
  project: <FolderKanban className="size-4" />, other: <CalendarClock className="size-4" />,
};

function DateForm({ course, date, edit, done }: { course: string; date?: CourseDate; edit: Edit; done: () => void }) {
  const [title, setTitle] = useState(date?.title ?? "");
  const [on, setOn] = useState(date?.on_date ?? "");
  const [kind, setKind] = useState(date?.kind ?? "assignment");
  return (
    <form className="space-y-2 rounded-lg border bg-background p-3" onSubmit={(e) => { e.preventDefault(); edit({ op: "date_save", id: date?.id ?? null, course_id: course, title, on_date: on, kind }, done); }}>
      <label className="block space-y-1"><span className={label}>Title</span><Input className={field} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Assignment 3" autoFocus /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className={label}>Date</span><Input className={field} type="date" value={on} onChange={(e) => setOn(e.target.value)} /></label>
        <label className="space-y-1"><span className={label}>Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 w-full rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {DATE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={done}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!title.trim() || !on}>{date ? "Save" : "Add date"}</Button>
      </div>
    </form>
  );
}

function DateRow({ d, courseId, today, edit }: { d: CourseDate; courseId: string; today: string; edit: Edit }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <li><DateForm course={courseId} date={d} edit={edit} done={() => setEditing(false)} /></li>;
  const days = daysUntil(today, d.on_date);
  return (
    <li className={cn("flex items-center gap-3 py-2.5", days < 0 && "opacity-60")}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden>{KIND_ICON[d.kind] ?? KIND_ICON.other}</span>
      <button type="button" className="min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setEditing(true)} aria-label={`Edit ${d.title}`}>
        <span className="block truncate text-[13px] font-medium">{d.title}</span>
        <span className="block text-xs text-muted-foreground">{inDaysLabel(days)} • {shortDate(d.on_date)}</span>
      </button>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{kindLabel(d.kind)}</span>
      <ConfirmAction message={`Delete ${d.title}?`} onConfirm={() => edit({ op: "date_delete", id: d.id })}>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`Delete ${d.title}`}><Trash2 /></Button>
      </ConfirmAction>
    </li>
  );
}

/** Exams of the course: date, time, place, and the topics each one covers. */
export function ExamsPanel({ detail, today, edit }: { detail: CourseDetail; today: string; edit: Edit }) {
  const [adding, setAdding] = useState(false);
  return (
    <Panel title="Exams" count={detail.exams.length} addLabel="Add Exam" onAdd={() => setAdding(true)}>
      <ul className="space-y-2">
        {adding && <li><ExamForm course={detail.card.id} topics={detail.topics} edit={edit} done={() => setAdding(false)} /></li>}
        {detail.exams.map((e) => <ExamCard key={e.id} e={e} detail={detail} today={today} edit={edit} />)}
      </ul>
      {detail.exams.length === 0 && !adding && <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><BookOpenCheck className="size-4" />No exams yet. Add the midterm or the final.</p>}
    </Panel>
  );
}

/** Deadlines that are not exams: assignment, lab, quiz, project. */
export function DatesPanel({ detail, today, edit }: { detail: CourseDetail; today: string; edit: Edit }) {
  const [adding, setAdding] = useState(false);
  const ordered = orderDates(detail.dates, today);
  return (
    <Panel title="Important Dates" count={detail.dates.length} addLabel="Add Date" onAdd={() => setAdding(true)}>
      {adding && <div className="mb-2"><DateForm course={detail.card.id} edit={edit} done={() => setAdding(false)} /></div>}
      <ul className="divide-y">{ordered.map((d) => <DateRow key={d.id} d={d} courseId={detail.card.id} today={today} edit={edit} />)}</ul>
      {ordered.length === 0 && !adding && <p className="text-[13px] text-muted-foreground">No dates yet. Add deadlines for assignments, labs and quizzes.</p>}
    </Panel>
  );
}
