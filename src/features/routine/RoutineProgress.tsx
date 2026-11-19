import { Check, ChevronLeft, ChevronRight, Pencil, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { dayLabel, parseYmd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  REASON_CHOICES, activeDays, doneByDay, encouragement, habitDays, habitRates, nameOf, reasonTip, reasonTotals, roomLine, roomToGrow,
  skippedOn, weekDays,
} from "./progress";
import { REASON_MAX, TITLE_MAX, renameItem, setReason, toggle, type RoutineState } from "./routine";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const shiftDay = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const short = (day: string) => parseYmd(day).toLocaleDateString([], { month: "short", day: "numeric" });

/** Today as a ring: done of all, never red (owner 2026-11-19: it must not discourage). */
function TodayRing({ done, total }: { done: number; total: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const part = total ? done / total : 0;
  return (
    <div className="relative size-24 shrink-0" role="img" aria-label={`Today: ${done} of ${total} habits done`}>
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--muted)" strokeWidth="7" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * part} ${c}`} className="transition-[stroke-dasharray] duration-500" />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-xl font-semibold tabular-nums leading-none">{done} / {total}</span>
        <span className="mt-1 text-[11px] text-muted-foreground">Today</span>
      </div>
    </div>
  );
}

/** Habits done on each day of the week, as a soft area line; days to come are left open. */
function WeekChart({ values, days, today }: { values: (number | null)[]; days: string[]; today: string }) {
  const W = 220, H = 96, P = 10;
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  const x = (i: number) => P + (i * (W - 2 * P)) / 6;
  const y = (v: number) => H - P - (v / max) * (H - 2 * P - 8);
  const pts = values.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => p !== null);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px} ${py}`).join(" ");
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1]?.[0]} ${H - P} L${pts[0]?.[0]} ${H - P} Z` : "";
  return (
    <figure aria-label="Habits done each day this week" className="m-0">
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full" role="img" aria-label={days.map((d, i) => `${DAY_NAMES[i]}: ${values[i] ?? "to come"}`).join(", ")}>
        <defs>
          <linearGradient id="week-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--primary)" stopOpacity=".35" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={area} fill="url(#week-fill)" />}
        {line && <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />}
        {values.map((v, i) => (v === null
          ? <circle key={days[i]} cx={x(i)} cy={H - P} r="2.5" fill="none" stroke="var(--muted-foreground)" strokeOpacity=".4" strokeDasharray="2 2" />
          : <circle key={days[i]} cx={x(i)} cy={y(v)} r={days[i] === today ? 4.5 : 3.5} fill={days[i] === today ? "var(--primary)" : "var(--card)"} stroke="var(--primary)" strokeWidth="2" />))}
        {DAY_NAMES.map((n, i) => <text key={n} x={x(i)} y={H + 11} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)">{n}</text>)}
      </svg>
    </figure>
  );
}

/**
 * Habit tracker (owner reference 2026-11-19, replaces the Letters look): today as a ring and one
 * plain sentence; each habit with today's tick, its week as dots Monday to Sunday and an Edit;
 * the week as a soft chart; one kind line. Missed days are quiet empty dots, never red or struck
 * through, and days to come never count against you. Below: each habit's last 30 days and the
 * reasons you chose to give.
 */
