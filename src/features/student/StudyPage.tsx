import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/shell/PageHeader";
import { ipc } from "@/ipc";
import type { WeeklyReport } from "@/ipc/types";
import { notify } from "@/lib/notify";
import { parseYmd, ymd } from "@/lib/dates";
import { hoursLabel } from "@/lib/focus";
import { cn } from "@/lib/utils";
import { CoursesTab } from "./course/CoursesTab";
import { PlanTab } from "./plan/PlanTab";
import { TimetableTab } from "./timetable/TimetableTab";

/** The seven days ending on the given day, as the first day. */
export const weekStart = (end: Date): string => { const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6); return ymd(d); };
export const shiftWeek = (from: string, weeks: number): string => { const d = parseYmd(from); d.setDate(d.getDate() + 7 * weeks); return ymd(d); };

/** The report as plain text you can paste anywhere. */
export function reportText(r: WeeklyReport): string {
  const rows = r.courses.map((c) => `- ${c.course?.name ?? "No course"}: ${hoursLabel(c.focus_ms)} focus, ${c.tasks_done} ${c.tasks_done === 1 ? "task" : "tasks"} done`);
  return [`Week ${r.from} to ${r.to}`, ...rows, `Total: ${hoursLabel(r.total_focus_ms)} focus, ${r.total_tasks_done} done`].join("\n");
}

function Report() {
  const [from, setFrom] = useState(() => weekStart(new Date()));
  const report = useQuery({ queryKey: ["weekly-report", from], queryFn: () => ipc.weeklyReport(from) });
  const r = report.data;
  const copy = async () => {
    if (!r) return;
    try { await navigator.clipboard.writeText(reportText(r)); notify.success("Report copied"); } catch { notify.error("Could not copy"); }
  };
  const thisWeek = from === weekStart(new Date());
  return (
    <section aria-label="Weekly report" className="rounded-xl border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Weekly report</h2>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous week" onClick={() => setFrom(shiftWeek(from, -1))}><ChevronLeft /></Button>
          <span className="min-w-40 text-center text-xs tabular-nums text-muted-foreground">{r ? `${r.from} to ${r.to}` : from}</span>
          <Button variant="ghost" size="icon" aria-label="Next week" disabled={thisWeek} onClick={() => setFrom(shiftWeek(from, 1))}><ChevronRight /></Button>
          <Button variant="outline" size="sm" onClick={() => void copy()} disabled={!r}><Copy />Copy</Button>
        </div>
      </div>
      {r && (
        <table className="w-full text-left text-[13px]">
          <thead className="text-xs text-muted-foreground"><tr><th scope="col" className="py-1.5 font-medium">Course</th><th scope="col" className="py-1.5 font-medium">Focus time</th><th scope="col" className="py-1.5 font-medium">Tasks done</th></tr></thead>
          <tbody className="divide-y">
            {r.courses.map((c) => (
              <tr key={c.course?.id ?? "none"}><th scope="row" className="py-2 font-normal">{c.course?.name ?? "No course"}</th><td className="tabular-nums">{hoursLabel(c.focus_ms)}</td><td className="tabular-nums">{c.tasks_done}</td></tr>
            ))}
            <tr className="font-medium"><th scope="row" className="py-2 font-medium">Total</th><td className="tabular-nums">{hoursLabel(r.total_focus_ms)}</td><td className="tabular-nums">{r.total_tasks_done}</td></tr>
          </tbody>
        </table>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Focus time counts finished focus sessions started on a task that has a course, minus paused time.</p>
    </section>
  );
}

type Tab = "courses" | "timetable" | "exams" | "report" | "friends";
const TABS: { id: Tab; label: string }[] = [
  { id: "courses", label: "Courses" },
  { id: "timetable", label: "Timetable" },
  { id: "exams", label: "Exams, notes, tasks" },
  { id: "report", label: "Weekly report" },
  { id: "friends", label: "Friends" },
];

/** Friends need accounts and a server, so they wait (owner 2026-11-18: on hold, just say so). */
function Friends() {
  return (
    <section aria-label="Friends" className="rounded-xl border bg-card p-8 text-center">
      <h2 className="text-sm font-semibold">Friends</h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-muted-foreground">Planned for later. Study groups need an online service, and Pluto keeps everything on your computer for now.</p>
    </section>
  );
}

/** Study: courses, exams and the weekly report (the student pack). */
export function StudyPage() {
  const [tab, setTab] = useState<Tab>("courses");
  return (
    <div className="space-y-4">
      <PageHeader title="Study" description="Courses, exams and your week." />
      <div role="tablist" aria-label="Study sections" className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("-mb-px border-b-2 px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</button>
        ))}
      </div>
      {tab === "courses" && <CoursesTab />}
      {tab === "timetable" && <TimetableTab />}
      {tab === "exams" && <PlanTab />}
      {tab === "report" && <Report />}
      {tab === "friends" && <Friends />}
    </div>
  );
}
