/**
 * Pluto's counting server (MASTER_PLAN PW "Revised plan"; owner 2026-11-24). A Cloudflare Worker
 * with one D1 (SQLite) database. It keeps only:
 *  - which installs were open on which day (a scrambled install number, never the IP address),
 *  - when each install first and last opened, with its OS and version,
 *  - how many website Download clicks there were per day and OS.
 * Nothing from inside the app (tasks, notes, diary, tracked time) ever comes here.
 *
 * Routes (the admin site reaches the same Worker under /api on its own host):
 *   POST /v1/hello        first open: registers the install, returns its token
 *   POST /v1/ping         once a day while open: "active today"
 *   GET  /d/windows|mac   website Download button: +1, then redirect to the installer
 *   GET  /v1/admin/stats  the dashboard's numbers (Cloudflare Access only)
 */

/** The subset of Cloudflare D1 the Worker uses (so tests can run it on node:sqlite). */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface D1Like {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

export interface Env {
  DB: D1Like;
  /** Secret: scrambles install numbers before they are stored. */
  ID_KEY?: string;
  /** Secret: signs the token an install gets at hello. */
  TOKEN_KEY?: string;
  /** Where the Download buttons send people (defaults: the latest GitHub release). */
  DL_WINDOWS?: string;
  DL_MAC?: string;
  /** Cloudflare Access team name and application audience tag, for the admin routes. */
  ACCESS_TEAM?: string;
  ACCESS_AUD?: string;
}

export interface Options {
  now?: Date;
  /** Used to fetch Cloudflare Access's public keys (tests pass their own). */
  fetch?: typeof fetch;
}

export const OS_VALUES = ["windows", "macos", "linux"] as const;
export type Os = (typeof OS_VALUES)[number];
/** Daily records older than this are folded into per-day totals and deleted. */
export const KEEP_DAYS = 35;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const MAX_BODY = 512;
const RELEASES = "https://github.com/yokshith09/DESKTOP-PET/releases/latest";
/** Clicks that are not people: crawlers, link previews and command-line tools. */
const NOT_A_PERSON = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|curl|wget|python|httpclient|okhttp|go-http|headless|lighthouse/i;

// ---- dates (UTC) ---------------------------------------------------------------------------

export const dayOf = (d: Date) => d.toISOString().slice(0, 10);
export const hourOf = (d: Date) => d.toISOString().slice(0, 13);
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return dayOf(d);
}
/** The Monday of the week a day is in. */
export function weekOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}

// ---- small helpers -------------------------------------------------------------------------

const te = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function hmac(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", te.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, te.encode(message)));
}

/** Compares without leaking where two strings differ. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const nothing = (status = 204) => new Response(null, { status, headers: { "cache-control": "no-store" } });

export interface CountBody { install_id: string; os: Os; version: string; token?: string }

/** Exactly these fields and nothing else; anything more is refused, so nothing extra is ever stored. */
export function parseBody(raw: string, withToken: boolean): CountBody | null {
  if (raw.length > MAX_BODY) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const allowed = withToken ? ["install_id", "os", "version", "token"] : ["install_id", "os", "version"];
  if (Object.keys(o).some((k) => !allowed.includes(k))) return null;
  const { install_id, os, version, token } = o;
  if (typeof install_id !== "string" || !UUID.test(install_id)) return null;
  if (typeof os !== "string" || !(OS_VALUES as readonly string[]).includes(os)) return null;
  if (typeof version !== "string" || !VERSION.test(version)) return null;
  if (withToken && (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token))) return null;
  return withToken ? { install_id, os: os as Os, version, token: token as string } : { install_id, os: os as Os, version };
}

// ---- routes --------------------------------------------------------------------------------

export async function handle(req: Request, env: Env, opts: Options = {}): Promise<Response> {
  const now = opts.now ?? new Date();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api(?=\/)/, "");
  try {
    if (path === "/v1/hello" || path === "/v1/ping") {
      if (req.method !== "POST") return nothing(405);
      return await count(req, env, now, path === "/v1/ping");
    }
    const dl = /^\/d\/(windows|mac)$/.exec(path);
    if (dl) {
      if (req.method !== "GET" && req.method !== "HEAD") return nothing(405);
      return await download(req, env, now, dl[1] === "mac" ? "macos" : "windows");
    }
    if (path === "/v1/admin/stats") {
      if (req.method !== "GET") return nothing(405);
      if (!(await accessAllowed(req, env, now, opts.fetch ?? fetch))) return json({ error: "Sign in through Cloudflare Access." }, 403);
      const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || 90));
      return json(await stats(env.DB, now, days));
    }
    return json({ error: "Not found." }, 404);
  } catch {
    return json({ error: "Something went wrong." }, 500);
  }
}

