import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronLeft, ChevronRight, ListPlus, Plus, Trash2, X } from "lucide-react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { errorMessage, ipc, type DiaryEntry } from "@/ipc";
import { dayLabel, parseYmd, ymd } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { detectTodos, titleOf } from "./detect";

const SAVE_AFTER_MS = 400;
/** Where the tile you clicked sits on screen: the card flips open out of that place. */
export type Origin = { x: number; y: number; w: number; h: number };
const CARD_W = 704;
let counter = 0;
/** A new, empty entry; the id only has to be unique within its day. */
export const newEntry = (): DiaryEntry => ({ id: `${Date.now().toString(36)}${(counter++).toString(36)}`, at: Date.now(), text: "" });

const timeOf = (at: number) => (at > 0 ? new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Earlier entry");
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/**
 * One day, opened from the calendar: every entry of that day as its own note, a button to add
 * another, and the same quiet extras as before (spot to-dos, make a task from a selection).
 * Saved by itself a moment after you stop typing, as the whole day.
 */
export function DayCard({ day, from, onClose, onDay, onChanged, pickup, onPickup }: {
  day: string | null; from: Origin | null; onClose: () => void; onDay: (day: string) => void; onChanged: () => void; pickup: boolean; onPickup: (on: boolean) => void;
}) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [made, setMade] = useState<Record<string, string>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const areas = useRef(new Map<string, HTMLTextAreaElement>());
  const pending = useRef<{ day: string; entries: DiaryEntry[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setSaved("saving");
    try { await ipc.diaryEntriesSave(p.day, p.entries); setSaved("saved"); onChanged(); } catch (e) { notify.error(errorMessage(e)); }
  }, [onChanged]);

  useEffect(() => {
    if (!day) return;
    let live = true;
    setLoaded(false); setMade({}); setSaved("idle");
    void flush().then(() => ipc.diaryEntries(day)).then((list) => {
      if (!live) return;
      const first = list.length ? list : [newEntry()];
      setEntries(first); setLoaded(true);
      // Land in the entry you are most likely to write in: the last one.
      setFocusId(first[first.length - 1]?.id ?? null);
    }).catch((e) => notify.error(errorMessage(e)));
    return () => { live = false; };
  }, [day, flush]);
  useEffect(() => () => { void flush(); }, [flush]);
  useEffect(() => {
    if (focusId && loaded) { areas.current.get(focusId)?.focus(); setFocusId(null); }
  }, [focusId, loaded, entries]);

  const change = (next: DiaryEntry[], now = false) => {
    setEntries(next);
    if (!day) return;
    pending.current = { day, entries: next };
    setSaved("idle");
    clearTimeout(timer.current);
    if (now) void flush(); else timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
  };
  const edit = (id: string, text: string) => change(entries.map((e) => (e.id === id ? { ...e, text } : e)));
  const add = () => { const e = newEntry(); change([...entries, e]); setFocusId(e.id); };
  const remove = (id: string) => {
    const rest = entries.filter((e) => e.id !== id);
    change(rest.length ? rest : [newEntry()], true);
  };
  const shift = (n: number) => { if (!day) return; const d = parseYmd(day); d.setDate(d.getDate() + n); onDay(ymd(d)); };
  const today = ymd(new Date());

  const makeTask = async (key: string, title: string, due: string | null) => {
    try {
      const t = await ipc.taskQuickAdd(title);
      if (due) await ipc.taskUpdate(t.id, { title: t.title, description: t.description, project: t.project, priority: t.priority, planned_date: t.planned_date, due_date: due, note_id: t.note_id });
      setMade((m) => ({ ...m, [key]: t.title }));
      notify.success(`Task added: “${t.title}”`);
    } catch (e) { notify.error(errorMessage(e)); }
  };
  const fromSelection = (e: DiaryEntry) => {
    const el = areas.current.get(e.id);
    const sel = el ? e.text.slice(el.selectionStart, el.selectionEnd).trim() : "";
    if (!sel) return notify.info("Select some text first");
    void makeTask(`sel:${sel}`, titleOf(sel) || sel.slice(0, 300), detectTodos(sel, new Date())[0]?.due ?? null);
  };

  const real = entries.filter((e) => e.text.trim()).length;
  const total = entries.reduce((n, e) => n + words(e.text), 0);
  const date = day ? parseYmd(day) : null;
  // The card starts as the tile you clicked (its place and size) turned edge-on, then flips open.
  const flip = from && typeof window !== "undefined"
    ? ({
      "--fx": `${from.x + from.w / 2 - window.innerWidth / 2}px`,
      "--fy": `${from.y + from.h / 2 - window.innerHeight / 2}px`,
      "--fs": String(Math.min(1, Math.max(0.08, from.w / Math.min(CARD_W, window.innerWidth - 32)))),
    } as CSSProperties)
    : undefined;
  return (
    <Dialog open={day !== null} onOpenChange={(o) => { if (!o) { void flush(); onClose(); } }}>
      <DialogContent showClose={false} className="flex max-h-[calc(100vh-2rem)] w-[min(44rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none [perspective:1500px] sm:max-w-none data-[state=open]:animate-none">
        <div key={day ?? ""} style={flip} className={cn("flex max-h-[calc(100vh-2rem)] min-h-0 flex-col overflow-hidden rounded-2xl border bg-popover shadow-2xl shadow-black/40", from ? "diary-flip" : "diary-turn")}>
          <div className="flex items-center gap-3 border-b bg-gradient-to-b from-primary/[0.09] to-transparent px-4 pb-3 pt-4">
            {date && (
              <div aria-hidden className="grid w-14 shrink-0 overflow-hidden rounded-xl border bg-card text-center shadow-sm">
                <span className="bg-primary px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">{date.toLocaleDateString([], { month: "short" })}</span>
                <span className="py-1.5 text-2xl font-semibold leading-none tabular-nums">{date.getDate()}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-[17px] font-semibold tracking-tight">{day ? dayLabel(parseYmd(day)) : ""}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {date ? `${date.getFullYear()} · ${real === 0 ? "No entries yet" : real === 1 ? "1 entry" : `${real} entries`}` : ""}
              </DialogDescription>
              {total > 0 && <span className="mt-1 inline-block rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-primary">{total} words today</span>}
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Previous day" onClick={() => shift(-1)}><ChevronLeft /></Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next day" disabled={!day || day >= today} onClick={() => shift(1)}><ChevronRight /></Button>
            <Button variant="ghost" size="icon-sm" aria-label="Close day" onClick={() => { void flush(); onClose(); }}><X /></Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <ol className="relative space-y-3 pl-6 before:absolute before:bottom-3 before:left-[6px] before:top-3 before:w-px before:bg-border">
              {entries.map((e, i) => {
                const todos = pickup ? detectTodos(e.text, new Date()) : [];
                return (
                  <li key={e.id} className="relative">
                    <i aria-hidden className="absolute -left-6 top-4 size-3.5 rounded-full border-2 border-primary bg-popover" />
                    <section aria-label={`Entry ${i + 1}`} className="rounded-xl border border-l-[3px] border-l-primary/60 bg-card p-3 shadow-sm">
                      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">Entry {i + 1}</span>
                        <span>{timeOf(e.at)}</span>
                        <span className="ml-auto tabular-nums">{words(e.text)} words</span>
                        {(entries.length > 1 || e.text.trim()) && (
                          <ConfirmAction message="Delete this entry? It cannot be brought back." onConfirm={() => remove(e.id)}>
                            <button type="button" aria-label={`Delete entry ${i + 1}`} className="grid size-6 place-items-center rounded text-muted-foreground outline-none hover:bg-destructive/15 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"><Trash2 className="size-3.5" /></button>
                          </ConfirmAction>
                        )}
                      </div>
                      <textarea
                        ref={(el) => { if (el) areas.current.set(e.id, el); else areas.current.delete(e.id); }}
                        value={e.text} disabled={!loaded} onChange={(ev) => edit(e.id, ev.target.value)} aria-label={`Entry ${i + 1} text`}
                        placeholder={i === 0 ? "How was your day?" : "Another thought…"} maxLength={50_000}
                        className="field-sizing-content min-h-24 max-h-[50vh] w-full resize-none rounded-lg bg-transparent px-1 py-1 text-[15px] leading-[1.7] outline-none placeholder:text-muted-foreground"
                      />
                      <div className="flex items-center">
                        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => fromSelection(e)}><ListPlus />Make task from selection</Button>
                      </div>
                      {todos.length > 0 && (
                        <ul aria-label={`Things that look like to-dos in entry ${i + 1}`} className="mt-1 space-y-1 border-t pt-2">
                          {todos.map((t) => (
                            <li key={t.line} className="flex items-center gap-2 text-[13px]">
                              <span className="min-w-0 flex-1 truncate underline decoration-primary/60 decoration-dotted underline-offset-4">{t.title}{t.due ? ` · ${t.due}` : ""}</span>
                              {made[`${e.id}:${t.text}`] ? <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"><Check aria-hidden className="size-3" />Task made</span>
                                : <Button size="sm" variant="outline" onClick={() => void makeTask(`${e.id}:${t.text}`, t.title, t.due)}>Make task</Button>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </li>
                );
              })}
              <li className="relative">
                <i aria-hidden className="absolute -left-6 top-3 grid size-3.5 place-items-center rounded-full border-2 border-dashed border-muted-foreground/60 bg-popover" />
                <Button variant="outline" className="w-full border-dashed" disabled={!loaded || entries.length >= 30} onClick={add}><Plus />Add another entry</Button>
              </li>
            </ol>
          </div>

          <div className="flex items-center gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
            <label className="flex items-center gap-2" title="Underlines lines like “I need to submit… by Friday”. It all happens on this computer.">
              <Switch checked={pickup} onCheckedChange={onPickup} aria-label="Spot things to do" />Spot things to do
            </label>
            <span aria-live="polite" className="ml-1">{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : ""}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { void flush(); onClose(); }}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
