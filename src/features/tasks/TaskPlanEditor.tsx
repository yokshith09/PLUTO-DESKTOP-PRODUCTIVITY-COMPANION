import { useState } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Presets } from "@/components/Presets";
import { dayPresets } from "@/lib/datePresets";
import { CalendarDays, CalendarRange, Check, ExternalLink, Link2, Plus, Repeat2, X } from "lucide-react";
import { MonthCalendar } from "./MonthCalendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRepeatDays, useTaskActions } from "@/hooks/usePluto";
import { parseYmd, ymd } from "@/lib/dates";
import { WEEKDAYS, isoWeekday, repeatLabel } from "@/lib/repeat";
import { cn } from "@/lib/utils";
import type { Repeat, Task, TaskPlan } from "@/ipc";
import { linkLabel, openLink } from "./TaskBits";

// ---- when: one day, chosen days, or repeating (FR-108, FR-109) ------------------------------

export type PlanMode = "one" | "days" | "repeat";
export type PlanState = { mode: PlanMode; days: string[]; repeat: Repeat; until: string };

export function planStateOf(task: Pick<Task, "days" | "repeat" | "repeat_until" | "planned_date">): PlanState {
  const mode: PlanMode = task.repeat ? "repeat" : task.days.length ? "days" : "one";
  const fallback: Repeat = { kind: "weekly", days: task.planned_date ? [isoWeekday(task.planned_date)] : [1] };
  return { mode, days: task.days, repeat: task.repeat ?? fallback, until: task.repeat_until ?? "" };
}

/** What to send to the core for this state. */
export function planOf(s: PlanState): TaskPlan {
  if (s.mode === "days") return { days: s.days, repeat: null, repeat_until: null };
  if (s.mode === "repeat") return { days: [], repeat: s.repeat, repeat_until: s.until || null };
  return { days: [], repeat: null, repeat_until: null };
}

export const samePlan = (a: TaskPlan, b: TaskPlan) => JSON.stringify(a) === JSON.stringify(b);

