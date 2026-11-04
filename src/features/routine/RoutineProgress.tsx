import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { addMonths, monthGrid, monthOf } from "@/features/tasks/MonthCalendar";
import { dayLabel, parseYmd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { dayStat, encouragement, habitRates, nameOf, roomLine, roomToGrow, weekLine, weekVsWeek } from "./progress";
import type { RoutineState } from "./routine";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Your routine over time (FR-114, U-8; owner 2026-11-04): a month of days you can hover to see
 * what was planned and done, the week against the week before, and each routine's last 30 days.
 * The words are only ever encouraging: what went well, and one small next step.
 */
export function RoutineProgress({ open, onClose, state, today }: { open: boolean; onClose: () => void; state: RoutineState; today: string }) {
  const thisMonth = monthOf(today);
  const [month, setMonth] = useState(thisMonth);
  const cells = useMemo(() => monthGrid(month), [month]);
  const week = weekVsWeek(state, today);
  const rates = habitRates(state, today);
  const room = roomToGrow(rates);
  const title = parseYmd(month).toLocaleDateString([], { month: "long", year: "numeric" });
  const maxWeek = Math.max(1, week.thisWeek.planned, week.lastWeek.planned);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[min(52rem,calc(100vw-2rem))] max-w-none gap-0 overflow-y-auto p-0 sm:max-w-none">
        <div className="border-b bg-gradient-to-b from-primary/[0.08] to-transparent px-5 pb-4 pt-5 pr-12">
          <DialogTitle className="text-[17px] font-semibold tracking-tight">Your routine</DialogTitle>
          <DialogDescription className="mt-1 flex items-start gap-2 text-[14px] text-foreground">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{encouragement(state, today)}</span>
          </DialogDescription>
        </div>

        <div className="space-y-4 p-5">
          <section aria-label="Routine days" className="rounded-xl border bg-card p-3">
            <div className="mb-2 flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft /></Button>
              <h3 aria-live="polite" className="min-w-36 text-center text-[14px] font-semibold">{title}</h3>
              <Button variant="ghost" size="icon-sm" aria-label="Next month" disabled={month >= thisMonth} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight /></Button>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1.5" aria-hidden>
              {WEEKDAYS.map((d) => <span key={d} className="text-center text-[11px] font-medium text-muted-foreground">{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((day, i) => {
                if (!day) return <span key={`b${i}`} aria-hidden />;
                const st = dayStat(state, day, today);
                const planned = st.planned?.length ?? 0;
                const done = st.done.length;
                const full = planned > 0 && done >= planned;
                const col = i % 7;
                const label = `${dayLabel(parseYmd(day))}: ${st.planned ? `${done} of ${planned} done` : done ? `${done} done` : "no routines recorded"}`;
                return (
                  <div key={day} className="group relative">
                    <button type="button" disabled={day > today} aria-label={label}
                      className={cn("relative flex min-h-[3.75rem] w-full flex-col rounded-xl border p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-30",
                        full ? "border-primary/60 bg-primary/[0.16]" : done > 0 ? "border-primary/30 bg-primary/[0.07]" : "border-dashed border-border/70 text-muted-foreground",
                        day === today && "ring-2 ring-primary/70 ring-offset-1 ring-offset-card")}>
                      <span className="text-[13px] font-semibold tabular-nums leading-none">{Number(day.slice(8))}</span>
                      {(planned > 0 || done > 0) && <span className="absolute right-2 top-2 text-[11px] tabular-nums text-muted-foreground">{planned ? `${done}/${planned}` : `${done}✓`}</span>}
                      {planned > 0 && (
                        <span className="mt-auto h-1 overflow-hidden rounded-full bg-muted" aria-hidden><i className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((done / planned) * 100)}%` }} /></span>
                      )}
                    </button>
                    {day <= today && (done > 0 || planned > 0) && (
                      <div role="tooltip" className={cn("pointer-events-none absolute top-full z-20 mt-1.5 hidden w-56 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl group-hover:block group-focus-within:block", col >= 5 ? "right-0" : col <= 1 ? "left-0" : "left-1/2 -translate-x-1/2")}>
                        <p className="text-[12px] font-semibold">{dayLabel(parseYmd(day))}</p>
                        <p className="mb-1 text-[12px] text-muted-foreground">{st.planned ? `${done} of ${planned} done` : `${done} done`}</p>
                        <ul className="space-y-0.5">
                          {(st.planned ?? st.done).map((id) => {
                            const ok = st.done.includes(id);
                            return (
                              <li key={id} className="flex items-center gap-2 text-[12px]">
                                <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full text-[10px]", ok ? "bg-primary/20 text-primary" : "border text-transparent")}>✓</span>
                                <span className={cn("truncate", !ok && "text-muted-foreground")}>{nameOf(state, id)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section aria-label="This week" className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">This week and last week</h3>
              {([["This week", week.thisWeek, false], ["Last week", week.lastWeek, true]] as const).map(([name, w, soft]) => (
                <div key={name} className="mb-3 last:mb-0">
                  <div className="flex items-baseline text-[13px]"><span>{name}</span><span className="ml-auto tabular-nums">{w.days ? `${w.done} done` : "no record"}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><i className={cn("block h-full rounded-full bg-primary", soft && "opacity-50")} style={{ width: `${Math.round((w.done / maxWeek) * 100)}%` }} /></div>
                </div>
              ))}
              <p className="mt-3 text-[13px] text-muted-foreground">{weekLine(week)}</p>
            </section>

            <section aria-label="Each routine" className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Each routine, last 30 days</h3>
              {rates.length === 0 ? <p className="text-[13px] text-muted-foreground">Add a routine and it shows up here.</p> : (
                <ul className="space-y-2.5">
                  {rates.map((r) => (
                    <li key={r.id}>
                      <div className="flex items-baseline gap-2 text-[13px]">
                        <span className="min-w-0 flex-1 truncate">{r.title}</span>
                        <span className="shrink-0 text-[11.5px] text-muted-foreground">{r.last7} of the last 7 days</span>
                        <span className="w-12 shrink-0 text-right tabular-nums">{r.done}/{r.planned}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><i className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(r.rate * 100)}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {room && (
            <section aria-label="Next win" className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/[0.07] p-4">
              <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-[13.5px]">{roomLine(room)}</p>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
