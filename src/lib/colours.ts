/**
 * U-10: the colours the whole app can wear (owner 2026-11-03: five at most, Periwinkle by default).
 * Each is a handful of numbers; the style sheet that applies it is made from them, so the contrast
 * test (colours.test.ts) checks exactly what the screen uses. Status colours (overdue red, done
 * green), note colours and the bear's art do not follow it.
 */
export const COLOURS = ["periwinkle", "indigo", "ultraviolet", "amethyst", "copper"] as const;
export type Colour = (typeof COLOURS)[number];
export const DEFAULT_COLOUR: Colour = "periwinkle";

export const COLOUR_LABELS: Record<Colour, { name: string; about: string }> = {
  periwinkle: { name: "Periwinkle", about: "Calm blue with a hint of violet" },
  indigo: { name: "Twilight Indigo", about: "Violet leaning blue" },
  ultraviolet: { name: "Ultraviolet", about: "Violet leaning purple" },
  amethyst: { name: "Midnight Amethyst", about: "Deeper, richer surfaces" },
  copper: { name: "Copper", about: "The original warm look" },
};

/** What makes a palette: the hue of the greys, how tinted they are, the accent in light and dark, the focus ring's hue, and how dark dark mode is. */
export interface Palette { hue: number; tint: number; light: string; dark: string; ring: number; bg?: number; card?: number }

export const PALETTES: Record<Exclude<Colour, "copper">, Palette> = {
  periwinkle: { hue: 262, tint: 0.012, light: "0.52 0.19 262", dark: "0.75 0.13 262", ring: 262 },
  indigo: { hue: 275, tint: 0.012, light: "0.5 0.2 275", dark: "0.72 0.16 275", ring: 275 },
  ultraviolet: { hue: 295, tint: 0.014, light: "0.5 0.22 295", dark: "0.72 0.19 295", ring: 295 },
  amethyst: { hue: 285, tint: 0.02, light: "0.52 0.21 288", dark: "0.78 0.13 300", ring: 255, bg: 0.115, card: 0.17 },
};

const o = (l: number | string, c: number | string, h: number) => `oklch(${l} ${c} ${h})`;
const r3 = (n: number) => Number(n.toFixed(4));

/** The colour variables of one palette, light and dark, keyed by CSS variable name. */
export function palette(c: Exclude<Colour, "copper">): { light: Record<string, string>; dark: Record<string, string> } {
  const { hue: h, tint: t, light, dark, ring, bg = 0.13, card = 0.19 } = PALETTES[c];
  return {
    light: {
      "--background": o(0.97, t, h), "--card": "oklch(1 0 0)", "--popover": "oklch(1 0 0)",
      "--secondary": o(0.955, t, h), "--muted": o(0.955, t, h), "--accent": o(0.94, r3(t * 1.3), h),
      "--primary": `oklch(${light})`, "--primary-foreground": o(0.99, 0.01, h), "--ring": o(0.55, 0.19, ring),
      "--border": o(0.89, t, h), "--input": o(0.85, t, h), "--sidebar": o(0.945, r3(t * 1.2), h),
      "--foreground": o(0.2, 0.02, h), "--card-foreground": o(0.2, 0.02, h), "--popover-foreground": o(0.2, 0.02, h),
      "--muted-foreground": o(0.46, 0.02, h), "--secondary-foreground": o(0.25, 0.02, h), "--accent-foreground": o(0.25, 0.02, h),
    },
    dark: {
      "--background": o(bg, r3(t * 1.6), h), "--card": o(card, r3(t * 1.7), h), "--popover": o(r3(card + 0.025), r3(t * 1.7), h),
      "--secondary": o(0.26, r3(t * 1.6), h), "--muted": o(0.24, r3(t * 1.5), h), "--accent": o(0.28, r3(t * 2), h),
      "--primary": `oklch(${dark})`, "--primary-foreground": o(0.16, 0.04, h), "--ring": o(0.75, 0.15, ring),
      "--sidebar": o(r3(bg + 0.025), r3(t * 1.7), h), "--border": "oklch(1 0 0 / 11%)", "--input": "oklch(1 0 0 / 17%)",
      "--foreground": o(0.96, 0.01, h), "--card-foreground": o(0.96, 0.01, h), "--popover-foreground": o(0.96, 0.01, h),
      "--muted-foreground": o(0.75, 0.03, h), "--secondary-foreground": o(0.96, 0.01, h), "--accent-foreground": o(0.96, 0.01, h),
    },
  };
}

const block = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");

/** The style sheet for a colour; empty for copper, which is what index.css already holds. */
export function colourCss(c: Colour): string {
  if (c === "copper") return "";
  const p = palette(c);
  return `:root[data-colour]{${block(p.light)}}\n:root[data-colour].dark{${block(p.dark)}}`;
}

const STYLE_ID = "pluto-colour";

/** Puts a colour on the page (every window calls this with the saved choice). */
export function applyColour(c: Colour): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.colour = c;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = colourCss(c);
}

export const isColour = (v: unknown): v is Colour => typeof v === "string" && (COLOURS as readonly string[]).includes(v);

/** The accent as shown on a swatch (dark mode's, which is the default look). */
export function swatchColour(c: Colour): string {
  return c === "copper" ? "oklch(0.76 0.15 62)" : `oklch(${PALETTES[c].dark})`;
}
