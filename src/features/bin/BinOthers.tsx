import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { errorMessage, ipc } from "@/ipc";
import { notify } from "@/lib/notify";

const when = (ms: number) => new Date(ms).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One kind of thing in the Bin: restore, or delete for good. */
function Section({ label, title, items, onRestore, onPurge, invalidate }: {
  label: string; title: string; items: { id: string; title: string; at: number }[];
  onRestore: (id: string) => Promise<unknown>; onPurge: (id: string) => Promise<unknown>; invalidate: string[][];
}) {
  const qc = useQueryClient();
  if (items.length === 0) return null;
  const act = async (p: Promise<unknown>, done: string) => {
    try {
      await p;
      await Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
      notify.info(done);
    } catch (e) {
      notify.error(errorMessage(e));
    }
  };
  return (
    <section aria-label={label} className="mt-4">
      <h2 className="mb-2 text-[13px] font-semibold">{title} <span className="font-normal text-muted-foreground">· kept 30 days</span></h2>
      <ul className="divide-y rounded-lg border">
        {items.map((x) => (
          <li key={x.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate">{x.title}</span>
            <span className="shrink-0 text-[12px] text-muted-foreground">{when(x.at)}</span>
            <Button size="sm" variant="ghost" aria-label={`Restore “${x.title}”`} onClick={() => void act(onRestore(x.id), "Restored")}><RotateCcw />Restore</Button>
            <ConfirmAction message="Delete this for good? It can't be brought back." onConfirm={() => void act(onPurge(x.id), "Deleted for good")}>
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label={`Delete “${x.title}” for good`}><Trash2 /></Button>
            </ConfirmAction>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Deleted reminders and meetings (owner 2026-11-01, Q4), whether you or an assistant deleted them. */
export function BinOthers() {
  const { data: reminders = [] } = useQuery({ queryKey: ["reminders", "binned"], queryFn: ipc.remindersBinned });
  const { data: meetings = [] } = useQuery({ queryKey: ["meetings", "binned"], queryFn: ipc.meetingsBinned });
  return (
    <>
      <Section label="Reminders in the Bin" title="Reminders" items={reminders.map((r) => ({ id: r.id, title: r.title, at: r.remind_at }))}
        onRestore={ipc.reminderRestore} onPurge={ipc.reminderPurge} invalidate={[["reminders"]]} />
      <Section label="Meetings in the Bin" title="Meetings" items={meetings.map((m) => ({ id: m.id, title: m.title, at: m.starts_at }))}
        onRestore={ipc.meetingRestore} onPurge={ipc.meetingPurge} invalidate={[["meetings"]]} />
    </>
  );
}
