import { ChevronLeft, ChevronRight, Flame, PenLine } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Button } from "@/components/ui/button";
import { addMonths, monthGrid, monthOf } from "@/features/tasks/MonthCalendar";
import type { DayInfo } from "@/ipc";
import { parseYmd, ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Origin } from "./DayCard";
import { level, monthCounts, monthTotals, streaks, yearTotals, type Level } from "./calendar";

/** How strongly a written day's tile is tinted: a line or two, a paragraph, a page, a lot. */
const TINT: Record<Level, string> = {
  0: "",
  1: "from-primary/[0.10] to-primary/[0.03]",
  2: "from-primary/[0.18] to-primary/[0.05]",
  3: "from-primary/[0.28] to-primary/[0.08]",
  4: "from-primary/[0.40] to-primary/[0.12]",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SWIPE_PX = 60;
const longDay = (d: string) => parseYmd(d).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const originOf = (el: HTMLElement): Origin => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

/** What a tile says to a screen reader and when you rest on it. */
export function dayTitle(day: string, info: DayInfo | undefined): string {
  return `${longDay(day)}: ${info ? `${plural(info.entries, "entry", "entries")}, ${plural(info.words, "word")}` : "no entry"}`;
}

/**
 * The diary as a month of day tiles (owner 2026-11-03: "recent 30 days tiles, switch months by
 * sliding, highlight the dates you wrote, click a tile and it flips open"). Days you wrote are lit and
 * show the start of what you wrote; slide sideways (or use the arrows, or the month strip) to change
 * month; a click hands the day and the tile's place to the caller so the day card can flip out of it.
 */
export function MonthTiles({ month, onMonth, infos, onOpen }: {
  month: string; onMonth: (m: string) => void; infos: readonly DayInfo[]; onOpen: (day: string, from: Origin | null) => void;
}) {
  const today = ymd(new Date());
  const thisMonth = monthOf(today);
  const year = Number(month.slice(0, 4));
  const byDay = useMemo(() => new Map(infos.map((i) => [i.day, i])), [infos]);
  const cells = useMemo(() => monthGrid(month), [month]);
  const totals = monthTotals(infos, month);
  const counts = useMemo(() => monthCounts(infos, year), [infos, year]);
  const yearSum = yearTotals(infos, year);
  const run = streaks(infos.map((i) => i.day), today);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const drag = useRef<{ x: number; y: number } | null>(null);
  const lastWheel = useRef(0);

  const go = (m: string) => {
    if (m > thisMonth || m === month) return;
    setDir(m > month ? "next" : "prev");
    onMonth(m);
  };
  const step = (n: number) => go(addMonths(month, n));
  /** The same month in another year, but never later than this month. */
  const inYear = (y: number) => { const m = `${y}-${month.slice(5, 7)}-01`; return m > thisMonth ? thisMonth : m; };
  const maxCount = Math.max(1, ...counts);

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
  const hasToday = byDay.has(today);

  return (
    <section aria-label="Diary month" className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-gradient-to-b from-primary/[0.06] to-transparent px-4 py-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => step(-1)}><ChevronLeft /></Button>
          <h2 aria-live="polite" className="min-w-36 text-center text-[17px] font-semibold tracking-tight">{title}</h2>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" disabled={month >= thisMonth} onClick={() => step(1)}><ChevronRight /></Button>
        </div>
        <p className="text-[13px] text-muted-foreground">
          <b className="font-semibold tabular-nums text-foreground">{totals.entries}</b> {totals.entries === 1 ? "entry" : "entries"} on <b className="font-semibold tabular-nums text-foreground">{totals.days}</b> {totals.days === 1 ? "day" : "days"} this month
        </p>
        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground" title="Days in a row with an entry">
          <Flame aria-hidden className={cn("size-4", run.current > 0 ? "text-primary" : "text-muted-foreground")} />
          <span><b className="font-semibold tabular-nums text-foreground">{run.current}</b> in a row · longest <b className="font-semibold tabular-nums text-foreground">{run.longest}</b></span>
        </p>
        <Button size="sm" className="ml-auto" onClick={(e) => onOpen(today, originOf(e.currentTarget))}><PenLine />{hasToday ? "Open today" : "Write today"}</Button>
      </div>

      <div className="flex items-center gap-1 border-b px-3 py-2">
        <Button variant="ghost" size="icon-sm" aria-label="Previous year" onClick={() => go(inYear(year - 1))}><ChevronLeft /></Button>
        <span className="min-w-12 text-center text-[13px] font-semibold tabular-nums" title={`${yearSum.entries} entries this year`}>{year}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Next year" disabled={year >= Number(thisMonth.slice(0, 4))} onClick={() => go(inYear(year + 1))}><ChevronRight /></Button>
        <ol aria-label="Months" className="ml-1 grid min-w-0 flex-1 grid-cols-12 gap-1">
          {counts.map((n, i) => {
            const m = `${year}-${String(i + 1).padStart(2, "0")}-01`;
            const name = parseYmd(m).toLocaleDateString([], { month: "short" });
            return (
              <li key={m}>
                <button type="button" disabled={m > thisMonth} onClick={() => go(m)} aria-current={m === month ? "true" : undefined}
                  aria-label={`${name} ${year}, ${plural(n, "day")} written`}
                  className={cn("group relative flex h-8 w-full flex-col items-center justify-end overflow-hidden rounded-md border px-0.5 pb-0.5 text-[10px] leading-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30",
                    m === month ? "border-primary/60 bg-primary/10 font-semibold text-foreground" : "border-transparent text-muted-foreground hover:bg-muted")}>
                  <i aria-hidden className="mb-0.5 w-full max-w-5 rounded-[2px] bg-primary/70" style={{ height: n === 0 ? 2 : 3 + Math.round((n / maxCount) * 11), opacity: n === 0 ? 0.25 : 1 }} />
                  {name}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="touch-pan-y select-none px-3 pb-3 pt-2" onPointerDown={down} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} onWheel={wheel}>
        <div className="mb-1 grid grid-cols-7 gap-1.5" aria-hidden>
          {WEEKDAYS.map((d) => <span key={d} className="text-center text-[11px] font-medium text-muted-foreground">{d}</span>)}
        </div>
        <div key={month} className={cn("grid grid-cols-7 gap-1.5", dir === "next" ? "diary-slide-next" : "diary-slide-prev")}>
          {cells.map((day, i) => {
            if (!day) return <span key={`b${i}`} aria-hidden />;
            const info = byDay.get(day);
            const future = day > today;
            const lit = !!info && info.entries > 0;
            const isToday = day === today;
            return (
              <button key={day} type="button" disabled={future} title={dayTitle(day, info)} aria-label={dayTitle(day, info)}
                onClick={(e) => onOpen(day, originOf(e.currentTarget))}
                className={cn(
                  "group relative flex min-h-[5.75rem] flex-col overflow-hidden rounded-xl border p-2 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-30",
                  lit
                    ? cn("bg-gradient-to-br border-primary/40 shadow-sm hover:-translate-y-0.5 hover:border-primary/80 hover:shadow-md", TINT[level(info)])
                    : "border-dashed border-border/70 text-muted-foreground hover:border-solid hover:bg-muted/50",
                  isToday && "ring-2 ring-primary/70 ring-offset-1 ring-offset-card",
                )}>
                <span className="flex items-start justify-between gap-1">
                  <span className={cn("text-[15px] font-semibold tabular-nums leading-none", lit ? "text-primary" : "text-muted-foreground/80")}>{Number(day.slice(8))}</span>
                  {lit ? (
                    <span aria-hidden className="flex gap-0.5 pt-0.5">
                      {Array.from({ length: Math.min(info.entries, 4) }, (_, k) => <i key={k} className="size-1.5 rounded-full bg-primary" />)}
                    </span>
                  ) : isToday ? <span aria-hidden className="text-[10px] font-medium text-primary">Today</span> : null}
                </span>
                {lit && (
                  <>
                    <span aria-hidden className="mt-1.5 line-clamp-2 break-words text-[11px] leading-snug text-foreground/80">{info.snippet}</span>
                    <span aria-hidden className="mt-auto pt-1 text-[10px] tabular-nums text-muted-foreground">{info.words} words</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Slide sideways to change month · a lit tile is a day you wrote · click one to open it</p>
        {infos.length === 0 && <p className="mt-3 rounded-xl border border-dashed p-4 text-center text-[13px] text-muted-foreground">Nothing yet. Press “Write today” to start; each day you write lights a tile.</p>}
      </div>
    </section>
  );
}
