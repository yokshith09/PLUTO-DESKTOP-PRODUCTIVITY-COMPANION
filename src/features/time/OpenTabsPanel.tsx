import { useState } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { ClipboardCopy, Globe, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tile } from "@/features/shell/PageHeader";
import { useOpenTabs } from "@/hooks/usePluto";
import { ipc } from "@/ipc";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";

/**
 * Every tab currently open, read live — no browser extension (owner decision 2026-10-13).
 * Never stored: it's re-read each time this panel is visible, like a task switcher. Needs both
 * app and site tracking on, the same permission already granted to read browser time.
 */
export function OpenTabsPanel({ enabled, className }: { enabled: boolean; className?: string }) {
  const { data: tabs = [], isLoading } = useOpenTabs(enabled);
  const qc = useQueryClient();
  const [closing, setClosing] = useState<string | null>(null);

  const close = async (browser: string, windowIndex: number, tabIndex: number) => {
    const key = `${browser}:${windowIndex}:${tabIndex}`;
    setClosing(key);
    try {
      await ipc.petCloseTab(browser, windowIndex, tabIndex);
    } finally {
      setClosing(null);
      void qc.invalidateQueries({ queryKey: ["tabs", "open"] });
    }
  };

  /** The raw account of what Pluto sees, to paste into a bug report (owner 2026-11-20: counts looked doubled). */
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(await ipc.petTabsReport());
      notify.success("Tab report copied");
    } catch {
      notify.error("Could not copy the report");
    }
  };

  // One explicit click turns on both switches it needs (they're also in Settings).
  const turnOn = async () => {
    await ipc.settingSet("tracking.apps", true);
    await ipc.settingSet("tracking.sites", true);
    void qc.invalidateQueries();
  };

  if (!enabled) {
    return (
      <Tile className={className} title="Open tabs" bodyClassName="p-4">
        <div className="py-8 text-center">
          <p className="text-[13px] text-muted-foreground">
            See every open browser tab here, switch to it or close it. Pluto reads them live with the same permission as website time — nothing is stored, private windows are skipped.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void turnOn()}>Turn on app and website time</Button>
        </div>
      </Tile>
    );
  }

  return (
    <Tile
      className={className}
      title="Open tabs"
      action={(
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {tabs.length > 0 ? `${tabs.length} open · live` : undefined}
          <Button type="button" variant="ghost" size="icon" className="size-6" aria-label="Copy tab report" title="Copy what Pluto sees, for a bug report" onClick={() => void copyReport()}><ClipboardCopy className="size-3.5" /></Button>
        </span>
      )}
      bodyClassName="p-2"
    >
      {isLoading ? (
        <p className="py-10 text-center text-[13px] text-muted-foreground">Reading your browser…</p>
      ) : tabs.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-muted-foreground">No browser tabs found right now. Open a browser window (not minimised) and it appears here; Pluto reads the one in front, or the top-most one when you are looking at Pluto.</p>
      ) : (
        <ul className="space-y-0.5">
          {tabs.map((t) => {
            const key = `${t.browser}:${t.window_index}:${t.tab_index}`;
            return (
              <li key={key} className={cn("group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px]", t.active && "bg-accent/50")}>
                <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate" title={t.title ?? t.domain ?? undefined}>
                  {t.title ?? t.domain ?? "Untitled tab"}
                </span>
                {t.domain && <span className="shrink-0 truncate text-[11px] text-muted-foreground">{t.domain}</span>}
                {/* Firefox tabs come from its session file (macOS) and can't be closed from Pluto. */}
                {t.browser !== "Firefox" && (
                  <ConfirmAction message="Close this tab in your browser?" verb="Close" onConfirm={() => void close(t.browser, t.window_index, t.tab_index)}>
                    <Button
                      type="button" variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Close ${t.title ?? t.domain ?? "tab"}`}
                      disabled={closing === key}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </ConfirmAction>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Tile>
  );
}
