import { useState } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Bell, BellOff, Check, Plus, Repeat, X } from "lucide-react";
import { Tile } from "@/features/shell/PageHeader";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addItem, pending, removeItem, renameItem, toggle, weekCount, MAX_ITEMS, TITLE_MAX } from "./routine";
import { useRoutine } from "./useRoutine";

/**
 * Daily routine tile (FR-85): things you do every day, ticked off and fresh again tomorrow,
 * with a reminder when some are left.
 */
export function RoutineCard({ className }: { className?: string }) {
  const { state, today, apply } = useRoutine();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const left = pending(state).length;
  const total = state.items.length;

  const add = () => {
    if (!draft.trim()) return;
    void apply((s) => addItem(s, draft, `${Date.now()}`));
    setDraft("");
  };
  const remind = state.remind;

  return (
    <Tile
      className={className}
      title="Daily routine"
      count={total ? `${total - left} of ${total}` : 0}
      action={
        <button
          type="button"
          aria-label={remind.on ? `Reminder at ${remind.at}, turn off` : "Reminder off, turn on"}
          aria-pressed={remind.on}
          title={remind.on ? `Reminds you at ${remind.at} if anything is left` : "Reminder off"}
          onClick={() => void apply((s) => ({ ...s, remind: { ...s.remind, on: !s.remind.on } }))}
          className="grid size-7 place-items-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {remind.on ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        {total > 0 && (
          <div className="flex items-center gap-3 px-1">
            <div className="min-w-0 flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Routine done today" aria-valuemin={0} aria-valuemax={total} aria-valuenow={total - left}>
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? ((total - left) / total) * 100 : 0}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground" aria-live="polite">
                <span>{total - left} of {total} done</span> · {left === 0 ? "all done for today" : "fresh again tomorrow"}
              </p>
            </div>
            {remind.on && (
              <label className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                Remind at
                <input
                  type="time" value={remind.at} aria-label="Routine reminder time"
                  onChange={(e) => e.target.value && void apply((s) => ({ ...s, remind: { ...s.remind, at: e.target.value }, remindedOn: null }))}
                  className="h-6 rounded border border-input bg-card px-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            )}
          </div>
        )}

        <ul className="max-h-[22rem] divide-y overflow-y-auto" aria-label="Routine items">
          {state.items.map((item) => {
            const done = state.done.includes(item.id);
            const days = weekCount(state, item.id, today);
            return (
              <li key={item.id} className="group flex items-start gap-2 px-1 py-1.5 hover:bg-accent/50">
                <button
                  type="button" role="checkbox" aria-checked={done} aria-label={item.title}
                  onClick={() => void apply((s) => toggle(s, item.id))}
                  className={cn("mt-px grid size-5 shrink-0 place-items-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", done ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-primary")}
                >
                  {done && <Check className="size-3" strokeWidth={3} />}
                </button>
                {editing === item.id ? (
                  <form className="flex-1" onSubmit={(e) => { e.preventDefault(); void apply((s) => renameItem(s, item.id, editText)); setEditing(null); }}>
                    <Input
                      autoFocus value={editText} maxLength={TITLE_MAX} aria-label="Rename routine item"
                      onChange={(e) => setEditText(e.target.value)} onBlur={() => setEditing(null)}
                      onKeyDown={(e) => e.key === "Escape" && setEditing(null)} className="h-7 text-[13px]"
                    />
                  </form>
                ) : (
                  <button
                    type="button" onDoubleClick={() => { setEditing(item.id); setEditText(item.title); }}
                    title="Double-click to rename"
                    className={cn("min-w-0 flex-1 break-words text-left text-[13px] leading-5 [overflow-wrap:anywhere]", done && "text-muted-foreground line-through")}
                  >
                    {item.title}
                  </button>
                )}
                {/* FR-90: "5/7" this week, never a streak that resets (no-guilt rule). */}
                <span className="shrink-0 text-[11px] leading-5 tabular-nums text-muted-foreground" title={`Done on ${days} of the last 7 days`}>
                  {days > 0 ? `${days}/7` : "—"}
                </span>
                <ConfirmAction message={`Remove “${item.title}” from the routine?`} verb="Remove" onConfirm={() => void apply((s) => removeItem(s, item.id))}>
                <button
                  type="button" aria-label={`Remove ${item.title}`}
                  className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground opacity-0 outline-none hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 data-[state=open]:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
                </ConfirmAction>
              </li>
            );
          })}
        </ul>

        {total === 0 && (
          <div className="grid flex-1 place-items-center px-4 text-center">
            <div>
              <span className="mx-auto mb-2 grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><Repeat className="size-4" /></span>
              <p className="text-[13px] font-medium">No routine yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Add what you do every day: water, revision, a walk. It resets each morning.</p>
            </div>
          </div>
        )}

        {total < MAX_ITEMS && (
          <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <Input value={draft} maxLength={TITLE_MAX} onChange={(e) => setDraft(e.target.value)} placeholder="Add a daily habit" aria-label="New routine item" className="h-8 text-[13px]" />
            <button type="submit" aria-label="Add routine item" className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring">
              <Plus className="size-4" />
            </button>
          </form>
        )}
      </div>
    </Tile>
  );
}