export function RoutineProgress({ open, onClose, state, today, onChange }: {
  open: boolean; onClose: () => void; state: RoutineState; today: string; onChange: (fn: (s: RoutineState) => RoutineState) => void;
}) {
  // How many weeks back (0 = this week).
  const [page, setPage] = useState(0);
  const [pick, setPick] = useState<{ day: string; id: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const days = weekDays(shiftDay(today, -7 * page));
  const first = days[0] ?? today;
  const last = days[6] ?? today;
  const current = days.includes(today);
  const oldest = Object.keys(state.history).sort()[0] ?? today;
  const total = state.items.length;
  const doneToday = state.done.filter((id) => state.items.some((i) => i.id === id)).length;
  const values = doneByDay(state, days, today);
  const week = activeDays(state, days, today);
  const weekDone = values.reduce<number>((n, v) => n + (v ?? 0), 0);
  const rates = habitRates(state, today);
  const room = roomToGrow(rates);
  const reasons = reasonTotals(state, today);
  const topReason = reasons[0];

  const choose = (day: string, id: string) => { setPick({ day, id }); setDraft(state.reasons[day]?.[id] ?? ""); };
  const save = (text: string | null) => { if (pick) onChange((s) => setReason(s, pick.day, pick.id, text)); setPick(null); };
  const rename = (id: string) => { onChange((s) => renameItem(s, id, editText)); setEditing(null); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setPick(null); setEditing(null); onClose(); } }}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[min(62rem,calc(100vw-2rem))] max-w-none gap-0 overflow-y-auto p-0 sm:max-w-none">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4 pr-12">
          <DialogTitle className="text-[17px] font-semibold tracking-tight">Habit tracker</DialogTitle>
          <DialogDescription className="sr-only">Your daily habits this week</DialogDescription>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Earlier" disabled={first <= oldest} onClick={() => { setPage(page + 1); setPick(null); }}><ChevronLeft /></Button>
            <span className="min-w-32 text-center text-[13px] tabular-nums" aria-live="polite">{current ? "This week" : `${short(first)} – ${short(last)}`}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Later" disabled={page === 0} onClick={() => { setPage(page - 1); setPick(null); }}><ChevronRight /></Button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <section aria-label="Today" className="flex flex-wrap items-center gap-5 rounded-xl border bg-card p-4">
            <TodayRing done={doneToday} total={total} />
            <div className="min-w-48 flex-1">
              <p className="text-[16px] font-semibold">{total === 0 ? "Add a habit to begin" : `${doneToday} of ${total} habits done today`}</p>
              <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Habits done today" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneToday}>
                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${total ? (doneToday / total) * 100 : 0}%` }} />
              </div>
              <p className="mt-2 text-[12.5px] text-muted-foreground">{doneToday >= total && total > 0 ? "All done. Enjoy the rest of the day." : "Fresh again tomorrow, whatever happens today."}</p>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <section aria-label="Your habits" className="rounded-xl border bg-card">
              <div className="flex items-center border-b px-4 py-3">
                <h3 className="text-[14px] font-semibold">Your habits</h3>
                <div className="ml-auto hidden gap-1 pr-[7.5rem] sm:flex" aria-hidden>
                  {DAY_NAMES.map((n) => <span key={n} className="w-6 text-center text-[10.5px] text-muted-foreground">{n.slice(0, 2)}</span>)}
                </div>
              </div>
              {total === 0 && <p className="px-4 py-6 text-[13px] text-muted-foreground">Add a habit on the Daily routine tile and it shows here.</p>}
              <ul className="divide-y">
                {state.items.map((item) => {
                  const doneNow = state.done.includes(item.id);
                  const h = habitDays(state, item.id, days, today);
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-[14px] font-semibold text-primary">{item.title.trim().charAt(0).toUpperCase() || "•"}</span>
                      <div className="min-w-32 flex-1">
                        {editing === item.id ? (
                          <form onSubmit={(e) => { e.preventDefault(); rename(item.id); }}>
                            <input autoFocus value={editText} maxLength={TITLE_MAX} aria-label={`New name for ${item.title}`} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditing(null)} onBlur={() => rename(item.id)}
                              className="h-8 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                          </form>
                        ) : <p className="truncate text-[13.5px] font-semibold">{item.title}</p>}
                        <p className="text-[11.5px] text-muted-foreground">Daily</p>
                      </div>
                      {current && (
                        <button type="button" role="checkbox" aria-checked={doneNow} aria-label={`${item.title} today`} onClick={() => onChange((s) => toggle(s, item.id))}
                          className={cn("grid size-8 shrink-0 place-items-center rounded-full border-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", doneNow ? "border-primary bg-primary text-primary-foreground" : "border-primary/50 hover:bg-primary/10")}>
                          {doneNow && <Check className="size-4" strokeWidth={3} />}
                        </button>
                      )}
                      <div role="group" aria-label={`${item.title}, week of ${dayLabel(parseYmd(first))}`} className="flex gap-1">
                        {days.map((d, i) => {
                          const ok = (d === today ? state.done : (state.history[d] ?? [])).includes(item.id);
                          const missed = skippedOn(state, d, today).includes(item.id);
                          const reason = state.reasons[d]?.[item.id];
                          const future = d > today;
                          const label = `${item.title}, ${dayLabel(parseYmd(d))}: ${ok ? "done" : future ? "still to come" : d === today ? "still open today" : missed ? (reason ? `not done, ${reason}` : "not done, add a note if you like") : "not recorded"}`;
                          const dot = cn("grid size-6 place-items-center rounded-full",
                            ok ? "bg-primary" : future ? "border border-dashed border-muted-foreground/40" : d === today ? "border-2 border-primary/60" : "border-2 border-muted-foreground/25",
                            pick?.day === d && pick.id === item.id && "ring-2 ring-primary ring-offset-1 ring-offset-card");
                          return missed ? (
                            <button key={d} type="button" aria-label={label} title={label} onClick={() => choose(d, item.id)} className={cn(dot, "relative outline-none hover:border-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring")}>
                              <span className="sr-only">{DAY_NAMES[i]}</span>
                              {reason && <i aria-hidden className="size-1.5 rounded-full bg-muted-foreground/60" />}
                            </button>
                          ) : <span key={d} role="img" aria-label={label} title={label} className={dot} />;
                        })}
                      </div>
                      <span className="w-14 shrink-0 text-right text-[12.5px] tabular-nums text-muted-foreground" title="Days done of the days so far this week">{h.done} of {Math.max(h.counted, h.done)}</span>
                      <Button variant="outline" size="sm" className="h-7 shrink-0 px-2 text-[12px]" aria-label={`Edit ${item.title}`} onClick={() => { setEditing(item.id); setEditText(item.title); }}><Pencil className="size-3" />Edit</Button>
                    </li>
                  );
                })}
              </ul>
              {pick && (
                <div role="group" aria-label="What got in the way?" className="m-4 mt-0 space-y-2.5 rounded-xl border bg-muted/40 p-3.5">
                  <p className="text-[13.5px] font-semibold">{nameOf(state, pick.id)} · {dayLabel(parseYmd(pick.day))}</p>
                  <p className="text-[12.5px] text-muted-foreground">Want to note what got in the way? Totally optional.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REASON_CHOICES.map((r) => (
                      <button key={r} type="button" aria-pressed={draft === r} onClick={() => setDraft(draft === r ? "" : r)}
                        className={cn("rounded-full border px-3 py-1 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring", draft === r ? "border-primary bg-primary/15" : "hover:bg-accent")}>{r}</button>
                    ))}
                  </div>
                  <input value={draft} maxLength={REASON_MAX} onChange={(e) => setDraft(e.target.value)} placeholder="Or in your own words" aria-label="Reason in your own words"
                    className="h-8 w-full rounded-md border bg-background px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => save(null)}>No reason</Button>
                    <Button variant="outline" size="sm" onClick={() => setPick(null)}>Close</Button>
                    <Button size="sm" onClick={() => save(draft)}>Save</Button>
                  </div>
                </div>
              )}
              <p className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2.5 text-[11.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><i aria-hidden className="size-2.5 rounded-full bg-primary" />Done</span>
                <span className="flex items-center gap-1.5"><i aria-hidden className="size-2.5 rounded-full border-2 border-muted-foreground/25" />Not done (tap to add a note, optional)</span>
                <span className="flex items-center gap-1.5"><i aria-hidden className="size-2.5 rounded-full border border-dashed border-muted-foreground/40" />To come</span>
              </p>
            </section>

            <div className="space-y-4">
              <section aria-label="This week" className="rounded-xl border bg-card p-4">
                <h3 className="mb-2 text-[14px] font-semibold">{current ? "This week" : "That week"}</h3>
                <WeekChart values={values} days={days} today={today} />
                <p className="mt-2 text-center text-[20px] font-semibold tabular-nums">{weekDone}</p>
                <p className="text-center text-[12px] text-muted-foreground">{weekDone === 1 ? "habit" : "habits"} done{week.sofar ? `, on ${week.active} of ${week.sofar} ${week.sofar === 1 ? "day" : "days"} so far` : ""}</p>
              </section>
              <section aria-label="A kind word" className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/[0.07] p-4">
                <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-[13px]">{encouragement(state, today)}</p>
              </section>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section aria-label="Each routine" className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Each habit, last 30 days</h3>
              {rates.length === 0 ? <p className="text-[13px] text-muted-foreground">Add a habit and it shows up here.</p> : (
                <ul className="space-y-2.5">
                  {rates.map((r) => (
                    <li key={r.id}>
                      <div className="flex items-baseline gap-2 text-[13px]">
                        <span className="min-w-0 flex-1 truncate">{r.title}</span>
                        <span className="w-12 shrink-0 text-right tabular-nums">{r.done}/{r.planned}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><i className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(r.rate * 100)}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
              {room && <p className="mt-3 flex items-start gap-2 text-[13px]"><Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />{roomLine(room)}</p>}
            </section>

            <section aria-label="What got in the way" className="rounded-xl border bg-card p-4">
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">What got in the way, last 30 days</h3>
              {reasons.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Nothing noted yet. Tap an empty dot to say why, only if you want to.</p>
              ) : (
                <ul className="space-y-1.5">
                  {reasons.map((r) => (
                    <li key={r.reason} className="grid grid-cols-[8rem_1fr_1.5rem] items-center gap-2.5 text-[13px]">
                      <span className="truncate">{r.reason}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-muted"><i className="block h-full rounded-full bg-muted-foreground/50" style={{ width: `${(r.count / (topReason?.count ?? 1)) * 100}%` }} /></span>
                      <b className="tabular-nums">{r.count}</b>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 rounded-lg bg-primary/[0.08] px-3 py-2 text-[13px]">{reasonTip(topReason)}</p>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
