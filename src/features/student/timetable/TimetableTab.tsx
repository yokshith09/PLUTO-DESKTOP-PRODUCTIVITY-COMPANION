import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileUp, SlidersHorizontal, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePref } from "@/features/guide/usePref";
import { ipc } from "@/ipc";
import type { TimetableClass } from "@/ipc/types";
import { ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { courseColor } from "../course/courseLogic";
import { useCourseCards } from "../course/useCoursePage";
import { ClassEditor, blankClass, draftOf, type Draft } from "./ClassEditor";
import { ImportDialog } from "./ImportDialog";
import { DAY_NAMES, DEFAULT_VIEW, ROW_PX, classesOn, layoutDay, minuteLabel, mondayOf, outsideHours, parseView, slotStarts, snap, weekday, widened, type View } from "./timetableLogic";

export const VIEW_PREF = "study.timetable";
const sel = "h-8 rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ViewSettings({ view, set }: { view: View; set: (v: View) => void }) {
  const field = (label: string, el: React.ReactNode) => <label className="flex items-center gap-2 text-xs text-muted-foreground">{label}{el}</label>;
  const hours = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => (from + i) * 60);
  return (
    <div aria-label="Timetable view" role="group" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3">
      {field("Day starts", <select aria-label="Day starts" className={sel} value={view.from} onChange={(e) => set({ ...view, from: Number(e.target.value) })}>{hours(6, 12).map((m) => <option key={m} value={m}>{minuteLabel(m)}</option>)}</select>)}
      {field("Day ends", <select aria-label="Day ends" className={sel} value={view.to} onChange={(e) => set({ ...view, to: Number(e.target.value) })}>{hours(14, 23).map((m) => <option key={m} value={m}>{minuteLabel(m)}</option>)}</select>)}
      {field("Slot", <select aria-label="Slot length" className={sel} value={view.slot} onChange={(e) => set({ ...view, slot: Number(e.target.value) as View["slot"] })}><option value={30}>30 min</option><option value={60}>60 min</option><option value={90}>90 min</option></select>)}
      {field("Days", <select aria-label="Days shown" className={sel} value={view.days} onChange={(e) => set({ ...view, days: Number(e.target.value) as View["days"] })}><option value={5}>Mon to Fri</option><option value={6}>Mon to Sat</option><option value={7}>Mon to Sun</option></select>)}
      {field("Row height", <select aria-label="Row height" className={sel} value={view.density} onChange={(e) => set({ ...view, density: e.target.value as View["density"] })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="roomy">Roomy</option></select>)}
    </div>
  );
}

