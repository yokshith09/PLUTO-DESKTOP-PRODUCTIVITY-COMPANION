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

## Deploy without a domain (owner's Cloudflare account; nothing is deployed yet)

Three free Cloudflare addresses, no domain to buy:

| What | Where it runs | Address |
|---|---|---|
| Website | Cloudflare Pages, from `website/` | `<project>.pages.dev` |
| Counting server | Worker `pluto-api` (`server/`) | `pluto-api.<account>.workers.dev` |
| Admin site | Worker `pluto-admin` (`admin/`, code in `src/admin-worker.ts`) | `pluto-admin.<account>.workers.dev`, behind Cloudflare Access |

1. `cd server && npx wrangler login`
2. `npx wrangler d1 create pluto-counts`, then put the printed `database_id` in `wrangler.toml`.
3. `npx wrangler d1 migrations apply pluto-counts --remote`
4. Secrets (two long random strings, kept nowhere else):
   `npx wrangler secret put ID_KEY` and `npx wrangler secret put TOKEN_KEY`.
   Changing `ID_KEY` later makes every install look new, so keep it.
5. `npx wrangler deploy` (counting server, on its workers.dev address).
6. `cd ../admin && npx wrangler deploy` (admin site; it reaches the counting server through the
   `API` service binding, so it must be deployed after step 5).
7. In the dashboard: Workers & Pages → `pluto-admin` → Settings → Domains & Routes → workers.dev →
   **Enable Cloudflare Access**. Then in Zero Trust → Access → Applications, edit that
   application so only the owner's email is allowed. Copy the team name and the application's
   audience tag into `ACCESS_TEAM` and `ACCESS_AUD` in `server/wrangler.toml`, and deploy
   `server/` again.
8. Security rule: one rate-limiting rule on `/v1/hello` (for example 10 requests per 10 minutes
   per IP), at Cloudflare's edge; the Worker never sees or stores the address. [Unverified:
   whether the free plan offers this rule on a workers.dev address; if not, it waits for a domain.]
9. Website: a Pages project from `website/` (no build command). Then point its Download buttons
   at `https://pluto-api.<account>.workers.dev/d/windows` and `/d/mac`, and set the app's hello
   and ping address to the same host (not built yet).
10. Check: open `pluto-admin.<account>.workers.dev`, sign in, and see the numbers; add `?demo` to see
    the layout with made-up numbers.

**Later, with a domain:** add it to Cloudflare, give each Worker a custom domain
(`api.`, `admin.`) and the Pages project the main name, and change the app's and the website's
addresses. Installs already counted keep counting; nothing in the database changes.

## Tests

`pnpm vitest run server` runs the Worker against a real SQLite database (`test/d1.ts` gives
node:sqlite the same API as D1), draws the admin site from its output, and checks that the
admin Worker passes on only the admin route.
