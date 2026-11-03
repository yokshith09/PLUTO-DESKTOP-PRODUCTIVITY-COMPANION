import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ListPlus, Plus, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { errorMessage, ipc, type DiaryEntry } from "@/ipc";
import { dayLabel, parseYmd, ymd } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { detectTodos, titleOf } from "./detect";

const SAVE_AFTER_MS = 400;
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
export function DayCard({ day, onClose, onDay, onChanged, pickup, onPickup }: {
  day: string | null; onClose: () => void; onDay: (day: string) => void; onChanged: () => void; pickup: boolean; onPickup: (on: boolean) => void;
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
  return (
    <Dialog open={day !== null} onOpenChange={(o) => { if (!o) { void flush(); onClose(); } }}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(44rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <div className="flex items-center gap-1 border-b px-4 pb-3 pt-4 pr-12">
          <Button variant="ghost" size="icon-sm" aria-label="Previous day" onClick={() => shift(-1)}><ChevronLeft /></Button>
          <div className="min-w-0 flex-1 text-center">
            <DialogTitle className="truncate text-[17px] font-semibold tracking-tight">{day ? dayLabel(parseYmd(day)) : ""}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {day ? `${parseYmd(day).getFullYear()} · ${real === 0 ? "No entries yet" : real === 1 ? "1 entry" : `${real} entries`}` : ""}
            </DialogDescription>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Next day" disabled={!day || day >= today} onClick={() => shift(1)}><ChevronRight /></Button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {entries.map((e, i) => {
            const todos = pickup ? detectTodos(e.text, new Date()) : [];
            return (
              <section key={e.id} aria-label={`Entry ${i + 1}`} className="rounded-xl border bg-card p-3">
                <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Entry {i + 1}</span>
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
                  className="field-sizing-content min-h-28 max-h-[55vh] w-full resize-none rounded-lg bg-transparent px-1 py-1 text-[15px] leading-[1.7] outline-none placeholder:text-muted-foreground"
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
            );
          })}
          <Button variant="outline" className="w-full border-dashed" disabled={!loaded || entries.length >= 30} onClick={add}><Plus />Add another entry</Button>
        </div>

        <div className="flex items-center gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-2" title="Underlines lines like “I need to submit… by Friday”. It all happens on this computer.">
            <Switch checked={pickup} onCheckedChange={onPickup} aria-label="Spot things to do" />Spot things to do
          </label>
          <span aria-live="polite" className="ml-1">{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : ""}</span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { void flush(); onClose(); }}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
