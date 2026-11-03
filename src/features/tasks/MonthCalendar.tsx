import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { parseYmd, ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The days of `month` (its 1st, as YYYY-MM-01) laid out in weeks from Sunday; blanks are null. */
export function monthGrid(month: string): (string | null)[] {
  const first = parseYmd(month);
  const blanks = first.getDay();
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const days: (string | null)[] = Array.from({ length: blanks }, () => null);
  for (let d = 1; d <= count; d++) days.push(ymd(new Date(first.getFullYear(), first.getMonth(), d)));
  while (days.length % 7) days.push(null);
  return days;
}

export const monthOf = (day: string) => `${day.slice(0, 7)}-01`;
export function addMonths(month: string, n: number): string {
  const d = parseYmd(month);
  return ymd(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

/**
 * U-3 (owner's reference, 2026-11-03): a month to click days on. Planned days are filled, the
 * deadline has a red ring, today an outline. What a click does is up to the caller.
 */
export function MonthCalendar({ marked, deadline, onPick, label }: {
  marked: string[]; deadline: string | null; onPick: (day: string) => void; label: string;
}) {
  const today = ymd(new Date());
  const [month, setMonth] = useState(() => monthOf(marked[0] ?? today));
  const title = parseYmd(month).toLocaleDateString([], { month: "long", year: "numeric" });
  return (
    <div role="group" aria-label={label} className="space-y-1.5">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}
          className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><ChevronLeft className="size-4" /></button>
        <p className="text-[13px] font-semibold" aria-live="polite">{title}</p>
        <button type="button" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}
          className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><ChevronRight className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center tabular-nums">
        {DAY_NAMES.map((n) => <span key={n} aria-hidden className="pb-0.5 text-[11px] text-muted-foreground">{n}</span>)}
        {monthGrid(month).map((d, i) => {
          if (!d) return <span key={`b${i}`} aria-hidden />;
          const on = marked.includes(d);
          const due = d === deadline;
          const full = parseYmd(d).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
          return (
            <button key={d} type="button" aria-pressed={on} onClick={() => onPick(d)}
              aria-label={`${full}${due ? ", deadline" : ""}${d === today ? ", today" : ""}`}
              className={cn(
                "h-7 rounded-md text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                on ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-accent",
                !on && due && "font-semibold text-destructive ring-[1.5px] ring-inset ring-destructive",
                !on && !due && d === today && "font-semibold ring-1 ring-inset ring-border",
                !on && !due && d < today && "text-muted-foreground/70",
              )}>
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><i aria-hidden className="size-2.5 rounded-[3px] bg-primary" />Planned</span>
        <span className="flex items-center gap-1"><i aria-hidden className="size-2.5 rounded-[3px] ring-[1.5px] ring-inset ring-destructive" />Deadline</span>
      </p>
    </div>
  );
}
