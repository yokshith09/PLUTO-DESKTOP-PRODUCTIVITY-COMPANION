import { useState } from "react";
import { PageHeader } from "@/features/shell/PageHeader";
import { cn } from "@/lib/utils";
import { CoursesTab } from "./course/CoursesTab";
import { PlanTab } from "./plan/PlanTab";
import { TimetableTab } from "./timetable/TimetableTab";

/** Owner 2026-11-19: the Weekly report tab is removed. */
type Tab = "courses" | "timetable" | "exams" | "friends";
const TABS: { id: Tab; label: string }[] = [
  { id: "courses", label: "Courses" },
  { id: "timetable", label: "Timetable" },
  { id: "exams", label: "Exams, notes, tasks" },
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

/** Study: courses, timetable, exams with notes and tasks (the student pack). */
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
      {tab === "friends" && <Friends />}
    </div>
  );
}
