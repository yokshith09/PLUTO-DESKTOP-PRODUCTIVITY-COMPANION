import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePref } from "@/features/guide/usePref";
import { useSetting } from "@/hooks/useTheme";

/** Same numbers as `pluto_core::tantrum` (default, smallest, largest). */
export const TANTRUM_DEFAULT = 15;
export const TANTRUM_MIN = 5;
export const TANTRUM_MAX = 60;
export const TANTRUM_PREF = "pet.tantrum";
export interface Tantrum { on: boolean; limit: number }
export function parseTantrum(raw: unknown): Tantrum {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = typeof r.limit === "number" && Number.isFinite(r.limit) ? Math.round(r.limit) : TANTRUM_DEFAULT;
  return { on: r.on === true, limit: Math.min(TANTRUM_MAX, Math.max(TANTRUM_MIN, n)) };
}

/**
 * Tab Tantrum (TT-1, owner 2026-11-09). Off by default. While the front browser window has more
 * tabs than the limit the pet keeps having a tantrum (every 20 seconds) and stands at the top of
 * the screen; when the count is back under the limit it goes back to where it was.
 */
export function TabTantrumRow() {
  const pref = usePref(TANTRUM_PREF, parseTantrum);
  const [apps] = useSetting("tracking.apps");
  const [sites] = useSetting("tracking.sites");
  const t = pref.value ?? { on: false, limit: TANTRUM_DEFAULT };
  const canRead = apps === true && sites === true;
  const set = (next: Partial<Tantrum>) => void pref.set({ ...t, ...next });
  return (
    <div className="py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[10rem] flex-1">
          <p className="text-[13px] font-medium">Tab Tantrum</p>
          <p className="text-xs text-muted-foreground">When your front browser window has too many tabs, the pet keeps complaining and stands at the top of the screen. When you are back under the limit, it goes back to where it was. Click its bubble to see the tabs.</p>
        </div>
        <Switch className="ml-auto" checked={t.on} onCheckedChange={(on) => set({ on })} aria-label="Tab Tantrum" />
      </div>
      {t.on && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
          <span className="text-muted-foreground">Tabs before it starts</span>
          <span className="inline-flex items-center gap-1">
            <Button size="icon-sm" variant="outline" aria-label="Fewer tabs" disabled={t.limit <= TANTRUM_MIN} onClick={() => set({ limit: t.limit - 1 })}><Minus className="size-3.5" /></Button>
            <output aria-label="Tab limit" className="w-8 text-center font-semibold tabular-nums">{t.limit}</output>
            <Button size="icon-sm" variant="outline" aria-label="More tabs" disabled={t.limit >= TANTRUM_MAX} onClick={() => set({ limit: t.limit + 1 })}><Plus className="size-3.5" /></Button>
          </span>
          {!canRead && <span className="text-xs text-amber-500">Needs “apps” and “websites” time tracking switched on (Settings › Time tracking) to read your tabs.</span>}
          <span className="basis-full text-xs text-muted-foreground">Chrome, Edge, Brave and Opera on Windows; Chrome-family browsers on macOS. Pauses during a focus session and while the pet is hidden.</span>
        </div>
      )}
    </div>
  );
}
