import { ChevronLeft, ChevronRight, Flame, PenLine } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { DayInfo } from "@/ipc";
import { parseYmd, ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { level, monthLabels, streaks, yearTotals, yearWeeks, type Level } from "./calendar";

/** The squares, light to strong (owner 2026-11-03: "date cards like a git commit tracker"). */
const FILL: Record<Level, string> = {
  0: "bg-muted/70 hover:bg-muted",
  1: "bg-primary/25 hover:bg-primary/40",
  2: "bg-primary/50 hover:bg-primary/65",
  3: "bg-primary/75 hover:bg-primary/85",
  4: "bg-primary",
};

const longDay = (d: string) => parseYmd(d).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a square says when you rest on it. */
export function dayTitle(day: string, info: DayInfo | undefined): string {
  return `${longDay(day)}: ${info ? `${plural(info.entries, "entry", "entries")}, ${plural(info.words, "word")}` : "no entry"}`;
}

/**
 * A year of days as squares, one per day, stronger the more was written; a click opens that day.
 * Above it: the year, what it holds, and the streak.
 */
export function DiaryCalendar({ year, onYear, infos, onOpen }: {
  year: number; onYear: (y: number) => void; infos: readonly DayInfo[]; onOpen: (day: string) => void;
}) {
  const today = ymd(new Date());
  const thisYear = Number(today.slice(0, 4));
  const byDay = useMemo(() => new Map(infos.map((i) => [i.day, i])), [infos]);
  const weeks = useMemo(() => yearWeeks(year), [year]);
  const labels = useMemo(() => monthLabels(weeks), [weeks]);
  const totals = yearTotals(infos, year);
  const run = streaks(infos.map((i) => i.day), today);
  const hasToday = byDay.has(today);

  return (
    <section aria-label="Your year" className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous year" onClick={() => onYear(year - 1)}><ChevronLeft /></Button>
          <h2 className="min-w-14 text-center text-[15px] font-semibold tabular-nums">{year}</h2>
          <Button variant="ghost" size="icon-sm" aria-label="Next year" disabled={year >= thisYear} onClick={() => onYear(year + 1)}><ChevronRight /></Button>
        </div>
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          <b className="font-semibold tabular-nums text-foreground">{totals.entries}</b> {totals.entries === 1 ? "entry" : "entries"} on <b className="font-semibold tabular-nums text-foreground">{totals.days}</b> {totals.days === 1 ? "day" : "days"}
        </p>
        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground" title="Days in a row with an entry">
          <Flame aria-hidden className={cn("size-4", run.current > 0 ? "text-primary" : "text-muted-foreground")} />
          <span><b className="font-semibold tabular-nums text-foreground">{run.current}</b> in a row · longest <b className="font-semibold tabular-nums text-foreground">{run.longest}</b></span>
        </p>
        <Button size="sm" className="ml-auto" onClick={() => onOpen(today)}><PenLine />{hasToday ? "Open today" : "Write today"}</Button>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="min-w-[640px]">
          <div className="grid gap-[3px] pl-8" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }} aria-hidden>
            {weeks.map((_, col) => <span key={col} className="h-4 whitespace-nowrap text-[11px] leading-4 text-muted-foreground">{labels.find((l) => l.col === col)?.label ?? ""}</span>)}
          </div>
          <div className="mt-0.5 flex gap-1.5">
            <div className="grid w-6 shrink-0 grid-rows-7 gap-[3px] text-[10px] text-muted-foreground" aria-hidden>
              {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => <span key={i} className="flex items-center">{d}</span>)}
            </div>
            <div role="grid" aria-label={`Diary days of ${year}`} className="grid min-w-0 flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
              {weeks.map((week, col) => (
                <div role="row" key={col} className="grid grid-rows-7 gap-[3px]">
                  {week.map((day, row) => {
                    if (!day) return <span key={row} role="gridcell" aria-hidden className="aspect-square" />;
                    const info = byDay.get(day);
                    const future = day > today;
                    return (
                      <span role="gridcell" key={day} className="aspect-square">
                        <button type="button" disabled={future} title={dayTitle(day, info)} aria-label={dayTitle(day, info)}
                          tabIndex={info || day === today ? 0 : -1}
                          onClick={() => onOpen(day)}
                          className={cn(
                            "block size-full rounded-[3px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-30",
                            FILL[level(info)],
                            day === today && "ring-1 ring-inset ring-foreground/70",
                          )} />
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground" aria-hidden>
        Less {([0, 1, 2, 3, 4] as Level[]).map((l) => <i key={l} className={cn("size-3 rounded-[3px]", FILL[l].split(" ")[0])} />)} More
      </div>
    </section>
  );
}
