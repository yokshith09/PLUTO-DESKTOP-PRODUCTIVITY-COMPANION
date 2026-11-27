// Pluto counting server, bundled from server/src by `pnpm build:server`. Do not edit here.

// server/src/api.ts
var OS_VALUES = ["windows", "macos", "linux"];
var KEEP_DAYS = 35;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
var VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
var MAX_BODY = 512;
var RELEASES = "https://github.com/yokshith09/PLUTO-DESKTOP-PRODUCTIVITY-COMPANION/releases/latest";
var NOT_A_PERSON = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|curl|wget|python|httpclient|okhttp|go-http|headless|lighthouse/i;
var dayOf = (d) => d.toISOString().slice(0, 10);
var hourOf = (d) => d.toISOString().slice(0, 13);
function addDays(day, n) {
  const d = /* @__PURE__ */ new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return dayOf(d);
}
function weekOf(day) {
  const d = /* @__PURE__ */ new Date(`${day}T00:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}
var te = new TextEncoder();
var hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function hmac(key, message) {
  const k = await crypto.subtle.importKey("raw", te.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, te.encode(message)));
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
var nothing = (status = 204) => new Response(null, { status, headers: { "cache-control": "no-store" } });
function parseBody(raw, withToken) {
  if (raw.length > MAX_BODY) return null;
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v;
  const allowed = withToken ? ["install_id", "os", "version", "token"] : ["install_id", "os", "version"];
  if (Object.keys(o).some((k) => !allowed.includes(k))) return null;
  const { install_id, os, version, token } = o;
  if (typeof install_id !== "string" || !UUID.test(install_id)) return null;
  if (typeof os !== "string" || !OS_VALUES.includes(os)) return null;
  if (typeof version !== "string" || !VERSION.test(version)) return null;
  if (withToken && (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token))) return null;
  return withToken ? { install_id, os, version, token } : { install_id, os, version };
}
async function handle(req, env, opts = {}) {
  const now = opts.now ?? /* @__PURE__ */ new Date();
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
      if (!await accessAllowed(req, env, now, opts.fetch ?? fetch)) return json({ error: "Sign in through Cloudflare Access." }, 403);
      const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || 90));
      return json(await stats(env.DB, now, days));
    }
    return json({ error: "Not found." }, 404);
  } catch {
    return json({ error: "Something went wrong." }, 500);
  }
}
async function count(req, env, now, ping) {
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
      "INSERT INTO installs (id_hash, first_seen, first_hour, last_seen, os, version) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id_hash) DO UPDATE SET last_seen = excluded.last_seen, os = excluded.os, version = excluded.version"
    ).bind(id, today, hourOf(now), today, body.os, body.version),
    env.DB.prepare("INSERT OR IGNORE INTO daily_active (day, id_hash) VALUES (?, ?)").bind(today, id)
  ]);
  return ping ? nothing() : json({ token });
}
async function download(req, env, now, os) {
  const target = (os === "macos" ? env.DL_MAC : env.DL_WINDOWS) || RELEASES;
  const ua = req.headers.get("user-agent") ?? "";
  const prefetch = /prefetch|prerender/i.test(`${req.headers.get("sec-purpose") ?? ""} ${req.headers.get("purpose") ?? ""}`);
  if (req.method === "GET" && ua && !NOT_A_PERSON.test(ua) && !prefetch) {
    await env.DB.prepare("INSERT INTO downloads (day, os, count) VALUES (?, ?, 1) ON CONFLICT(day, os) DO UPDATE SET count = count + 1").bind(dayOf(now), os).run();
  }
  return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
var b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
var b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
async function accessAllowed(req, env, now, fetcher) {
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) return false;
  const jwt = req.headers.get("cf-access-jwt-assertion");
  const parts = jwt?.split(".");
  if (!parts || parts.length !== 3) return false;
  const [h = "", p = "", s = ""] = parts;
  try {
    const header = b64urlJson(h);
    const payload = b64urlJson(p);
    if (header.alg !== "RS256" || !header.kid) return false;
    const issuer = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`;
    if (payload.iss !== issuer) return false;
    if (typeof payload.exp !== "number" || payload.exp * 1e3 <= now.getTime()) return false;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return false;
    const certs = await (await fetcher(`${issuer}/cdn-cgi/access/certs`)).json();
    const jwk = certs.keys?.find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), te.encode(`${h}.${p}`));
  } catch {
    return false;
  }
}
var num = (v) => Number(v ?? 0);
async function stats(db, now, days) {
  const to = dayOf(now);
  const from = addDays(to, -(days - 1));
  const list = Array.from({ length: days }, (_, i) => addDays(from, i));
  const index = new Map(list.map((d, i) => [d, i]));
  const zeros = () => list.map(() => 0);
  const all = async (sql, ...v) => (await db.prepare(sql).bind(...v).all()).results;
  const one = async (sql, ...v) => num((await db.prepare(sql).bind(...v).first())?.n);
  const downloads = { windows: zeros(), macos: zeros() };
  for (const r of await all("SELECT day, os, count FROM downloads WHERE day >= ?", from)) {
    const i = index.get(String(r.day));
    if (i !== void 0 && (r.os === "windows" || r.os === "macos")) downloads[r.os][i] = num(r.count);
  }
  const installs = zeros();
  for (const r of await all("SELECT first_seen AS day, COUNT(*) AS n FROM installs WHERE first_seen >= ? GROUP BY first_seen", from)) {
    const i = index.get(String(r.day));
    if (i !== void 0) installs[i] = num(r.n);
  }
  const active = zeros();
  for (const r of await all("SELECT day, active AS n FROM daily_totals WHERE day >= ?", from)) {
    const i = index.get(String(r.day));
    if (i !== void 0) active[i] = num(r.n);
  }
  for (const r of await all("SELECT day, COUNT(*) AS n FROM daily_active WHERE day >= ? GROUP BY day", from)) {
    const i = index.get(String(r.day));
    if (i !== void 0) active[i] = num(r.n);
  }
  const wau = await one("SELECT COUNT(DISTINCT id_hash) AS n FROM daily_active WHERE day >= ?", addDays(to, -6));
  const mau = await one("SELECT COUNT(DISTINCT id_hash) AS n FROM daily_active WHERE day >= ?", addDays(to, -29));
  const wauPrev = await one("SELECT COUNT(DISTINCT id_hash) AS n FROM daily_active WHERE day >= ? AND day < ?", addDays(to, -13), addDays(to, -6));
  const month = addDays(to, -29);
  const sum = (a, start = 0) => a.slice(start).reduce((t, n) => t + n, 0);
  const lastMonth = Math.max(0, list.length - 30);
  const retentionRows = await all(
    "SELECT first_seen AS day, COUNT(*) AS n, SUM(last_seen >= date(first_seen, '+7 days')) AS w1, SUM(last_seen >= date(first_seen, '+30 days')) AS m1 FROM installs WHERE first_seen >= ? GROUP BY first_seen",
    addDays(to, -83)
  );
  const weeks = /* @__PURE__ */ new Map();
  for (const r of retentionRows) {
    const week = weekOf(String(r.day));
    const w = weeks.get(week) ?? { week, installs: 0, week1: 0, month1: 0 };
    w.installs += num(r.n);
    w.week1 += num(r.w1);
    w.month1 += num(r.m1);
    weeks.set(week, w);
  }
  return {
    from,
    to,
    days: list,
    downloads,
    installs,
    active,
    totals: {
      downloads: await one("SELECT COALESCE(SUM(count), 0) AS n FROM downloads"),
      installs: await one("SELECT COUNT(*) AS n FROM installs"),
      dau: active[active.length - 1] ?? 0,
      wau,
      wauPrev,
      mau
    },
    funnel: { downloads: sum(downloads.windows, lastMonth) + sum(downloads.macos, lastMonth), installs: sum(installs, lastMonth), active: mau },
    versions: (await all("SELECT version, COUNT(*) AS n FROM installs WHERE last_seen >= ? GROUP BY version ORDER BY n DESC, version DESC", month)).map((r) => ({ version: String(r.version), installs: num(r.n) })),
    os: (await all("SELECT os, COUNT(*) AS n FROM installs WHERE last_seen >= ? GROUP BY os ORDER BY n DESC", month)).map((r) => ({ os: String(r.os), installs: num(r.n) })),
    retention: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    unusual: {
      newPerHour: (await all("SELECT first_hour AS hour, COUNT(*) AS n FROM installs WHERE first_hour >= ? GROUP BY first_hour ORDER BY first_hour", hourOf(new Date(now.getTime() - 48 * 36e5)))).map((r) => ({ hour: String(r.hour), installs: num(r.n) })),
      openedOnce: await one("SELECT COUNT(*) AS n FROM installs WHERE first_seen = last_seen AND first_seen < ?", addDays(to, -1))
    }
  };
}
async function rollUp(db, now) {
  const cutoff = addDays(dayOf(now), -KEEP_DAYS);
  await db.batch([
    db.prepare(
      "INSERT INTO daily_totals (day, active) SELECT day, COUNT(*) FROM daily_active WHERE day < ? GROUP BY day ON CONFLICT(day) DO UPDATE SET active = excluded.active"
    ).bind(cutoff),
    db.prepare("DELETE FROM daily_active WHERE day < ?").bind(cutoff)
  ]);
}

// server/src/index.ts
var index_default = {
  fetch: (req, env) => handle(req, env),
  scheduled: async (_event, env) => rollUp(env.DB, /* @__PURE__ */ new Date())
};
export {
  index_default as default
};
