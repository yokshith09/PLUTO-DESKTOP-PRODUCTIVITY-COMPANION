# Pluto website

A static page: `index.html`, `styles.css`, `site.js`. No build step, no framework, nothing loaded
from other sites (fonts are self-hosted, so visitors aren't sent to a font CDN).

- **Preview:** `cd website && python3 -m http.server 5190`, then open http://localhost:5190
  (opening the file directly won't load the pets, which come from `pets/pets.json`).
- **Pets:** `python3 scripts/site-pets.py` rebuilds `pets/` from the app's `packs/`
  (only the rows the page animates, at 3/4 size). Mira and Raja are left off (owner, 2026-11-20).
- **Screens:** `shots/*.webp` are the app's real screens from the browser preview (`pnpm dev`,
  `main.html`), 1180×760 at 2x, saved at 1600 px wide.
- **Coming next:** the sketches are HTML, not screenshots, because the features aren't built.
  Move a feature out of that section when it ships.
- **Deploy:** Cloudflare Pages with `website` as the output folder and no build command.
  `_headers` sets the security headers. Not deployed yet: domain and account are the owner's call.
- **Tests:** `src/website.test.ts` checks the page against the packs and files.
- **Fonts:** Unbounded and Figtree, SIL Open Font License (`fonts/OFL-*.txt`).