/** Hello (first open) and ping (once a day). Both mark the install active today. */
async function count(req: Request, env: Env, now: Date, ping: boolean): Promise<Response> {
  if (!env.ID_KEY || !env.TOKEN_KEY) return json({ error: "Not set up." }, 503);
  const body = parseBody(await req.text(), ping);
  if (!body) return json({ error: "Bad request." }, 400);
  const id = await hmac(env.ID_KEY, body.install_id);
  const token = await hmac(env.TOKEN_KEY, id);
  const today = dayOf(now);
  if (ping) {
    if (!same(token, body.token ?? "")) return json({ error: "Bad token." }, 403);
    const known = await env.DB.prepare("SELECT 1 AS ok FROM installs WHERE id_hash = ?").bind(id).first();
    if (!known) return json({ error: "Say hello first." }, 409);
  }
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO installs (id_hash, first_seen, first_hour, last_seen, os, version) VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(id_hash) DO UPDATE SET last_seen = excluded.last_seen, os = excluded.os, version = excluded.version",
    ).bind(id, today, hourOf(now), today, body.os, body.version),
    env.DB.prepare("INSERT OR IGNORE INTO daily_active (day, id_hash) VALUES (?, ?)").bind(today, id),
  ]);
  return ping ? nothing() : json({ token });
}

