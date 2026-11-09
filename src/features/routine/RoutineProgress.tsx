import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { dayLabel, parseYmd, ymd } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { REASON_CHOICES, dayStat, encouragement, habitRates, nameOf, reasonTip, reasonTotals, roomLine, roomToGrow, skippedOn, weekLine, weekVsWeek } from "./progress";
import { REASON_MAX, setReason, type RoutineState } from "./routine";

/** Days on one path of stepping stones. */
const STONES = 14;
const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

/**
 * Your routine over time (FR-114, U-8; the stepping-stones look chosen by the owner 2026-11-09):
 * one path of stones per routine, newest on the right. A filled stone is a day you did it; a hollow
 * one is a day it was skipped, and you can say why (optional). Below: the week against the week
 * before, each routine's last 30 days, and the reasons you gave. The words are only ever
 * encouraging: what went well, and one small next step.
 */
export function RoutineProgress({ open, onClose, state, today, onChange }: {
  open: boolean; onClose: () => void; state: RoutineState; today: string; onChange: (fn: (s: RoutineState) => RoutineState) => void;
}) {
  // How many 14-day pages back the paths are showing (0 = ending today).
  const [page, setPage] = useState(0);
  const [pick, setPick] = useState<{ day: string; id: string } | null>(null);
  const [draft, setDraft] = useState("");
  const end = addDays(today, -page * STONES);
  const days = Array.from({ length: STONES }, (_, i) => addDays(end, i - (STONES - 1)));
  const week = weekVsWeek(state, today);
  const rates = habitRates(state, today);
  const room = roomToGrow(rates);
  const reasons = reasonTotals(state, today);
  const topReason = reasons[0];
  const maxWeek = Math.max(1, week.thisWeek.planned, week.lastWeek.planned);
  const oldest = Object.keys(state.history).sort()[0] ?? today;

  const choose = (day: string, id: string) => {
    setPick({ day, id });
    setDraft(state.reasons[day]?.[id] ?? "");
  };
  const save = (text: string | null) => {
    if (pick) onChange((s) => setReason(s, pick.day, pick.id, text));
    setPick(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setPick(null); onClose(); } }}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[min(52rem,calc(100vw-2rem))] max-w-none gap-0 overflow-y-auto p-0 sm:max-w-none">
        <div className="border-b bg-gradient-to-b from-primary/[0.08] to-transparent px-5 pb-4 pt-5 pr-12">
          <DialogTitle className="text-[17px] font-semibold tracking-tight">Your routine</DialogTitle>
          <DialogDescription className="mt-1 flex items-start gap-2 text-[14px] text-foreground">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{encouragement(state, today)}</span>
          </DialogDescription>
        </div>

        <div className="space-y-4 p-5">
          <section aria-label="Stepping stones" className="rounded-xl border bg-card p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                {page === 0 ? "Last 14 days" : `${dayLabel(parseYmd(days[0] ?? end))} to ${dayLabel(parseYmd(end))}`}, one path per routine
              </h3>
              <span className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" disabled={(days[0] ?? end) <= oldest} onClick={() => { setPage(page + 1); setPick(null); }}>Earlier</Button>
                <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => { setPage(page - 1); setPick(null); }}>Later</Button>
              </span>
            </div>
            {state.items.length === 0 && <p className="py-3 text-[13px] text-muted-foreground">Add a routine and its path starts here.</p>}
            <ul>
              {state.items.map((item) => {
                const stats = days.map((d) => dayStat(state, d, today));
                const planned = stats.filter((st, i) => st.planned?.includes(item.id) && (days[i] !== today || st.done.includes(item.id)));
                const done = planned.filter((st) => st.done.includes(item.id)).length;
                const y = (i: number) => 24 + Math.sin(i * 0.8 + (item.id.length % 5)) * 8;
                return (
                  <li key={item.id} className="grid grid-cols-[9.5rem_1fr_auto] items-center gap-3 border-t py-2.5 first:border-t-0 max-sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold">{item.title}</p>
                      <p className="text-[11.5px] text-muted-foreground">{planned.length ? `${done} of ${planned.length} days` : "no days recorded"}</p>
                    </div>
                    <div role="group" aria-label={`${item.title}, ${days.length} days`} className="relative h-12 min-w-0 max-sm:order-3 max-sm:col-span-2">
                      <svg aria-hidden viewBox="0 0 100 48" preserveAspectRatio="none" className="absolute inset-0 size-full">
                        <path d={days.map((_, i) => `${i ? "L" : "M"}${(2 + (i * 96) / (STONES - 1)).toFixed(2)} ${y(i).toFixed(2)}`).join(" ")} fill="none" stroke="currentColor" className="text-border" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                      </svg>
                      {days.map((d, i) => {
                        const st = stats[i];
                        if (!st) return null;
                        const isToday = d === today;
                        const wasPlanned = !!st.planned?.includes(item.id);
                        const ok = st.done.includes(item.id);
                        const skipped = skippedOn(state, d, today).includes(item.id);
                        const reason = state.reasons[d]?.[item.id];
                        const when = dayLabel(parseYmd(d));
                        const label = `${item.title}, ${when}: ${ok ? "done" : skipped ? (reason ? `skipped, ${reason}` : "skipped, add a reason") : isToday && wasPlanned ? "still open today" : "not recorded"}`;
                        const pos = { left: `${2 + (i * 96) / (STONES - 1)}%`, top: `${(y(i) / 48) * 100}%` };
                        const shape = cn("absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full",
                          ok ? "bg-primary" : skipped ? "border-2 border-dashed border-muted-foreground/70 bg-card" : wasPlanned ? "border-2 border-primary/50 bg-card" : "size-2 bg-border",
                          isToday && "ring-2 ring-primary/70 ring-offset-2 ring-offset-card",
                          pick?.day === d && pick.id === item.id && "ring-2 ring-amber-400 ring-offset-2 ring-offset-card");
                        return skipped ? (
                          <button key={d} type="button" aria-label={label} title={label} style={pos} onClick={() => choose(d, item.id)}
                            className={cn(shape, "cursor-pointer outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring")}>
                            {reason && <i aria-hidden className="absolute -right-0.5 -top-1 size-2 rounded-full bg-amber-400" />}
                          </button>
                        ) : (
                          <span key={d} role="img" aria-label={label} title={label} style={pos} className={shape} />
                        );
                      })}
                    </div>
                    <p className="w-10 text-right text-[15px] font-bold tabular-nums">{planned.length ? `${Math.round((done / planned.length) * 100)}%` : ""}</p>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
              <span><i aria-hidden className="mr-1.5 inline-block size-2.5 rounded-full bg-primary align-[-1px]" />Done</span>
              <span><i aria-hidden className="mr-1.5 inline-block size-2.5 rounded-full border border-dashed border-muted-foreground align-[-1px]" />Skipped: tap to say why (optional)</span>
              <span><i aria-hidden className="mr-1.5 inline-block size-2.5 rounded-full bg-amber-400 align-[-1px]" />Has a reason</span>
            </div>

            {pick && (
              <div role="group" aria-label="What got in the way?" className="mt-3 space-y-2.5 rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-3.5">
                <p className="text-[13.5px] font-semibold">{nameOf(state, pick.id)} · {dayLabel(parseYmd(pick.day))}</p>
                <p className="text-[12.5px] text-muted-foreground">What got in the way? Totally optional.</p>
                <div className="flex flex-wrap gap-1.5">
                  {REASON_CHOICES.map((r) => (
                    <button key={r} type="button" aria-pressed={draft === r} onClick={() => setDraft(draft === r ? "" : r)}
                      className={cn("rounded-full border px-3 py-1 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring", draft === r ? "border-amber-400 bg-amber-400/20" : "hover:bg-accent")}>{r}</button>
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


          <section aria-label="What got in the way" className="rounded-xl border bg-card p-4">
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">What got in the way, last 30 days</h3>
            {reasons.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nothing noted yet. When a day is skipped, tap its hollow stone to say why, only if you want to.</p>
            ) : (
              <ul className="space-y-1.5">
                {reasons.map((r) => (
                  <li key={r.reason} className="grid grid-cols-[8rem_1fr_1.5rem] items-center gap-2.5 text-[13px]">
                    <span className="truncate">{r.reason}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted"><i className="block h-full rounded-full bg-amber-400" style={{ width: `${(r.count / (topReason?.count ?? 1)) * 100}%` }} /></span>
                    <b className="tabular-nums">{r.count}</b>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 rounded-lg bg-primary/[0.08] px-3 py-2 text-[13px]">{reasonTip(topReason)}</p>
          </section>

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
