import { Check, ChevronDown, ChevronRight, ExternalLink, GripVertical, Plus, Search, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CourseDetail, Subtopic, SyllabusEdit, Topic } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { STATUSES, filterCounts, filterTopics, progressOf, pointsIn, writtenIn, type TopicFilter } from "./courseLogic";

type Edit = (e: SyllabusEdit, then?: () => void) => void;

const CHIPS: { id: TopicFilter; label: string }[] = [{ id: "all", label: "All" }, { id: "starred", label: "Starred" }, { id: "not_ready", label: "Not Ready" }];

/** A box that adds one thing when you press Enter (and stays ready for the next). */
function AddLine({ label, placeholder, onAdd, max = 100 }: { label: string; placeholder: string; onAdd: (text: string, done: () => void) => void; max?: number }) {
  const [text, setText] = useState("");
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAdd(text, () => setText("")); }}>
      <Input value={text} maxLength={max} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={label} className="h-8" />
      <Button type="submit" variant="secondary" size="sm" disabled={!text.trim()}><Plus />Add</Button>
    </form>
  );
}

/** Text that turns into a box when you click it; Enter saves, Escape leaves it. */
function EditableText({ value, label, max, className, onSave }: { value: string; label: string; max: number; className?: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return <button type="button" title="Click to edit" aria-label={`Edit ${label}: ${value}`} onClick={() => setDraft(value)} className={cn("rounded text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring", className)}>{value}</button>;
  }
  const save = () => { if (draft.trim() && draft.trim() !== value) onSave(draft); setDraft(null); };
  return <Input autoFocus value={draft} maxLength={max} aria-label={label} className="h-8" onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setDraft(null); }} />;
}

function PointRow({ id, text, written, edit }: { id: string; text: string; written: boolean; edit: Edit }) {
  return (
    <li className="group flex items-start gap-2 py-1 text-[13px]">
      <input type="checkbox" checked={written} aria-label={`Written in notebook: ${text}`} title="Written in my notebook" onChange={(e) => edit({ op: "point_set", id, text: null, written: e.target.checked })} className="mt-1 size-3.5 accent-primary" />
      <div className="min-w-0 flex-1"><EditableText value={text} label="short note" max={300} className="w-full whitespace-pre-wrap break-words" onSave={(v) => edit({ op: "point_set", id, text: v, written: null })} /></div>
      <ConfirmAction message="Delete this short note?" onConfirm={() => edit({ op: "point_delete", id })}>
        <Button variant="ghost" size="icon" className="size-6 opacity-0 focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Delete short note: ${text}`}><Trash2 /></Button>
      </ConfirmAction>
    </li>
  );
}

