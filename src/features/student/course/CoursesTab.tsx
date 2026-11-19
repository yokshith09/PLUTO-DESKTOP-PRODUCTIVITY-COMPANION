import { Archive, ArchiveRestore, BarChart3, CalendarDays, ListChecks, StickyNote, ChevronDown, ChevronRight, MoreHorizontal, Pencil, Plus, Search, Settings2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ipc } from "@/ipc";
import type { CourseCard, CourseDetail, SyllabusEdit } from "@/ipc/types";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useCourses } from "../useStudent";
import { COURSE_COLORS, STATUSES, courseColor, daysUntil, focusLabel, initials, inDaysLabel, nextExam, readiness, whenLabel } from "./courseLogic";
import { DatesPanel, ExamsPanel } from "./ExamsPanel";
import { TopicList } from "./TopicList";
import { useCourseCards, useCoursePage } from "./useCoursePage";

const fail = (e: unknown) => notify.error((e as { message?: string })?.message ?? "That did not work.");

function CourseMenu({ c, onArchive, label }: { c: CourseCard; onArchive: () => void; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-7" aria-label={`${label} ${c.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onArchive}>{c.archived ? <ArchiveRestore /> : <Archive />}{c.archived ? "Restore course" : "Archive course"}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CourseList({ cards, selected, onSelect, setArchived }: { cards: CourseCard[]; selected: string | null; onSelect: (id: string) => void; setArchived: (c: CourseCard, v: boolean) => void }) {
  const courses = useCourses();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const q = query.trim().toLowerCase();
  const match = (c: CourseCard) => !q || c.name.toLowerCase().includes(q);
  const active = cards.filter((c) => !c.archived && match(c));
  const archived = cards.filter((c) => c.archived && match(c));
  const Row = ({ c }: { c: CourseCard }) => (
    <li className={cn("flex items-center rounded-lg", selected === c.id && "bg-accent")}>
      <button type="button" aria-current={selected === c.id ? "true" : undefined} onClick={() => onSelect(c.id)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: courseColor(c.color) }} aria-hidden />
        <span className="truncate">{c.name}</span>
      </button>
      <CourseMenu c={c} label="Course options for" onArchive={() => setArchived(c, !c.archived)} />
    </li>
  );
  return (
    <nav aria-label="Courses" className="flex w-full flex-col gap-3 lg:w-56 lg:shrink-0">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Courses</h2>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setAdding(true)}><Plus />Add Course</Button>
      </div>
      {adding && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) courses.create.mutate(name, { onSuccess: (c) => { setName(""); setAdding(false); onSelect((c as { id: string }).id); }, onError: fail }); }}>
          <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAdding(false)} placeholder="Course name" aria-label="New course name" className="h-8" />
          <Button type="submit" size="sm" disabled={!name.trim()}>Add</Button>
        </form>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search courses…" aria-label="Search courses" className="pl-8" />
      </div>
      <ul className="space-y-0.5">
        {active.map((c) => <Row key={c.id} c={c} />)}
        {cards.length === 0 && <li className="rounded-lg border border-dashed p-4 text-center text-[13px] text-muted-foreground">No courses yet.<br />Add your first course.</li>}
        {cards.length > 0 && active.length === 0 && archived.length === 0 && <li className="px-2.5 py-2 text-[13px] text-muted-foreground">No course matches.</li>}
      </ul>
      {archived.length > 0 && (
        <div>
          <button type="button" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)} className="flex w-full items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
            {showArchived ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}Archived ({archived.length})
          </button>
          {showArchived && <ul className="space-y-0.5">{archived.map((c) => <Row key={c.id} c={c} />)}</ul>}
        </div>
      )}
    </nav>
  );
}

