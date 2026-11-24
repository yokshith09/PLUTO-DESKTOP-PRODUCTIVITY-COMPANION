# Pluto counting server and admin dashboard

What it is: one Cloudflare Worker (`server/`) with one D1 database, and a static admin site
(`admin/`) that only the owner can open. Plan and reasons: `desktop-pet-docs/MASTER_PLAN.md`,
PW "Revised plan". What visitors are told: `website/privacy.html` ("The one thing we keep").

| Route | Who calls it | What it does |
|---|---|---|
| `POST /v1/hello` | the app, first open | registers the install (scrambled number, OS, version, first day and hour), marks it active today, returns its token |
| `POST /v1/ping` | the app, once a day while open | marks the install active today; refused without the token from hello |
| `GET /d/windows`, `/d/mac` | website Download buttons | +1 download for that day and OS (not for crawlers, previews, prefetches), then redirect to the installer |
| `GET /v1/admin/stats?days=N` | the admin site (`/api/v1/admin/stats`) | the dashboard's numbers; only through Cloudflare Access |

Stored: see `migrations/0001_init.sql`. No IP addresses, no cookies, nothing from inside the app.
Daily records are folded into per-day totals after 35 days by the daily cron.

## Not built yet

- **The app side** (send hello on first open and a ping once a day): next step.
- **Website Download buttons** still point at GitHub; switch them to `/d/windows` and `/d/mac`
  when this server is live.

## Deploy (owner's Cloudflare account; nothing is deployed yet)

1. Buy the domain and add it to Cloudflare (free plan).
2. `cd server && npx wrangler login`
3. `npx wrangler d1 create pluto-counts`, then put the printed `database_id` in `wrangler.toml`.
4. `npx wrangler d1 migrations apply pluto-counts --remote`
5. Secrets (two long random strings, kept nowhere else):
   `npx wrangler secret put ID_KEY` and `npx wrangler secret put TOKEN_KEY`.
   Changing `ID_KEY` later makes every install look new, so keep it.
6. Uncomment `routes` in `wrangler.toml` with the real domain, then `npx wrangler deploy`.
7. Admin site: a Cloudflare Pages project from `admin/` (no build command) on `admin.<domain>`.
   In Zero Trust, add an Access application for `admin.<domain>` (the whole host, including
   `/api/*`) that allows only the owner's email. Put the team name and the application's
   audience tag in `ACCESS_TEAM` and `ACCESS_AUD`, and deploy again.
8. Security rule: one Cloudflare rate-limiting rule on `/v1/hello` (for example 10 requests per
   10 minutes per IP). It runs at Cloudflare's edge; the Worker never sees or stores the address.
9. Check: open `admin.<domain>`, sign in, and see the numbers; open `admin.<domain>/?demo` to see
   the layout with made-up numbers.

## Tests

`pnpm vitest run server` runs the Worker against a real SQLite database (`test/d1.ts` gives
node:sqlite the same API as D1) and draws the admin site from its output.