const short = (d: string) => parseYmd(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

const daysLeft = (due: string, today: string) => {
  const n = Math.round((parseYmd(due).getTime() - parseYmd(today).getTime()) / 86_400_000);
  return n < 0 ? `${-n} ${n === -1 ? "day" : "days"} overdue` : n === 0 ? "Due today" : `${n} ${n === 1 ? "day" : "days"} left`;
};

/**
 * U-3 Schedule card body (owner's reference, 2026-11-03): One day / Chosen days / Repeats, the
 * date fields on the left and a month to click on the right; the deadline sits in the same card
 * and shows on the calendar as a red ring.
 */
export function PlanEditor({ value, onChange, planned, onPlanned, deadline, onDeadline }: {
  value: PlanState; onChange: (s: PlanState) => void; planned: string; onPlanned: (d: string) => void;
  deadline: string; onDeadline: (d: string) => void;
}) {
  const today = ymd(new Date());
  const toggleDay = (d: string) =>
    onChange({ ...value, days: value.days.includes(d) ? value.days.filter((x) => x !== d) : [...value.days, d].sort() });
  const rule = value.repeat;
  const weekly = rule.kind === "weekly" ? rule.days : [];
  const setRule = (repeat: Repeat) => onChange({ ...value, repeat });

  const deadlineField = (
    <div className="space-y-1">
      <label htmlFor="td-due" className="flex items-center gap-1.5 text-xs text-muted-foreground"><i aria-hidden className="size-2 rounded-full bg-destructive" />Deadline</label>
      <div className="flex gap-1.5">
        <Input id="td-due" type="date" value={deadline} onChange={(e) => onDeadline(e.target.value)} aria-label="Deadline date" />
        {deadline && <Button type="button" size="sm" variant="ghost" onClick={() => onDeadline("")}>Clear</Button>}
      </div>
      <p className={cn("text-[11px]", deadline && deadline < today ? "text-destructive" : "text-muted-foreground")}>
        {deadline ? daysLeft(deadline, today) : "The last day it can be done. Optional."}
      </p>
    </div>
  );

  return (
    <div className="space-y-4" role="group" aria-label="When">
      <ToggleGroup type="single" value={value.mode} onValueChange={(m) => m && onChange({ ...value, mode: m as PlanMode })} aria-label="Plan it for"
        className="grid w-full grid-cols-3 gap-1.5 [&>button]:h-9 [&>button]:rounded-lg [&>button]:border [&>button[data-state=on]]:border-primary [&>button[data-state=on]]:bg-primary/12 [&>button[data-state=on]]:text-primary">
        <ToggleGroupItem value="one" className="px-2"><CalendarDays />One day</ToggleGroupItem>
        <ToggleGroupItem value="days" className="px-2"><CalendarRange />Chosen days</ToggleGroupItem>
        <ToggleGroupItem value="repeat" className="px-2"><Repeat2 />Repeats</ToggleGroupItem>
      </ToggleGroup>

      {value.mode !== "repeat" && (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-3 sm:border-r sm:pr-4">
            {value.mode === "one" ? (
              <div className="space-y-1">
                <label htmlFor="td-planned" className="flex items-center gap-1.5 text-xs text-muted-foreground"><i aria-hidden className="size-2 rounded-full bg-primary" />Planned for</label>
                <Input id="td-planned" type="date" value={planned} onChange={(e) => onPlanned(e.target.value)} aria-label="Planned for" />
                <Presets label="Planned day presets" options={dayPresets()} value={planned} onPick={onPlanned} />
                {!planned && <p className="text-[11px] text-muted-foreground">No day: someday. It waits on Tasks, not on Today.</p>}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Click days on the calendar. It shows on Today on each of them; finishing it once finishes it.</p>
            )}
            {deadlineField}
          </div>
          <MonthCalendar
            label="Calendar"
            marked={value.mode === "one" ? (planned ? [planned] : []) : value.days}
            deadline={deadline || null}
            onPick={(d) => (value.mode === "one" ? onPlanned(d === planned ? "" : d) : toggleDay(d))}
          />
        </div>
      )}

      {value.mode === "days" && (
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
          <span className="mr-1 text-xs text-muted-foreground">Selected days ({value.days.length})</span>
          {value.days.length > 0 && (
            <ul className="contents" aria-label="Chosen days">
              {value.days.map((d) => (
                <li key={d} className="flex h-7 items-center gap-0.5 rounded-full border border-primary/60 bg-primary/10 pl-2.5 text-xs text-primary">
                  {short(d)}
                  <ConfirmAction message={`Remove ${short(d)} from the plan?`} verb="Remove" onConfirm={() => toggleDay(d)}>
                    <button type="button" aria-label={`Remove ${short(d)}`} className="grid size-6 place-items-center rounded-full hover:text-foreground"><X className="size-3" /></button>
                  </ConfirmAction>
                </li>
              ))}
            </ul>
          )}
          {value.days.length > 1 && (
            <ConfirmAction message="Clear all chosen days?" verb="Clear" onConfirm={() => onChange({ ...value, days: [] })}>
              <button type="button" className="ml-auto text-xs text-primary underline underline-offset-2">Clear all</button>
            </ConfirmAction>
          )}
        </div>
      )}

      {value.mode === "repeat" && (
        <div className="space-y-3">
          <ToggleGroup type="single" value={rule.kind} onValueChange={(k) => k && setRule(k === "daily" ? { kind: "daily" } : k === "every" ? { kind: "every", n: 2 } : { kind: "weekly", days: weekly.length ? weekly : [1, 3, 5] })} aria-label="Repeat" className="w-full">
            <ToggleGroupItem value="daily" className="flex-1 px-2">Every day</ToggleGroupItem>
            <ToggleGroupItem value="weekly" className="flex-1 px-2">On days of the week</ToggleGroupItem>
            <ToggleGroupItem value="every" className="flex-1 px-2">Every few days</ToggleGroupItem>
          </ToggleGroup>
          {rule.kind === "weekly" && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
              {WEEKDAYS.map((w, i) => {
                const on = weekly.includes(i + 1);
                return (
                  <button key={w} type="button" aria-pressed={on} aria-label={w}
                    onClick={() => setRule({ kind: "weekly", days: on ? weekly.filter((x) => x !== i + 1) : [...weekly, i + 1].sort() })}
                    className={cn("h-8 w-10 rounded-lg border text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-transparent bg-primary font-semibold text-primary-foreground" : "border-border text-muted-foreground")}>
                    {w}
                  </button>
                );
              })}
            </div>
          )}
          {rule.kind === "every" && (
            <label className="flex items-center gap-2 text-xs">Every
              <Input type="number" min={1} max={365} value={rule.n} onChange={(e) => setRule({ kind: "every", n: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} aria-label="Every how many days" className="w-20" />
              days</label>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs text-muted-foreground">Starts
              <Input type="date" value={planned} onChange={(e) => onPlanned(e.target.value)} aria-label="Starts" placeholder="Today" />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">Ends (optional)
              <Input type="date" value={value.until} min={planned || today} onChange={(e) => onChange({ ...value, until: e.target.value })} aria-label="Ends" />
            </label>
            {deadlineField}
          </div>
          <p className="text-xs text-muted-foreground">
            {rule.kind === "weekly" && weekly.length === 0 ? "Pick at least one day." : `${repeatLabel(rule)}. Tick it each day it comes up; ticking one day never touches another.`}
          </p>
        </div>
      )}
    </div>
  );
}

// ---- repeat history: ticked or not, kindly (FR-109, FR-92) ----------------------------------

export function RepeatHistory({ task }: { task: Task }) {
  const { data: days = [] } = useRepeatDays(task.id, !!task.repeat);
  const { tick } = useTaskActions();
  if (!task.repeat || days.length === 0) return null;
  const done = days.filter((d) => d.ticked).length;
  const notTicked = days.filter((d) => !d.ticked && d.day !== ymd(new Date()));
  return (
    <section aria-label="Repeat days" className="rounded-lg border bg-muted/20 p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Repeat2 className="size-3.5" />{repeatLabel(task.repeat)}</h3>
      <p className="mt-1 text-[13px]">Done on <b>{done}</b> of the last {days.length} repeat {days.length === 1 ? "day" : "days"}.</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {days.map((d) => (
          <li key={d.day}>
            <button type="button" aria-pressed={d.ticked} onClick={() => void tick(task.id, d.day, !d.ticked)}
              aria-label={`${short(d.day)}: ${d.ticked ? "ticked" : "not ticked"}. Click to ${d.ticked ? "untick" : "tick"}.`}
              className={cn("flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                d.ticked ? "border-success/40 bg-success/12 text-success" : "border-dashed border-border text-muted-foreground")}>
              {d.ticked && <Check className="size-3" />}{d.day === ymd(new Date()) ? "Today" : short(d.day)}
            </button>
          </li>
        ))}
      </ul>
      {notTicked.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Not ticked: {notTicked.map((d) => short(d.day)).join(", ")}. Did it anyway? Tick the day.
        </p>
      )}
    </section>
  );
}

// ---- links (FR-106) -------------------------------------------------------------------------

export function LinksEditor({ task }: { task: Task }) {
  const { setLinks } = useTaskActions();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const current = task.links.map((l) => ({ url: l.url, title: l.title }));
  const add = async () => {
    if (!url.trim()) return;
    try {
      await setLinks(task.id, [...current, { url: url.trim(), title: name.trim() }]);
      setUrl("");
      setName("");
    } catch { /* the error is already shown above the pet */ }
  };
  return (
    <div className="space-y-2">
      {task.links.length > 0 && (
        <ul className="space-y-1.5" aria-label="Links of this task">
          {task.links.map((l, i) => (
            <li key={l.id} className="flex h-9 items-center gap-2 rounded-lg border bg-muted/30 pl-2.5 pr-1">
              <button type="button" onClick={() => openLink(l.url)} title={l.url} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
                <Link2 className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{linkLabel(l)}</span>
                <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
              </button>
              <ConfirmAction message="Remove this link?" verb="Remove" onConfirm={() => void setLinks(task.id, current.filter((_, j) => j !== i))}>
                <button type="button" aria-label={`Remove link ${linkLabel(l)}`}
                  className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:bg-destructive/15 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"><X className="size-3.5" /></button>
              </ConfirmAction>
            </li>
          ))}
        </ul>
      )}
      <form className="grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link" aria-label="New link" maxLength={2048} className="col-span-2" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Link name" maxLength={200} />
        <Button type="submit" size="sm" variant="secondary" className="h-9" disabled={!url.trim()} aria-label="Add link"><Plus />Add link</Button>
      </form>
    </div>
  );
}