/** Study › Timetable: the whole week at once; click a class to change it, an empty spot to add one. */
export function TimetableTab() {
  const qc = useQueryClient();
  const cards = useCourseCards().data ?? [];
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => ipc.classesList() });
  const pref = usePref<View>(VIEW_PREF, parseView);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  useEffect(() => { if (pref.value) setView(pref.value); }, [pref.value]);
  const change = (v: View) => { setView(v); void pref.set(v); };
  const [weeks, setWeeks] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showView, setShowView] = useState(false);
  const [importing, setImporting] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const refresh = () => qc.invalidateQueries({ queryKey: ["classes"] });
  const all = classes.data ?? [];
  const monday = mondayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + weeks * 7));
  const dates = Array.from({ length: view.days }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  const ppm = ROW_PX[view.density] / view.slot;
  const height = (view.to - view.from) * ppm;
  const colorOf = (c: TimetableClass) => courseColor(cards.find((x) => x.id === c.course_id)?.color ?? 7);
  const outside = outsideHours(dates.flatMap((d) => classesOn(all, d)), view);
  const todayKey = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const addAt = (day: number, y: number) => {
    const start = Math.min(snap(view.from + y / ppm, view.slot), 1439 - 30);
    setDraft(blankClass(day, start, Math.min(start + 60, 1440)));
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Timetable</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous week" onClick={() => setWeeks(weeks - 1)}><ChevronLeft /></Button>
          <span className="min-w-36 text-center text-xs tabular-nums text-muted-foreground">{weeks === 0 ? "This week" : `${ymd(monday)} week`}</span>
          <Button variant="ghost" size="icon" aria-label="Next week" onClick={() => setWeeks(weeks + 1)}><ChevronRight /></Button>
          {weeks !== 0 && <Button variant="ghost" size="sm" onClick={() => setWeeks(0)}>This week</Button>}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant={showView ? "secondary" : "outline"} size="sm" aria-expanded={showView} onClick={() => setShowView(!showView)}><SlidersHorizontal />View</Button>
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}><FileUp />Import or export</Button>
          <Button size="sm" onClick={() => setDraft(blankClass(Math.max(0, Math.min(weekday(now), view.days - 1)), Math.max(view.from, 540), Math.max(view.from, 540) + 60))}><Plus />Add class</Button>
        </div>
      </div>
      {showView && <ViewSettings view={view} set={change} />}
      {outside.length > 0 && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          {outside.length} {outside.length === 1 ? "class is" : "classes are"} outside {minuteLabel(view.from)} to {minuteLabel(view.to)}.
          <Button variant="outline" size="sm" onClick={() => change(widened(outside, view))}>Widen the day</Button>
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `56px repeat(${view.days}, minmax(0, 1fr))` }}>
          <div />
          {dates.map((d) => (
            <div key={d.toDateString()} className={cn("border-l px-2 py-2 text-center text-xs", ymd(d) === todayKey ? "font-semibold text-primary" : "text-muted-foreground")} aria-current={ymd(d) === todayKey ? "date" : undefined}>
              {DAY_NAMES[weekday(d)]} <span className="tabular-nums">{d.getDate()}</span>
            </div>
          ))}
          <div className="relative" style={{ height }} aria-hidden>
            {slotStarts(view).map((m) => <span key={m} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground" style={{ top: (m - view.from) * ppm }}>{m === view.from ? "" : minuteLabel(m).replace(":00", "")}</span>)}
          </div>
          {dates.map((d) => {
            const placed = layoutDay(classesOn(all, d));
            const isToday = ymd(d) === todayKey;
            return (
              <div key={d.toDateString()} role="group" aria-label={`${DAY_NAMES[weekday(d)]} ${d.getDate()}`} className={cn("relative border-l", isToday && "bg-primary/5")} style={{ height }}
                onClick={(e) => { if (e.target === e.currentTarget) addAt(weekday(d), e.nativeEvent.offsetY); }}>
                {slotStarts(view).map((m) => <div key={m} aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-border/60" style={{ top: (m - view.from) * ppm }} />)}
                {placed.map(({ c, lane, lanes }) => {
                  const top = Math.max(0, (c.start_min - view.from) * ppm);
                  const bottom = Math.min(height, (c.end_min - view.from) * ppm);
                  if (bottom <= 0 || top >= height) return null;
                  return (
                    <button key={c.id} type="button" onClick={() => setDraft(draftOf(c))} aria-label={`${c.title}, ${minuteLabel(c.start_min)} to ${minuteLabel(c.end_min)}${c.place ? `, ${c.place}` : ""}. Edit`}
                      className="absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ top: top + 1, height: Math.max(20, bottom - top - 2), left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, borderColor: colorOf(c), background: `${colorOf(c)}26` }}>
                      <span className="block truncate font-medium">{c.title}</span>
                      <span className="block truncate text-muted-foreground">{minuteLabel(c.start_min)}{c.place && ` · ${c.place}`}</span>
                    </button>
                  );
                })}
                {isToday && nowMin >= view.from && nowMin <= view.to && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-primary" style={{ top: (nowMin - view.from) * ppm }} aria-hidden><span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-primary" /></div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {all.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-[13px] text-muted-foreground">No classes yet. Click a spot in the grid, press Add class, or import a file.</p>}
      <ClassEditor draft={draft} courses={cards} onClose={() => setDraft(null)} onSaved={() => void refresh()} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} onChanged={() => { void refresh(); void qc.invalidateQueries({ queryKey: ["courses"] }); }} />
    </div>
  );
}
