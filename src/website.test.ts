import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COLOURS, DEFAULT_COLOUR, PALETTES } from "@/lib/colours";

/**
 * The website (`website/`) is plain HTML that reuses the app's own pets and screenshots. The pages
 * are built by scripts/site-pages.py from one shared head, header and footer. These checks keep the
 * site in step with the app and with itself: real packs only, every file and page it names exists,
 * nothing loads from other sites, motion respects reduced motion, and no AI on the site for now.
 */
const root = resolve(import.meta.dirname, "..");
const site = (p: string) => resolve(root, "website", p);
const read = (p: string) => readFileSync(site(p), "utf8");
const PAGES = ["index", "features", "characters", "privacy", "download", "404"];
const pages = Object.fromEntries(PAGES.map((p) => [p, read(`${p}.html`)]));
const html = pages.index ?? "";
const all = Object.values(pages).join("\n");
const js = read("site.js");
const css = read("styles.css");
const planet = read("planet.js");
const data = JSON.parse(read("pets/pets.json")) as {
  rows: string[];
  pets: { id: string; name: string; frames: number[]; special: string; reactions: Record<string, string> }[];
};
const between = (s: string, a: string, b: string) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));

describe("website", () => {
  it("shows only real packs, and not Mira or Raja (deleted, owner 2026-11-20)", () => {
    expect(data.pets.map((p) => p.id)).toEqual(["bear", "mochi", "pip", "bolt", "ghosty"]);
    for (const p of data.pets) {
      expect(existsSync(resolve(root, "packs", p.id, "pluto.json"))).toBe(true);
      expect(existsSync(site(`pets/${p.id}.webp`))).toBe(true);
    }
    expect(all).not.toMatch(/\bMira\b|\bRaja\b/);
  });

  it("uses the rows site.js animates, with each pack's own frame counts and reactions", () => {
    expect(data.rows).toEqual(["idle", "running-right", "running-left", "waving", "jumping", "running"]);
    expect(js).toContain("idle: 0, right: 1, left: 2, wave: 3, jump: 4, type: 5");
    for (const p of data.pets) {
      const pack = JSON.parse(readFileSync(resolve(root, "packs", p.id, "pluto.json"), "utf8")) as { rows: { name: string; frames: number }[]; reactions: Record<string, string> };
      expect(p.frames).toEqual(data.rows.map((r) => pack.rows.find((x) => x.name === r)?.frames));
      for (const n of p.frames) expect(n).toBeLessThanOrEqual(8);
      expect(p.reactions).toEqual(pack.reactions);
    }
  });

  it("every page shares the same header and footer, and every link and file it names exists", () => {
    const head = between(html, '<header class="top">', "</header>").replace(/ aria-current="page"/g, "");
    const foot = between(html, '<footer class="foot">', "</footer>");
    for (const [name, page] of Object.entries(pages)) {
      expect(between(page, '<header class="top">', "</header>").replace(/ aria-current="page"/g, ""), name).toBe(head);
      expect(between(page, '<footer class="foot">', "</footer>"), name).toBe(foot);
      for (const m of page.matchAll(/(?:src|href)="([^"#:]+)(?:#[^"]*)?"/g)) {
        const ref = m[1] ?? "";
        expect(existsSync(site(ref)), `${name}: ${ref}`).toBe(true);
      }
      expect(page, name).not.toContain("{{");
    }
    for (const shot of ["today", "time", "notes", "tasks", "character", "diary"]) expect(existsSync(site(`shots/${shot}.webp`))).toBe(true);
    for (const m of html.matchAll(/data-shot="(\w+)"/g)) expect(existsSync(site(`shots/${m[1]}.webp`))).toBe(true);
    for (const font of css.matchAll(/url\("([^"]+)"\)/g)) expect(existsSync(site(font[1] ?? ""))).toBe(true);
  });

  it("loads nothing from other sites (no fonts or scripts from a CDN, so visitors aren't tracked)", () => {
    expect(all).not.toMatch(/<(script|link)[^>]+(src|href)="https?:/);
    expect(css).not.toMatch(/url\("?https?:/);
    expect(planet).not.toMatch(/\bimport\b|https?:/);
  });

  it("puts typed task text in as text, never as HTML", () => {
    expect(js).toContain('li.querySelector("span").textContent = text');
    expect(js).not.toMatch(/innerHTML *= *[^'" ]/);
  });

  it("leaves AI out for now, and marks planned features as planned (owner, 2026-11-20)", () => {
    const text = all.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\bAI\b|Claude|Codex|Cursor|assistant/i);
    expect(js).not.toMatch(/\bai:|assistants/);
    expect(pages.features).toContain('id="next"');
    expect(pages.features).toContain("not in 0.6.0 yet");
    expect(html).toContain("Not in 0.6.0 yet");
  });

  it("offers exactly the app's colours, with the app's default first (owner, 2026-11-20)", () => {
    const offered = [...html.matchAll(/name="colour" value="(\w+)"/g)].map((m) => m[1]);
    expect(offered).toEqual([...COLOURS]);
    expect(html).toMatch(new RegExp(`value="${DEFAULT_COLOUR}"[^>]*checked`));
    for (const c of COLOURS) {
      expect(css).toContain(`[data-colour="${c}"]`);
      expect(js).toContain(`"${c}"`);
      if (c !== "copper") expect(css).toContain(`--accent: oklch(${PALETTES[c].light})`);
    }
  });

  it("respects reduced motion: nothing moves unless the visitor allows it", () => {
    expect(js).toContain('if (!still.matches) document.documentElement.classList.add("motion")');
    expect(planet).toContain("prefers-reduced-motion: reduce");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    // The pinned scenes only pin (and only take extra height) behind .motion.
    for (const rule of [".motion .orbit {", ".motion .orbit-stage", ".motion .scatter {", ".motion .scatter-stage", ".motion .day {", ".motion .day-stage", ".motion .shot", ".motion [data-reveal]"]) expect(css).toContain(rule);
  });

  it("draws Pluto with its own small shader, on every page that has a planet, with a still fallback", () => {
    for (const [name, page] of Object.entries(pages)) {
      if (page.includes("<canvas")) expect(page, name).toContain('<script src="planet.js" type="module"></script>');
    }
    // GLSL pitfalls found while building it: 'half' is reserved, pow() of a negative base is undefined.
    expect(planet).not.toMatch(/\bfloat half\b/);
    expect(planet).not.toMatch(/pow\(x \* x \+ y \* y - 1/);
    expect(planet).toContain('root.classList.add("no-gl")');
    for (const fallback of [".no-gl .orbit-scene::before", ".no-gl.hero3d", ".no-gl .finale-art::before"]) expect(css).toContain(fallback);
  });

  it("every feature tab has a panel entry", () => {
    for (const tab of pages.features?.matchAll(/data-tab="(\w+)"/g) ?? []) expect(js).toMatch(new RegExp(`\\b${tab[1]}: \\[`));
  });

  it("says nothing about the app that the app does not do (claims checked against the code)", () => {
    // The app's window may only talk to Pluto itself (tauri.conf.json content security policy).
    const conf = readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8");
    expect(conf).toContain("connect-src ipc: http://ipc.localhost");
    expect(pages.privacy).toContain("only allowed to talk to Pluto itself");
    // The data folder and file the privacy page names.
    expect(conf).toContain('"identifier": "app.pluto.desktop"');
    expect(readFileSync(resolve(root, "src-tauri/src/lib.rs"), "utf8")).toContain('data_dir.join("pluto.db")');
    // Time tracking keeps the app's file name and the site's host, never titles.
    expect(readFileSync(resolve(root, "src-tauri/src/tracking.rs"), "utf8")).toContain("never the path, never the title");
    expect(readFileSync(resolve(root, "src-tauri/src/sites.rs"), "utf8")).toContain("reduced to the host at once");
    // The Mac download is what CI builds (macos-latest: Apple silicon).
    expect(readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8")).toContain("macos-latest");
    expect(pages.download).toContain("Apple silicon");
  });
});