function SubtopicRow({ s, edit }: { s: Subtopic; edit: Edit }) {
  const [open, setOpen] = useState(false);
  const written = s.points.filter((p) => p.written).length;
  const inBook = s.points.length > 0 && written === s.points.length;
  return (
    <li className="py-2">
      <div className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={s.done} aria-label={`I understand ${s.title}`} title="I understand this" onChange={(e) => edit({ op: "subtopic_set", id: s.id, title: null, done: e.target.checked })} className="size-4 accent-primary" />
        <EditableText value={s.title} label="subtopic" max={100} className={cn("min-w-0 flex-1 truncate", s.done && "text-muted-foreground")} onSave={(v) => edit({ op: "subtopic_set", id: s.id, title: v, done: null })} />
        <span className="text-xs text-muted-foreground tabular-nums">{s.points.length} {s.points.length === 1 ? "note" : "notes"}</span>
        <span className={cn("inline-flex h-6 min-w-16 items-center justify-center gap-1 rounded-full px-2 text-xs", inBook ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")} title={inBook ? "All short notes are written in your notebook" : `${written} of ${s.points.length} written in your notebook`}>
          {inBook ? <><Check className="size-3" />In Notebook</> : s.points.length === 0 ? "—" : `${written}/${s.points.length} written`}
        </span>
        <Button variant="ghost" size="icon" className="size-7" aria-expanded={open} aria-label={`${open ? "Hide" : "Open"} short notes of ${s.title}`} onClick={() => setOpen(!open)}><ExternalLink /></Button>
        <ConfirmAction message={`Delete ${s.title} and its short notes?`} onConfirm={() => edit({ op: "subtopic_delete", id: s.id })}>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Delete subtopic ${s.title}`}><Trash2 /></Button>
        </ConfirmAction>
      </div>
      {!open && s.points[0] && <p className="mt-1 truncate pl-6 text-xs text-muted-foreground">{s.points[0].text}</p>}
      {open && (
        <div className="mt-2 space-y-2 pl-6">
          {s.points.length === 0 && <p className="text-xs text-muted-foreground">No short notes yet. Write the points you want to remember for the exam.</p>}
          <ul className="divide-y divide-border/60">{s.points.map((p) => <PointRow key={p.id} id={p.id} text={p.text} written={p.written} edit={edit} />)}</ul>
          <AddLine label={`New short note for ${s.title}`} placeholder="A short note, then Enter" max={300} onAdd={(text, done) => edit({ op: "point_add", subtopic_id: s.id, text }, done)} />
        </div>
      )}
    </li>
  );
}

function TopicRow({ t, n, first, last, edit }: { t: Topic; n: number; first: boolean; last: boolean; edit: Edit }) {
  const [open, setOpen] = useState(false);
  const p = progressOf(t);
  const pct = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);
  const status = STATUSES[Math.min(t.status, 3)] ?? STATUSES[0];
  return (
    <li className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" className="cursor-grab rounded text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Move ${t.title}: press Arrow Up or Arrow Down`} title="Move with the arrow keys"
          onKeyDown={(e) => { if (e.key === "ArrowUp" && !first) { e.preventDefault(); edit({ op: "topic_move", id: t.id, up: true }); } if (e.key === "ArrowDown" && !last) { e.preventDefault(); edit({ op: "topic_move", id: t.id, up: false }); } }}><GripVertical className="size-4" /></button>
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-medium tabular-nums">{n}</span>
        <button type="button" aria-pressed={t.starred} aria-label={t.starred ? `Unstar ${t.title}` : `Star ${t.title}: likely in the exam`} title="Likely in the exam" className="rounded text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => edit({ op: "topic_set", id: t.id, title: null, starred: !t.starred, status: null })}>
          <Star className={cn("size-4", t.starred && "fill-amber-400 text-amber-400")} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium" title={t.title}>{t.title}</p>
          <p className="truncate text-xs text-muted-foreground tabular-nums">{p.done} / {p.total} subtopics • {pointsIn(t)} {pointsIn(t) === 1 ? "note" : "notes"}</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${t.title}: ${p.done} of ${p.total} subtopics understood`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <select aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => edit({ op: "topic_set", id: t.id, title: null, starred: null, status: Number(e.target.value) })} className={cn("h-7 rounded-full border-0 px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", status.tone)}>
          {STATUSES.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
        </select>
        <Button variant="ghost" size="icon" className="size-7" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${t.title}`} onClick={() => setOpen(!open)}>{open ? <ChevronDown /> : <ChevronRight />}</Button>
      </div>
      {open && (
        <div className="border-t px-3 pb-3 pt-2">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Topic name</span>
            <EditableText value={t.title} label="topic" max={100} className="text-[13px] font-medium text-foreground" onSave={(v) => edit({ op: "topic_set", id: t.id, title: v, starred: null, status: null })} />
            <span className="ml-auto tabular-nums">{writtenIn(t)} of {pointsIn(t)} written in notebook</span>
            <ConfirmAction message={`Delete ${t.title}, its subtopics and short notes?`} onConfirm={() => edit({ op: "topic_delete", id: t.id })}>
              <Button variant="ghost" size="sm" aria-label={`Delete topic ${t.title}`}><Trash2 />Delete topic</Button>
            </ConfirmAction>
          </div>
          {t.subtopics.length === 0 && <p className="py-2 text-xs text-muted-foreground">No subtopics yet. Split the topic into the parts you need to understand.</p>}
          <ul className="divide-y">{t.subtopics.map((s) => <SubtopicRow key={s.id} s={s} edit={edit} />)}</ul>
          <div className="mt-2"><AddLine label={`New subtopic for ${t.title}`} placeholder="Add a subtopic" onAdd={(title, done) => edit({ op: "subtopic_add", topic_id: t.id, title }, done)} /></div>
        </div>
      )}
    </li>
  );
}

/** The Topics tab: search, chips, and the topics with their subtopics and short notes. */
export function TopicList({ detail, edit }: { detail: CourseDetail; edit: Edit }) {
  const [filter, setFilter] = useState<TopicFilter>("all");
  const [query, setQuery] = useState("");
  const counts = filterCounts(detail.topics);
  const shown = filterTopics(detail.topics, filter, query);
  const reorder = filter === "all" && !query.trim();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search topics…" aria-label="Search topics" className="pl-8" />
        </div>
        <div role="group" aria-label="Show topics" className="flex gap-1.5">
          {CHIPS.map((c) => (
            <button key={c.id} type="button" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)} className={cn("h-8 rounded-full border px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring", filter === c.id ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent")}>
              {c.label} <span className="tabular-nums">{counts[c.id]}</span>
            </button>
          ))}
        </div>
      </div>
      {detail.topics.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">No topics yet. Add the topics from your syllabus below.</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">No topic matches.</p>
      ) : (
        <ul className="space-y-2" aria-label="Topics">{shown.map((t, i) => <TopicRow key={t.id} t={t} n={detail.topics.indexOf(t) + 1} first={!reorder || i === 0} last={!reorder || i === shown.length - 1} edit={edit} />)}</ul>
      )}
      <AddLine label="New topic" placeholder="Add a topic from your syllabus" onAdd={(title, done) => edit({ op: "topic_add", course_id: detail.card.id, title }, done)} />
    </div>
  );
}
