# Pluto website

Static pages, no framework, nothing loaded from other sites (fonts are self-hosted, so visitors
aren't sent to a font CDN).

| Page | What it is |
|---|---|
| `index.html` | The story: sunrise over Pluto with the bear on the horizon, "your day is everywhere" (scattered things gather into one Pluto window), try it (the pet answers a small Today list: tick, add, remove), a day with Pluto (dawn to night, the app's screens and the pet's reactions), the orbit scene, pick a companion and dress it up, the diary, privacy, assistants, coming next, finale with downloads |
| `features.html` | Each part up close (tabs with real screens), the little things, coming next (sketches) |
| `characters.html` | The pet library: search, a card per pet, a sheet with every move, the dressing room, bring your own pet |
| `assistants.html` | Pluto with coding assistants: the apps, the tools (count checked against `perms.rs`), the safety rules, Pluto's own AI as coming soon |
| `pricing.html` | Free today; a paid plan with Pluto's own AI, Coming soon, no price |
| `privacy.html` | What Pluto stores, where, and what time tracking reads (each claim checked against the code by `src/website.test.ts`) |
| `download.html` | Downloads, install steps for an unsigned app, questions |
| `404.html` | Lost in orbit |

- **Edit pages in `scripts/site-pages/<name>.html`**, then run `python3 scripts/site-pages.py`.
  It wraps each body in the shared head, header (with the colour picker) and footer and writes
  `website/<name>.html`. The written pages are committed, so the site itself has no build step.
- **Preview:** `cd website && python3 -m http.server 5190`, then open http://localhost:5190
  (opening the file directly won't load the pets, which come from `pets/pets.json`).
- **Pets:** `python3 scripts/site-pets.py` rebuilds `pets/` from the app's `packs/` (rows: idle,
  walking both ways, waving, jumping, typing; at 3/4 size) with each pack's reactions and special.
- **Screens:** `shots/*.webp` are the app's real screens from the browser preview (`pnpm dev`,
  `main.html`; the diary with `?demo=diary`), 1180×760 at 2x, saved at 1600 px wide.
- **Motion:** `planet.js` draws Pluto in WebGL (one fragment shader; GLSL notes: `half` is a
  reserved word, and `pow()` of a negative number is undefined) for three scenes: the hero, the
  orbit and the finale; each draws only while on screen. `site.js` runs the pinned scenes (scatter,
  day), `--p` on `[data-scroll]`, reveals on `[data-reveal]` and every sprite. Everything that
  moves is under `html.motion`, set only when the visitor has not asked for reduced motion; without
  it every scene shows its finished state. Without WebGL, `.no-gl` shows a drawn planet.
- **Coming next:** sketches in HTML, not screenshots, because the features aren't built. Move a
  feature out of that section when it ships. Pluto's own AI appears only as "Coming soon" and the
  site never says "open source" (owner, 2026-11-23); tests keep both.
- **Wardrobe:** `wardrobe/` holds the app's accessory drawings and outfits, copied from
  `src/features/wardrobe` by `src/website.wardrobe.test.tsx` (refresh with
  `WRITE_SITE=1 pnpm vitest run src/website.wardrobe.test.tsx`). `pets.json` has, per frame, where
  gear goes (`site-pets.py` uses the same rules as `spriteAnchors.ts`).
- **Guide:** the pet that follows the pointer (`guide()` in `site.js`): mouse or trackpad only, not
  with reduced motion, never takes clicks, off switch and character picker in the Guide button.
  The look (pet and worn things) and the guide's on/off are kept in the visitor's browser only.
- **Deploy:** Cloudflare Pages with `website` as the output folder and no build command.
  `_headers` sets the security headers. Not deployed yet: domain and account are the owner's call.
- **Tests:** `src/website.test.ts`.
- **Fonts:** Unbounded and Figtree, SIL Open Font License (`fonts/OFL-*.txt`).