function Settings({ detail, edit, onDeleted }: { detail: CourseDetail; edit: (e: SyllabusEdit, then?: () => void) => void; onDeleted: () => void }) {
  const courses = useCourses();
  const c = detail.card;
  const [subtitle, setSubtitle] = useState(c.subtitle);
  const save = (over: Partial<{ subtitle: string; color: number; archived: boolean }>) => edit({ op: "course_set", id: c.id, subtitle, color: c.color, archived: c.archived, ...over });
  return (
    <section aria-label="Course settings" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Course settings</h2>
      <label className="block space-y-1"><span className="text-xs text-muted-foreground">Line under the name</span>
        <Input value={subtitle} maxLength={60} onChange={(e) => setSubtitle(e.target.value)} onBlur={() => subtitle.trim() !== c.subtitle && save({ subtitle })} placeholder="CSE • 5th Semester" className="max-w-sm" />
      </label>
      <div role="group" aria-label="Colour" className="flex gap-2">
        {COURSE_COLORS.map((col, i) => (
          <button key={col} type="button" aria-label={`Colour ${i + 1}`} aria-pressed={c.color === i} onClick={() => save({ color: i })} className={cn("size-6 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", c.color === i && "ring-2 ring-foreground ring-offset-2 ring-offset-card")} style={{ background: col }} />
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => save({ archived: !c.archived })}>{c.archived ? <ArchiveRestore /> : <Archive />}{c.archived ? "Restore course" : "Archive course"}</Button>
        <ConfirmAction message={`Delete ${c.name}? Its topics, notes, exams and dates go too; tasks and notes stay.`} onConfirm={() => courses.remove.mutate(c.id, { onSuccess: onDeleted, onError: fail })}>
          <Button variant="outline" size="sm"><Trash2 />Delete course</Button>
        </ConfirmAction>
      </div>
    </section>
  );
}

function Header({ detail, settingsOpen, toggleSettings, setArchived }: { detail: CourseDetail; settingsOpen: boolean; toggleSettings: () => void; setArchived: (c: CourseCard, v: boolean) => void }) {
  const courses = useCourses();
  const c = detail.card;
  const [name, setName] = useState<string | null>(null);
  const saveName = () => { if (name && name.trim() && name.trim() !== c.name) courses.rename.mutate({ id: c.id, name }, { onError: fail }); setName(null); };
  return (
    <header className="flex flex-wrap items-center gap-3">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: courseColor(c.color) }} aria-hidden>{initials(c.name)}</span>
      <div className="min-w-0 flex-1">
        {name === null ? (
          <h1 className="flex items-center gap-1.5 text-lg font-semibold">
            <span className="truncate">{c.name}</span>
            <Button variant="ghost" size="icon" className="size-7" aria-label={`Rename ${c.name}`} onClick={() => setName(c.name)}><Pencil /></Button>
          </h1>
        ) : (
          <Input autoFocus value={name} maxLength={60} aria-label="Course name" className="h-9 max-w-md text-base font-semibold" onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setName(null); }} />
        )}
        <p className="text-[13px] text-muted-foreground">{c.subtitle || "Add a line under the name in Course Settings"}</p>
      </div>
      <CourseMenu c={c} label="More for" onArchive={() => setArchived(c, !c.archived)} />
      <Button variant={settingsOpen ? "secondary" : "outline"} size="sm" aria-expanded={settingsOpen} onClick={toggleSettings}><Settings2 />Course Settings</Button>
    </header>
  );
}

const BAR = ["bg-sky-500", "bg-amber-500", "bg-cyan-500", "bg-emerald-500"] as const;

