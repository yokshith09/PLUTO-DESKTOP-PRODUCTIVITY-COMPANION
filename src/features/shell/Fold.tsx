import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A card that is one button until you open it (U-9, owner 2026-11-03: "keep the reactions collapsed
 * under a neatly designed button"). The button says what is inside and how it is set right now.
 */
export function Fold({ title, summary, icon, defaultOpen = false, children, className }: {
  title: string; summary?: ReactNode; icon?: ReactNode; defaultOpen?: boolean; children: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section aria-label={title} className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        {icon && <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">{title}</span>
          {summary && <span className="block truncate text-xs text-muted-foreground">{summary}</span>}
        </span>
        <span className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground">
          {open ? "Hide" : "Show"}
          <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && <div id={id} className="border-t">{children}</div>}
    </section>
  );
}
