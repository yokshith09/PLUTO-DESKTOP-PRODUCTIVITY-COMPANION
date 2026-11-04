import { useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Button } from "@/components/ui/button";
import { addMonths, monthGrid, monthOf } from "@/features/tasks/MonthCalendar";
import { ipc } from "@/ipc";
import { dayLabel, parseYmd, ymd } from "@/lib/dates";
import { formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";
import { categoryStyle } from "./categories";
import { dayCategories, monthStats, timeLevel, type TimeLevel } from "./monthTime";

const FILL: Record<TimeLevel, string> = {
  0: "border-dashed border-border/70 text-muted-foreground",
  1: "border-primary/25 bg-primary/[0.07]",
  2: "border-primary/35 bg-primary/[0.14]",
  3: "border-primary/50 bg-primary/[0.24]",
  4: "border-primary/70 bg-primary/[0.36]",
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SWIPE_PX = 60;
const startOf = (day: string) => parseYmd(day).getTime();
const nextDay = (day: string) => { const d = parseYmd(day); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); };

/**
 * Time, a day at a time (owner 2026-11-04: "recent 30 days, switch months, with dates; hover shows
 * the day's total time and its categories"). One tile per day of the month, stronger the more was
 * tracked; slide sideways, use the arrows, or both, to change month.
 */
export function TimeMonth({ tracking }: { tracking: boolean }) {
  const today = ymd(new Date());
  const thisMonth = monthOf(today);
  const [month, setMonth] = useState(thisMonth);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const cells = useMemo(() => monthGrid(month), [month]);
  const days = cells.filter((d): d is string => d !== null);
  const results = useQueries({
    queries: days.map((d) => ({
      queryKey: ["usage", "day", d],
      queryFn: () => ipc.usageSummary(startOf(d), nextDay(d)),
      enabled: tracking && d <= today,
      // A finished day does not change; today grows while the window is open.
      ...(d < today ? { staleTime: Infinity } : { refetchInterval: 30_000 }),
    })),
  });
  const byDay = new Map(days.map((d, i) => [d, results[i]?.data]));
  const seconds = days.map((d) => byDay.get(d)?.total_seconds ?? 0);
  const stats = monthStats(seconds);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const lastWheel = useRef(0);

  const step = (n: number) => {
    const next = addMonths(month, n);
    if (next > thisMonth) return;
    setDir(n > 0 ? "next" : "prev");
    setMonth(next);
  };
  const down = (e: ReactPointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; };
  const up = (e: ReactPointerEvent) => {
    const s = drag.current;
    drag.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) step(dx < 0 ? 1 : -1);
  };
  const wheel = (e: ReactWheelEvent) => {
    if (Math.abs(e.deltaX) < 30 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    const now = Date.now();
    if (now - lastWheel.current < 450) return;
    lastWheel.current = now;
    step(e.deltaX > 0 ? 1 : -1);
  };
  const title = parseYmd(month).toLocaleDateString([], { month: "long", year: "numeric" });

  return (
    <section aria-label="Time by day" className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => step(-1)}><ChevronLeft /></Button>
          <h2 aria-live="polite" className="min-w-36 text-center text-[15px] font-semibold tracking-tight">{title}</h2>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" disabled={month >= thisMonth} onClick={() => step(1)}><ChevronRight /></Button>
        </div>
        {tracking && (
          <p className="text-[13px] text-muted-foreground">
            <b className="font-semibold tabular-nums text-foreground">{formatDuration(stats.total)}</b> in {stats.tracked} {stats.tracked === 1 ? "day" : "days"}
            {stats.tracked > 0 && <> · about {formatDuration(stats.average)} a day</>}
          </p>
        )}
        {month !== thisMonth && <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setDir("next"); setMonth(thisMonth); }}>This month</Button>}
      </div>
      {!tracking ? (
        <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">Turn on app tracking to see each day here.</p>
      ) : (
        <div className="touch-pan-y select-none px-3 pb-3 pt-2" onPointerDown={down} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} onWheel={wheel}>
          <div className="mb-1 grid grid-cols-7 gap-1.5" aria-hidden>
            {WEEKDAYS.map((d) => <span key={d} className="text-center text-[11px] font-medium text-muted-foreground">{d}</span>)}
          </div>
          <div key={month} className={cn("grid grid-cols-7 gap-1.5", dir === "next" ? "diary-slide-next" : "diary-slide-prev")}>
            {cells.map((day, i) => {
              if (!day) return <span key={`b${i}`} aria-hidden />;
              const summary = byDay.get(day);
              const total = summary?.total_seconds ?? 0;
              const level = timeLevel(total, stats.busiest);
              const future = day > today;
              const cats = dayCategories(summary);
              const col = i % 7;
              return (
                <div key={day} className="group relative">
                  <button type="button" disabled={future} aria-label={`${dayLabel(parseYmd(day))}: ${total > 0 ? formatDuration(total) : "nothing tracked"}`}
                    className={cn("flex min-h-[3.75rem] w-full flex-col rounded-xl border p-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-30", FILL[level], day === today && "ring-2 ring-primary/70 ring-offset-1 ring-offset-card")}>
                    <span className="text-[13px] font-semibold tabular-nums leading-none">{Number(day.slice(8))}</span>
                    {total > 0 && <span className="mt-auto pt-1 text-[11px] tabular-nums text-foreground/80">{formatDuration(total)}</span>}
                  </button>
                  {!future && (
                    <div role="tooltip" className={cn("pointer-events-none absolute top-full z-20 mt-1.5 hidden w-52 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl group-hover:block group-focus-within:block", col >= 5 ? "right-0" : col <= 1 ? "left-0" : "left-1/2 -translate-x-1/2")}>
                      <p className="text-[12px] font-semibold">{dayLabel(parseYmd(day))}</p>
                      {total === 0 ? <p className="mt-1 text-[12px] text-muted-foreground">Nothing tracked.</p> : (
                        <>
                          <p className="mt-0.5 text-[15px] font-semibold tabular-nums">{formatDuration(total)}</p>
                          <ul className="mt-1.5 space-y-1">
                            {cats.slice(0, 6).map(([c, s]) => (
                              <li key={c} className="flex items-center gap-2 text-[12px]">
                                <span className={cn("size-2 rounded-full", categoryStyle(c).dot)} />
                                <span className="flex-1 truncate">{c}</span>
                                <span className="tabular-nums text-muted-foreground">{formatDuration(s)}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Slide sideways to change month · hover a day for its total and categories</p>
        </div>
      )}
    </section>
  );
}
