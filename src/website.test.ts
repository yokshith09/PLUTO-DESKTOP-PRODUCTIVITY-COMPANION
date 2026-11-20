import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COLOURS, DEFAULT_COLOUR, PALETTES } from "@/lib/colours";

/**
 * The website (`website/`) is plain HTML that reuses the app's own pets and screenshots.
 * These checks keep it in step with the app: every pet it shows is a real pack, its sprite is
 * built from that pack's rows (scripts/site-pets.py), and every file the page names exists.
 */
const root = resolve(import.meta.dirname, "..");
const site = (p: string) => resolve(root, "website", p);
const html = readFileSync(site("index.html"), "utf8");
const js = readFileSync(site("site.js"), "utf8");
const css = readFileSync(site("styles.css"), "utf8");
const data = JSON.parse(readFileSync(site("pets/pets.json"), "utf8")) as {
  rows: string[];
  cell: { width: number; height: number };
  pets: { id: string; name: string; frames: number[]; special: string }[];
};

describe("website", () => {
  it("shows only real packs, and not Mira or Raja (owner, 2026-11-20)", () => {
    const ids = data.pets.map((p) => p.id);
    expect(ids).toEqual(["bear", "mochi", "pip", "bolt", "ghosty"]);
    for (const p of data.pets) {
      expect(existsSync(resolve(root, "packs", p.id, "pluto.json"))).toBe(true);
      expect(existsSync(site(`pets/${p.id}.webp`))).toBe(true);
    }
  });

  it("uses the rows site.js animates, with each pack's own frame counts", () => {
    expect(data.rows).toEqual(["idle", "running-right", "running-left", "waving", "jumping"]);
    expect(js).toContain("idle: 0, right: 1, left: 2, wave: 3, jump: 4");
    for (const p of data.pets) {
      const pack = JSON.parse(readFileSync(resolve(root, "packs", p.id, "pluto.json"), "utf8")) as { rows: { name: string; frames: number }[] };
      expect(p.frames).toEqual(data.rows.map((r) => pack.rows.find((x) => x.name === r)?.frames));
      for (const n of p.frames) expect(n).toBeLessThanOrEqual(8);
    }
  });

  it("names only files that exist", () => {
    const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g), ...js.matchAll(/`shots\/(\w+)\.webp`|"(shots\/\w+\.webp)"/g)]
      .map((m) => m[1] ?? m[2])
      .filter((r): r is string => Boolean(r));
    for (const r of refs) expect(existsSync(site(r)), r).toBe(true);
    for (const shot of ["today", "time", "notes", "tasks", "character"]) {
      expect(js).toContain(`"${shot}"`);
      expect(existsSync(site(`shots/${shot}.webp`))).toBe(true);
    }
    for (const font of css.matchAll(/url\("([^"]+)"\)/g)) expect(existsSync(site(font[1] ?? ""))).toBe(true);
  });

  it("loads nothing from other sites (no fonts or scripts from a CDN, so visitors aren't tracked)", () => {
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)="https?:/);
    expect(css).not.toMatch(/url\("?https?:/);
  });

  it("puts typed task text in as text, never as HTML", () => {
    expect(js).toContain('li.querySelector("span").textContent = text');
    expect(js).not.toMatch(/innerHTML *= *[^'" ]/);
  });

  it("leaves AI out for now, and marks planned features as planned (owner, 2026-11-20)", () => {
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\bAI\b|Claude|Codex|Cursor|assistant/i);
    expect(js).not.toMatch(/\bai:|assistants/);
    expect(html).toContain('id="next"');
    expect(html).toContain("not in 0.6.0 yet");
  });

  it("offers exactly the app's colours, with the app's default first (owner, 2026-11-20)", () => {
    const offered = [...html.matchAll(/name="colour" value="(\w+)"/g)].map((m) => m[1]);
    expect(offered).toEqual([...COLOURS]);
    expect(html).toMatch(new RegExp(`value="${DEFAULT_COLOUR}"[^>]*checked`));
    for (const c of COLOURS) {
      expect(css).toContain(`[data-colour="${c}"]`);
      expect(js).toContain(`"${c}"`);
      // The site's accent is the app's light-mode accent for that colour.
      if (c !== "copper") expect(css).toContain(`--accent: oklch(${PALETTES[c].light})`);
    }
  });

  it("every feature tab has a panel entry", () => {
    for (const tab of html.matchAll(/data-tab="(\w+)"/g)) expect(js).toMatch(new RegExp(`\\b${tab[1]}: \\[`));
  });
});