/** A website Download click: counted unless it is clearly not a person, then sent on to the file. */
async function download(req: Request, env: Env, now: Date, os: "windows" | "macos"): Promise<Response> {
  const target = (os === "macos" ? env.DL_MAC : env.DL_WINDOWS) || RELEASES;
  const ua = req.headers.get("user-agent") ?? "";
  const prefetch = /prefetch|prerender/i.test(`${req.headers.get("sec-purpose") ?? ""} ${req.headers.get("purpose") ?? ""}`);
  if (req.method === "GET" && ua && !NOT_A_PERSON.test(ua) && !prefetch) {
    await env.DB.prepare("INSERT INTO downloads (day, os, count) VALUES (?, ?, 1) ON CONFLICT(day, os) DO UPDATE SET count = count + 1")
      .bind(dayOf(now), os).run();
  }
  return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

// ---- Cloudflare Access (admin only) --------------------------------------------------------

const b64urlBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const b64urlJson = (s: string): unknown => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

/**
 * The admin routes answer only a request that Cloudflare Access let through: its signed token is
 * checked against Access's public keys, this application's audience, the team and the expiry.
 * Without ACCESS_TEAM and ACCESS_AUD set, they answer no one.
 */
export async function accessAllowed(req: Request, env: Env, now: Date, fetcher: typeof fetch): Promise<boolean> {
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) return false;
  const jwt = req.headers.get("cf-access-jwt-assertion");
  const parts = jwt?.split(".");
  if (!parts || parts.length !== 3) return false;
  const [h = "", p = "", s = ""] = parts;
  try {
    const header = b64urlJson(h) as { alg?: string; kid?: string };
    const payload = b64urlJson(p) as { aud?: string | string[]; exp?: number; iss?: string };
    if (header.alg !== "RS256" || !header.kid) return false;
    const issuer = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`;
    if (payload.iss !== issuer) return false;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= now.getTime()) return false;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return false;
    const certs = (await (await fetcher(`${issuer}/cdn-cgi/access/certs`)).json()) as { keys?: (JsonWebKey & { kid?: string })[] };
    const jwk = certs.keys?.find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), te.encode(`${h}.${p}`));
  } catch {
    return false;
  }
}

// ---- the dashboard's numbers ---------------------------------------------------------------

export interface Stats {
  from: string;
  to: string;
  days: string[];
  downloads: { windows: number[]; macos: number[] };
  installs: number[];
  active: number[];
  totals: { downloads: number; installs: number; dau: number; wau: number; mau: number };
  /** The last 30 days: website downloads, new installs, and installs open at least once. */
  funnel: { downloads: number; installs: number; active: number };
  versions: { version: string; installs: number }[];
  os: { os: string; installs: number }[];
  /** Per install week: how many installs, and how many were still opened 7 and 30 days later. */
  retention: { week: string; installs: number; week1: number; month1: number }[];
  unusual: { newPerHour: { hour: string; installs: number }[]; openedOnce: number };
}

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

export async function stats(db: D1Like, now: Date, days: number): Promise<Stats> {
  const to = dayOf(now);
  const from = addDays(to, -(days - 1));
  const list = Array.from({ length: days }, (_, i) => addDays(from, i));
  const index = new Map(list.map((d, i) => [d, i]));
  const zeros = () => list.map(() => 0);
  const all = async (sql: string, ...v: unknown[]) => (await db.prepare(sql).bind(...v).all<Row>()).results;
  const one = async (sql: string, ...v: unknown[]) => num((await db.prepare(sql).bind(...v).first<Row>())?.n);

  const downloads = { windows: zeros(), macos: zeros() };
  for (const r of await all("SELECT day, os, count FROM downloads WHERE day >= ?", from)) {
    const i = index.get(String(r.day));
    if (i !== undefined && (r.os === "windows" || r.os === "macos")) downloads[r.os][i] = num(r.count);
  }
  const installs = zeros();
  for (const r of await all("SELECT first_seen AS day, COUNT(*) AS n FROM installs WHERE first_seen >= ? GROUP BY first_seen", from)) {
    const i = index.get(String(r.day));
    if (i !== undefined) installs[i] = num(r.n);
  }
  const active = zeros();
  for (const r of await all("SELECT day, active AS n FROM daily_totals WHERE day >= ?", from)) {
    const i = index.get(String(r.day));
    if (i !== undefined) active[i] = num(r.n);
  }
  for (const r of await all("SELECT day, COUNT(*) AS n FROM daily_active WHERE day >= ? GROUP BY day", from)) {
    const i = index.get(String(r.day));
    if (i !== undefined) active[i] = num(r.n);
  }
  const wau = await one("SELECT COUNT(DISTINCT id_hash) AS n FROM daily_active WHERE day >= ?", addDays(to, -6));
  const mau = await one("SELECT COUNT(DISTINCT id_hash) AS n FROM daily_active WHERE day >= ?", addDays(to, -29));
  const month = addDays(to, -29);
  const sum = (a: number[], start = 0) => a.slice(start).reduce((t, n) => t + n, 0);
  const lastMonth = Math.max(0, list.length - 30);

  const retentionRows = await all(
    "SELECT first_seen AS day, COUNT(*) AS n, SUM(last_seen >= date(first_seen, '+7 days')) AS w1, SUM(last_seen >= date(first_seen, '+30 days')) AS m1 " +
      "FROM installs WHERE first_seen >= ? GROUP BY first_seen",
    addDays(to, -83),
  );
  const weeks = new Map<string, { week: string; installs: number; week1: number; month1: number }>();
  for (const r of retentionRows) {
    const week = weekOf(String(r.day));
    const w = weeks.get(week) ?? { week, installs: 0, week1: 0, month1: 0 };
    w.installs += num(r.n);
    w.week1 += num(r.w1);
    w.month1 += num(r.m1);
    weeks.set(week, w);
  }

  return {
    from, to, days: list, downloads, installs, active,
    totals: {
      downloads: await one("SELECT COALESCE(SUM(count), 0) AS n FROM downloads"),
      installs: await one("SELECT COUNT(*) AS n FROM installs"),
      dau: active[active.length - 1] ?? 0, wau, mau,
    },
    funnel: { downloads: sum(downloads.windows, lastMonth) + sum(downloads.macos, lastMonth), installs: sum(installs, lastMonth), active: mau },
    versions: (await all("SELECT version, COUNT(*) AS n FROM installs WHERE last_seen >= ? GROUP BY version ORDER BY n DESC, version DESC", month))
      .map((r) => ({ version: String(r.version), installs: num(r.n) })),
    os: (await all("SELECT os, COUNT(*) AS n FROM installs WHERE last_seen >= ? GROUP BY os ORDER BY n DESC", month))
      .map((r) => ({ os: String(r.os), installs: num(r.n) })),
    retention: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    unusual: {
      newPerHour: (await all("SELECT first_hour AS hour, COUNT(*) AS n FROM installs WHERE first_hour >= ? GROUP BY first_hour ORDER BY first_hour", hourOf(new Date(now.getTime() - 48 * 3_600_000))))
        .map((r) => ({ hour: String(r.hour), installs: num(r.n) })),
      openedOnce: await one("SELECT COUNT(*) AS n FROM installs WHERE first_seen = last_seen AND first_seen < ?", addDays(to, -1)),
    },
  };
}

// ---- daily tidy-up (cron) ------------------------------------------------------------------

/** Folds daily records older than KEEP_DAYS into per-day totals, then deletes them. */
export async function rollUp(db: D1Like, now: Date): Promise<void> {
  const cutoff = addDays(dayOf(now), -KEEP_DAYS);
  await db.batch([
    db.prepare(
      "INSERT INTO daily_totals (day, active) SELECT day, COUNT(*) FROM daily_active WHERE day < ? GROUP BY day " +
        "ON CONFLICT(day) DO UPDATE SET active = excluded.active",
    ).bind(cutoff),
    db.prepare("DELETE FROM daily_active WHERE day < ?").bind(cutoff),
  ]);
}
