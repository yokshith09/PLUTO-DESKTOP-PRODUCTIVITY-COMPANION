import { Check } from "lucide-react";
import { COLOURS, COLOUR_LABELS, DEFAULT_COLOUR, isColour, palette, swatchColour, type Colour } from "@/lib/colours";
import { cn } from "@/lib/utils";

/** What a swatch shows: the accent over the surfaces of the dark and the light look, split in two. */
function Swatch({ colour }: { colour: Colour }) {
  const dark = colour === "copper" ? "oklch(0.19 0.006 270)" : palette(colour).dark["--card"];
  const light = colour === "copper" ? "oklch(1 0 0)" : palette(colour).light["--card"];
  return (
    <span aria-hidden className="relative grid h-11 w-full overflow-hidden rounded-lg border" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <i style={{ background: dark }} />
      <i style={{ background: light }} />
      <i className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 shadow-sm" style={{ background: swatchColour(colour) }} />
    </span>
  );
}

/**
 * Settings → Colour (U-10): five colours and no more (owner 2026-11-03). One click changes the
 * main window, the pet's card and the notes at once; it is saved on this computer.
 */
export function ColourPicker({ value, onChange }: { value: string | undefined; onChange: (c: Colour) => void }) {
  const current = isColour(value) ? value : DEFAULT_COLOUR;
  return (
    <div className="py-3.5">
      <p className="text-[13px] font-medium" id="colour-label">Colour</p>
      <p className="text-xs text-muted-foreground">The accent of buttons, today’s ring and what you can act on. It also colours the pet’s card.</p>
      <div role="radiogroup" aria-labelledby="colour-label" className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {COLOURS.map((c) => {
          const on = c === current;
          return (
            <button key={c} type="button" role="radio" aria-checked={on} aria-label={COLOUR_LABELS[c].name} onClick={() => onChange(c)}
              className={cn("group flex flex-col gap-2 rounded-xl border p-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary/10" : "hover:border-foreground/30 hover:bg-muted/60")}>
              <Swatch colour={c} />
              <span className="flex items-start gap-1 px-0.5 pb-0.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium leading-tight">{COLOUR_LABELS[c].name}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{c === DEFAULT_COLOUR ? "Default. " : ""}{COLOUR_LABELS[c].about}</span>
                </span>
                {on && <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
