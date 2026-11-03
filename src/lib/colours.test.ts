import { afterEach, describe, expect, it } from "vitest";
import { COLOURS, DEFAULT_COLOUR, PALETTES, applyColour, colourCss, isColour, palette, type Colour } from "./colours";

/** OKLCH "l c h" or "oklch(l c h)" to linear sRGB and relative luminance (WCAG). */
function luminance(css: string): number {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(css) ?? /^([\d.]+)\s+([\d.]+)\s+([\d.]+)$/.exec(css);
  if (!m) throw new Error(`not an oklch colour: ${css}`);
  const [L, C, H] = [Number(m[1]), Number(m[2]), (Number(m[3]) * Math.PI) / 180];
  const a = C * Math.cos(H), b = C * Math.sin(H);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s]
    .map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
}
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05); };

const themed = COLOURS.filter((c): c is Exclude<Colour, "copper"> => c !== "copper");

afterEach(() => { document.documentElement.removeAttribute("data-colour"); document.getElementById("pluto-colour")?.remove(); });

describe("colours (U-10)", () => {
  it("offers five colours at most, Periwinkle first and by default", () => {
    expect(COLOURS).toHaveLength(5);
    expect(COLOURS[0]).toBe("periwinkle");
    expect(DEFAULT_COLOUR).toBe("periwinkle");
    expect(Object.keys(PALETTES).sort()).toEqual(["amethyst", "indigo", "periwinkle", "ultraviolet"]);
    expect(isColour("copper")).toBe(true);
    expect(isColour("red")).toBe(false);
  });

  it.each(themed.flatMap((c) => (["light", "dark"] as const).map((m) => [c, m] as const)))("%s %s: text, muted text and the accent are readable", (c, mode) => {
    const v = palette(c)[mode];
    for (const surface of [(v["--background"] ?? ""), (v["--card"] ?? ""), (v["--sidebar"] ?? "")]) {
      expect(contrast((v["--foreground"] ?? ""), surface)).toBeGreaterThanOrEqual(7);
      expect(contrast((v["--muted-foreground"] ?? ""), surface)).toBeGreaterThanOrEqual(4.5);
      // The accent is used as text (numbers, links) and as a filled button's edge.
      expect(contrast((v["--primary"] ?? ""), surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast((v["--primary-foreground"] ?? ""), (v["--primary"] ?? ""))).toBeGreaterThanOrEqual(4.5);
    expect(contrast((v["--foreground"] ?? ""), (v["--muted"] ?? ""))).toBeGreaterThanOrEqual(7);
  });

  it("styles are made from the same numbers, none for copper", () => {
    expect(colourCss("copper")).toBe("");
    const css = colourCss("periwinkle");
    expect(css).toContain(":root[data-colour]{");
    expect(css).toContain(":root[data-colour].dark{");
    expect(css).toContain(`--primary:oklch(${PALETTES.periwinkle.dark})`);
  });

  it("applying a colour sets the attribute and one style element, and replaces it next time", () => {
    applyColour("indigo");
    expect(document.documentElement.dataset.colour).toBe("indigo");
    applyColour("ultraviolet");
    expect(document.querySelectorAll("#pluto-colour")).toHaveLength(1);
    expect(document.getElementById("pluto-colour")?.textContent).toContain(PALETTES.ultraviolet.light);
    applyColour("copper");
    expect(document.getElementById("pluto-colour")?.textContent).toBe("");
  });
});
