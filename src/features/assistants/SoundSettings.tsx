import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { usePref } from "@/features/guide/usePref";
import { Panel } from "@/features/shell/PageHeader";
import { DEFAULT_SOUNDS, KIND_LABEL, SOUNDS, SOUND_IDS, SOUND_KINDS, SOUNDS_PREF, parseSounds, play, type SoundId, type SoundPrefs } from "@/pet/sounds";

/** A-8: one sound per assistant moment, picked from a small CC0 set, with a volume and an off switch. */
export function SoundSettings() {
  const pref = usePref(SOUNDS_PREF, parseSounds);
  const p: SoundPrefs = pref.value ?? DEFAULT_SOUNDS;
  const save = (next: SoundPrefs) => void pref.set(next);
  return (
    <Panel className="p-5">
      <div className="flex items-start gap-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted/60"><Volume2 className="size-4 text-muted-foreground" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Sounds</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">A short sound when an assistant is done, needs you, asks permission or hits an error, each its own so you can tell them apart without looking. Quiet while you focus applies to sounds too.</p>
        </div>
        <Switch checked={p.on} onCheckedChange={(on) => save({ ...p, on })} aria-label="Assistant sounds" />
      </div>
      {p.on && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <ul className="divide-y rounded-lg border">
            {SOUND_KINDS.map((k) => (
              <li key={k} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[13px]">
                <span className="min-w-28 flex-1 font-medium">{KIND_LABEL[k]}</span>
                <select
                  aria-label={`Sound for ${KIND_LABEL[k]}`} value={p.map[k]}
                  onChange={(e) => save({ ...p, map: { ...p.map, [k]: e.target.value as SoundId | "none" } })}
                  className="h-8 rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {SOUND_IDS.map((id) => <option key={id} value={id}>{SOUNDS[id].label}</option>)}
                  <option value="none">No sound</option>
                </select>
                <Button size="sm" variant="outline" disabled={p.map[k] === "none"} aria-label={`Play ${KIND_LABEL[k]} sound`}
                  onClick={() => { const id = p.map[k]; if (id !== "none") play(SOUNDS[id].src, p.volume); }}>Play</Button>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-16 text-muted-foreground">Volume</span>
            <Slider className="max-w-60" min={0} max={100} step={5} value={[Math.round(p.volume * 100)]}
              onValueChange={([v]) => save({ ...p, volume: (v ?? 60) / 100 })} aria-label="Sound volume" />
          </label>
          <p className="text-[12px] text-muted-foreground">Sounds: “Notifications” by akx, public domain (CC0).</p>
        </div>
      )}
    </Panel>
  );
}