/** Exam readiness as a ring: how many topics the student marked exam-ready. */
function ReadyRing({ ready, total }: { ready: number; total: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const part = total ? ready / total : 0;
  return (
    <div className="relative size-20 shrink-0" role="img" aria-label={`${ready} of ${total} topics exam-ready`}>
      <svg viewBox="0 0 72 72" className="size-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--muted)" strokeWidth="7" />
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * part} ${c}`} />
      </svg>
      <span className="absolute inset-0 grid place-content-center text-center text-[15px] font-semibold tabular-nums">{total ? `${Math.round(part * 100)}%` : "–"}</span>
    </div>
  );
}

/**
 * The course overview (owner 2026-11-19: "draw a new layout"): three cards instead of a row of
 * four boxes. Readiness (a ring and the topics by status), what is next (the exam countdown and
 * the next date), and the week in numbers. They sit side by side when there is room and wrap
 * when the window is small.
 */
function Summary({ detail, today }: { detail: CourseDetail; today: string }) {
  const next = nextExam(detail.exams, today);
  const r = readiness(detail.topics);
  const nextDate = detail.dates.filter((d) => d.on_date >= today).sort((a, b) => a.on_date.localeCompare(b.on_date))[0];
  const days = next ? daysUntil(today, next.on_date) : null;
  const Row = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <div className="flex items-center gap-3 py-2">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{label}</span>
      <span className="text-[14px] font-semibold tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="@container" aria-label="Course summary" role="region">
      <div className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-[1.25fr_1fr_0.95fr]">
        <section aria-label="Exam readiness" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Exam readiness</h3>
          <div className="flex items-center gap-4">
            <ReadyRing ready={r.ready} total={r.total} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold tabular-nums">{r.ready} of {r.total} topics exam-ready</p>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                {r.total > 0 && r.byStatus.map((n, i) => n > 0 && <i key={i} className={cn("block h-full", BAR[i])} style={{ width: `${(n / r.total) * 100}%` }} />)}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
                {STATUSES.map((st, i) => <li key={st.label} className="flex items-center gap-1.5"><i aria-hidden className={cn("size-2 rounded-full", BAR[i])} />{st.label} {r.byStatus[i] ?? 0}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section aria-label="What is next" className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Next exam</h3>
          {next && days !== null ? (
            <div className="flex items-end gap-3">
              <p className="shrink-0 text-[26px] font-semibold leading-none tabular-nums">{days > 1 ? `${days} days` : inDaysLabel(days)}</p>
              <p className="min-w-0 flex-1 truncate pb-0.5 text-[12.5px] text-muted-foreground" title={next.title}>{next.title} · {whenLabel(next)}</p>
            </div>
          ) : <p className="text-[14px] font-semibold">No exam yet <span className="block text-[12px] font-normal text-muted-foreground">Add one under Exams.</span></p>}
          <div className="mt-auto border-t pt-2 text-[12.5px]">
            {nextDate
              ? <p className="truncate"><CalendarDays aria-hidden className="mr-1.5 inline size-3.5 align-[-2px] text-muted-foreground" />{nextDate.title} <span className="text-muted-foreground">· {inDaysLabel(daysUntil(today, nextDate.on_date))}</span></p>
              : <p className="text-muted-foreground">No upcoming dates.</p>}
          </div>
        </section>

        <section aria-label="This week" className="grid rounded-xl border bg-card px-4 py-1 @xl:col-span-2 @xl:grid-cols-3 @xl:gap-x-6 @4xl:col-span-1 @4xl:grid-cols-1">
          <Row icon={<BarChart3 />} label="Focus this week" value={focusLabel(detail.summary.focus_ms_week)} />
          <Row icon={<ListChecks />} label="Open tasks" value={String(detail.summary.open_tasks)} />
          <Row icon={<StickyNote />} label="Notes" value={String(detail.summary.notes)} />
        </section>
      </div>
    </div>
  );
}

type Tab = "topics" | "exams" | "dates";
const TABS: { id: Tab; label: string }[] = [{ id: "topics", label: "Topics" }, { id: "exams", label: "Exams" }, { id: "dates", label: "Important Dates" }];

function CourseView({ id, onDeleted, setArchived }: { id: string; onDeleted: () => void; setArchived: (c: CourseCard, v: boolean) => void }) {
  const { detail, today, edit, loading } = useCoursePage(id);
  const [tab, setTab] = useState<Tab>("topics");
  const [settings, setSettings] = useState(false);
  if (loading || !detail) return <p className="text-[13px] text-muted-foreground">Loading…</p>;
  return (
    <div className="min-w-0 flex-1 space-y-4">
      <Header detail={detail} settingsOpen={settings} toggleSettings={() => setSettings(!settings)} setArchived={setArchived} />
      {settings && <Settings detail={detail} edit={edit} onDeleted={onDeleted} />}
      <Summary detail={detail} today={today} />
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-3">
          <div role="tablist" aria-label="Course sections" className="flex gap-1 border-b">
            {TABS.map((t) => (
              <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} id={`course-tab-${t.id}`} aria-controls={`course-panel-${t.id}`} onClick={() => setTab(t.id)} className={cn("-mb-px border-b-2 px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring", t.id !== "topics" && "xl:hidden", tab === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {t.label}{t.id === "exams" && ` ${detail.exams.length}`}{t.id === "dates" && ` ${detail.dates.length}`}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`course-panel-${tab}`} aria-labelledby={`course-tab-${tab}`}>
            {/* From xl up Exams and Dates sit in the side column, so Topics always shows there. */}
            <div className={cn(tab !== "topics" && "hidden xl:block")}><TopicList detail={detail} edit={edit} /></div>
            {tab === "exams" && <div className="xl:hidden"><ExamsPanel detail={detail} today={today} edit={edit} /></div>}
            {tab === "dates" && <div className="xl:hidden"><DatesPanel detail={detail} today={today} edit={edit} /></div>}
          </div>
        </div>
        <aside aria-label="Exams and dates" className="hidden w-full space-y-4 xl:block xl:w-80 xl:shrink-0">
          <ExamsPanel detail={detail} today={today} edit={edit} />
          <DatesPanel detail={detail} today={today} edit={edit} />
        </aside>
      </div>
    </div>
  );
}

/** Study › Courses: pick a course on the left, work on it on the right. */
export function CoursesTab() {
  const cards = useCourseCards();
  const list = cards.data ?? [];
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const selected = list.some((c) => c.id === picked) ? picked : (list.find((c) => !c.archived) ?? list[0])?.id ?? null;
  useEffect(() => { if (picked && !list.some((c) => c.id === picked) && cards.isSuccess) setPicked(null); }, [picked, list, cards.isSuccess]);
  const setArchived = (c: CourseCard, archived: boolean) => {
    // Subtitle and colour are kept; only the flag changes.
    ipc.courseEdit({ op: "course_set", id: c.id, subtitle: c.subtitle, color: c.color, archived }).then(() => qc.invalidateQueries({ queryKey: ["courses"] })).catch(fail);
  };
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <CourseList cards={list} selected={selected} onSelect={setPicked} setArchived={setArchived} />
      {selected ? <CourseView key={selected} id={selected} onDeleted={() => setPicked(null)} setArchived={setArchived} /> : (
        <div className="grid flex-1 place-items-center rounded-xl border border-dashed p-10 text-center text-[13px] text-muted-foreground">
          <p>Pick a course, or add your first one. Each course keeps its topics, short notes, exams and dates.</p>
        </div>
      )}
    </div>
  );
}
