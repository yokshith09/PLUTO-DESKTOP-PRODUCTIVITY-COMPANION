import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COLOURS, DEFAULT_COLOUR, PALETTES } from "@/lib/colours";

/**
 * The website (`website/`) is plain HTML that reuses the app's own pets and screenshots. The pages
 * are built by scripts/site-pages.py from one shared head, header and footer. These checks keep the
 * site in step with the app and with itself: real packs only, every file and page it names exists,
 * nothing loads from other sites, motion respects reduced motion, no "open source" wording, Pluto's
 * own AI only as "coming soon", and what it says about assistants matches the app's code.
 */
const root = resolve(import.meta.dirname, "..");
const site = (p: string) => resolve(root, "website", p);
const read = (p: string) => readFileSync(site(p), "utf8");
const PAGES = ["index", "features", "characters", "assistants", "pricing", "privacy", "download", "404"];
const pages = Object.fromEntries(PAGES.map((p) => [p, read(`${p}.html`)]));
const html = pages.index ?? "";
const all = Object.values(pages).join("\n");
const js = read("site.js");
const css = read("styles.css");
const planet = read("planet.js");
const data = JSON.parse(read("pets/pets.json")) as {
  rows: string[];
  pets: { id: string; name: string; frames: number[]; special: string; reactions: Record<string, string>; anchors: (number[] | null)[][] }[];
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

  it("says nothing about open source, and Pluto's own AI only as coming soon (owner, 2026-11-23)", () => {
    const text = all.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/open[ -]source|\bMIT\b|licen[cs]e|source code/i);
    expect(all).not.toContain("github.com/yokshith09/DESKTOP-PET\"");
    expect(all).not.toContain("/blob/main/LICENSE");
    for (const [name, page] of Object.entries(pages)) {
      if (/Pluto's own AI/.test(page)) expect(page, name).toMatch(/coming soon|is on the way|planned/i);
    }
    // A paid plan, no invented price.
    expect(pages.pricing).toContain("Coming soon");
    expect(pages.pricing).not.toMatch(/[$€£₹]\s?\d|\d+\s?(USD|EUR|INR)|per month|\/mo\b/i);
    // The landing page gets a pricing section later (owner: "this will be later").
    expect(html).not.toContain('class="prices"');
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

  it("says about assistants only what the app does (tool list, apps, diary never shared)", () => {
    const perms = readFileSync(resolve(root, "crates/pluto-core/src/mcp/perms.rs"), "utf8");
    const tools = between(perms, "pub const TOOLS", "];").match(/^\s*\("/gm) ?? [];
    expect(pages.assistants).toContain(`<span id="tool-count">${tools.length}</span> tools`);
    for (const app of ["Claude Code", "Codex", "Cursor", "OpenCode", "VS Code", "Windsurf", "Antigravity"]) {
      expect(perms, app).toContain(`"${app}"`);
      expect(pages.assistants, app).toContain(`<b>${app}</b>`);
    }
    const page = readFileSync(resolve(root, "src/features/assistants/AssistantsPage.tsx"), "utf8");
    expect(page).toContain("Your diary. Assistants can never see it.");
    expect(page).toContain("only after you press Allow on the pet");
    expect(pages.assistants).toContain("Never the diary.");
    // The pet library's import buttons.
    const lib = readFileSync(resolve(root, "src/features/character/PetLibrary.tsx"), "utf8");
    expect(lib).toContain("Import ZIP");
    expect(lib).toContain("Codex and OpenPets pets work too");
  });

  it("describes the diary as the app has it", () => {
    const diary = readFileSync(resolve(root, "src/features/diary/DiaryPage.tsx"), "utf8");
    for (const s of ["Lock now", "Spot things to do", "Off by default", "Search the diary", "recovery key"]) expect(diary, s).toContain(s);
    expect(readFileSync(resolve(root, "src/features/diary/DayCard.tsx"), "utf8")).toContain("Make task from selection");
    for (const s of ["Lock now", "Spot things to do", "recovery key", "Search every entry"]) expect(pages.features, s).toContain(s);
  });

  it("has a pet on the home page that stays by the list and answers, with tasks you can tick and remove (owner, 2026-11-23)", () => {
    const demo = between(js, "function demo()", "/* ---------- The look");
    expect(demo).not.toMatch(/ROW\.(right|left)/);
    expect(demo).toContain('closest("button.x")');
    expect((html.match(/<button class="x" type="button" aria-label="Remove this task">/g) ?? []).length).toBe(3);
  });

  it("dresses every pet with the app's own placement, frame by frame", () => {
    for (const p of data.pets) {
      expect(p.anchors.map((row) => row.length), p.id).toEqual(p.frames);
      for (const a of p.anchors.flat()) if (a) expect(a).toHaveLength(4);
    }
    // The same formula as spriteAnchors.ts placement(): scale by head width / 120 in the bear's 200x200 space.
    expect(readFileSync(resolve(root, "src/features/wardrobe/spriteAnchors.ts"), "utf8")).toContain("const s = a.headW / 120;");
    expect(js).toContain("const s = headW / 120;");
    expect(js).toContain("neckY - 128 * s : top - 28 * s");
    expect(readFileSync(resolve(root, "scripts/site-pets.py"), "utf8")).toContain("head_w = sum(r[2] - r[1] + 1 for r in band) / len(band)");
  });

  it("only shows the pointer guide where it can't get in the way, and it can be switched off", () => {
    expect(js).toContain('matchMedia("(hover: hover) and (pointer: fine)")');
    expect(js).toContain("if (!fine.matches || still.matches) return;");
    expect(css).toMatch(/\.guide \{[^}]*pointer-events: none/);
    expect(js).toContain('role="switch"');
    expect(css).toContain("html:not(.guided) .guide { display: none; }");
  });

  it("folds the menu on narrow windows instead of hiding the links", () => {
    for (const [name, page] of Object.entries(pages)) expect(page, name).toContain('<button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav">');
    expect(css).toContain(".js .top.open nav { display: flex; }");
  });

  it("tells the truth about the anonymous count and download counting (owner, 2026-11-24)", () => {
    // The page describes parts not built yet; website/README and MASTER_PLAN say not to deploy before they ship.
    expect(pages.privacy).toContain('id="count"');
    for (const s of ["A random install number", "Send an anonymous daily count", "does not store your IP address", "Counting downloads"]) expect(pages.privacy, s).toContain(s);
    expect(pages.privacy).not.toMatch(/no Pluto server|nothing uploaded, no one watching/);
    expect(read("README.md")).toContain("Do not deploy");
  });
});
