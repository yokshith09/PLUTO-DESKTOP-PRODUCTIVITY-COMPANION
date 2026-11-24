// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addDays, handle, hmac, KEEP_DAYS, parseBody, rollUp, weekOf, type Env, type Stats } from "../src/api";
import { d1 } from "./d1";

const env = (over: Partial<Env> = {}): Env => ({ DB: d1(), ID_KEY: "id-key", TOKEN_KEY: "token-key", ...over });
const ID = "3f2b8c1e-5a7d-4e2b-9c1a-7d8e9f0a1b2c";
const ID2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const at = (day: string, hour = 10) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
const post = (path: string, body: unknown) => new Request(`https://api.example${path}`, { method: "POST", body: JSON.stringify(body) });
const hello = (e: Env, id: string, day: string, version = "0.6.1") =>
  handle(post("/v1/hello", { install_id: id, os: "windows", version }), e, { now: at(day) });
const ping = (e: Env, id: string, token: string, day: string) =>
  handle(post("/v1/ping", { install_id: id, os: "windows", version: "0.6.1", token }), e, { now: at(day) });
const rows = async (e: Env, sql: string) => (await e.DB.prepare(sql).all()).results;

describe("counting server: hello and ping", () => {
  it("hello registers an install, marks it active today and returns its token; the raw install number is never stored", async () => {
    const e = env();
    const res = await hello(e, ID, "2026-12-01");
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const installs = await rows(e, "SELECT * FROM installs");
    expect(installs).toHaveLength(1);
    expect(JSON.stringify(installs)).not.toContain(ID);
    expect(installs[0]).toMatchObject({ first_seen: "2026-12-01", first_hour: "2026-12-01T10", last_seen: "2026-12-01", os: "windows", version: "0.6.1" });
    expect(await rows(e, "SELECT day FROM daily_active")).toEqual([{ day: "2026-12-01" }]);
    // A second hello from the same install is not a new install, and gets the same token.
    const again = (await (await hello(e, ID, "2026-12-03", "0.6.2")).json()) as { token: string };
    expect(again.token).toBe(token);
    expect(await rows(e, "SELECT first_seen, last_seen, version FROM installs")).toEqual([{ first_seen: "2026-12-01", last_seen: "2026-12-03", version: "0.6.2" }]);
  });

  it("a ping counts once per day, needs the token from hello, and refuses installs that never said hello", async () => {
    const e = env();
    const { token } = (await (await hello(e, ID, "2026-12-01")).json()) as { token: string };
    expect((await ping(e, ID, token, "2026-12-02")).status).toBe(204);
    expect((await ping(e, ID, token, "2026-12-02")).status).toBe(204);
    expect(await rows(e, "SELECT day FROM daily_active ORDER BY day")).toEqual([{ day: "2026-12-01" }, { day: "2026-12-02" }]);
    expect((await ping(e, ID, "0".repeat(64), "2026-12-03")).status).toBe(403);
    const madeUp = await hmac("token-key", await hmac("id-key", ID2));
    expect((await ping(e, ID2, madeUp, "2026-12-03")).status).toBe(409);
    expect(await rows(e, "SELECT COUNT(*) AS n FROM installs")).toEqual([{ n: 1 }]);
  });

  it("accepts exactly the fields it stores, nothing more", () => {
    expect(parseBody(JSON.stringify({ install_id: ID, os: "macos", version: "1.2.3" }), false)).not.toBeNull();
    expect(parseBody(JSON.stringify({ install_id: ID, os: "macos", version: "1.2.3", name: "Sam" }), false)).toBeNull();
    expect(parseBody(JSON.stringify({ install_id: "not-a-uuid", os: "macos", version: "1.2.3" }), false)).toBeNull();
    expect(parseBody(JSON.stringify({ install_id: ID, os: "android", version: "1.2.3" }), false)).toBeNull();
    expect(parseBody(JSON.stringify({ install_id: ID, os: "macos", version: "latest" }), false)).toBeNull();
    expect(parseBody(JSON.stringify({ install_id: ID, os: "macos", version: "1.2.3" }), true)).toBeNull();
    expect(parseBody("x".repeat(600), false)).toBeNull();
  });

  it("is closed until its secrets are set, and only answers its own routes", async () => {
    const e = env({ ID_KEY: "" });
    expect((await hello(e, ID, "2026-12-01")).status).toBe(503);
    expect((await handle(new Request("https://api.example/v1/hello"), env())).status).toBe(405);
    expect((await handle(new Request("https://api.example/elsewhere"), env())).status).toBe(404);
  });
});

describe("counting server: downloads", () => {
  const click = (e: Env, path: string, ua: string, extra: Record<string, string> = {}, method = "GET") =>
    handle(new Request(`https://getpluto.example${path}`, { method, headers: { "user-agent": ua, ...extra } }), e, { now: at("2026-12-01") });
  const person = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36";

  it("counts a person's click and sends them on to the installer", async () => {
    const e = env({ DL_WINDOWS: "https://files.example/Pluto.exe" });
    const res = await click(e, "/d/windows", person);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://files.example/Pluto.exe");
    await click(e, "/d/windows", person);
    await click(e, "/d/mac", person);
    expect(await rows(e, "SELECT day, os, count FROM downloads ORDER BY os")).toEqual([
      { day: "2026-12-01", os: "macos", count: 1 }, { day: "2026-12-01", os: "windows", count: 2 },
    ]);
  });

  it("does not count crawlers, link previews, prefetches, HEAD requests or clicks with no browser name", async () => {
    const e = env();
    for (const ua of ["Googlebot/2.1", "facebookexternalhit/1.1", "curl/8.4", "python-requests/2.31", ""]) {
      expect((await click(e, "/d/windows", ua)).status).toBe(302);
    }
    await click(e, "/d/windows", person, { "sec-purpose": "prefetch" });
    await click(e, "/d/windows", person, {}, "HEAD");
    expect(await rows(e, "SELECT * FROM downloads")).toEqual([]);
  });
});

describe("counting server: the dashboard's numbers", () => {
  async function seeded() {
    const e = env();
    const today = "2026-12-20";
    const { token } = (await (await hello(e, ID, "2026-12-01")).json()) as { token: string };
    for (const d of ["2026-12-08", "2026-12-15", "2026-12-20"]) await ping(e, ID, token, d);
    await hello(e, ID2, "2026-12-20", "0.6.2");
    const person = { "user-agent": "Mozilla/5.0 Chrome/131" };
    for (const os of ["windows", "windows", "mac"]) {
      await handle(new Request(`https://x.example/d/${os}`, { headers: person }), e, { now: at("2026-12-19") });
    }
    return { e, today };
  }

  it("gives downloads, installs and active users per day, the funnel, versions, OS and retention", async () => {
    const { e, today } = await seeded();
    const { stats } = await import("../src/api");
    const s: Stats = await stats(e.DB, at(today, 12), 30);
    expect(s.days).toHaveLength(30);
    expect(s.to).toBe(today);
    const i = (d: string) => s.days.indexOf(d);
    expect(s.downloads.windows[i("2026-12-19")]).toBe(2);
    expect(s.downloads.macos[i("2026-12-19")]).toBe(1);
    expect(s.installs[i("2026-12-01")]).toBe(1);
    expect(s.installs[i("2026-12-20")]).toBe(1);
    expect(s.active[i("2026-12-20")]).toBe(2);
    expect(s.active[i("2026-12-08")]).toBe(1);
    expect(s.totals).toEqual({ downloads: 3, installs: 2, dau: 2, wau: 2, mau: 2 });
    expect(s.funnel).toEqual({ downloads: 3, installs: 2, active: 2 });
    expect(s.versions).toEqual([{ version: "0.6.2", installs: 1 }, { version: "0.6.1", installs: 1 }]);
    expect(s.os).toEqual([{ os: "windows", installs: 2 }]);
    const first = s.retention.find((r) => r.week === weekOf("2026-12-01"));
    expect(first).toEqual({ week: "2026-11-30", installs: 1, week1: 1, month1: 0 });
    expect(s.unusual.newPerHour).toEqual([{ hour: "2026-12-20T10", installs: 1 }]);
  });

  it("keeps daily records 35 days, then only the day's total", async () => {
    const { e, today } = await seeded();
    await rollUp(e.DB, at(addDays(today, KEEP_DAYS - 5)));
    expect(await rows(e, "SELECT day, active FROM daily_totals ORDER BY day")).toEqual([
      { day: "2026-12-01", active: 1 }, { day: "2026-12-08", active: 1 },
    ]);
    // 35 days before 2027-01-19 is 2026-12-15: that day and later stay as daily records.
    expect(await rows(e, "SELECT day FROM daily_active ORDER BY day")).toEqual([{ day: "2026-12-15" }, { day: "2026-12-20" }, { day: "2026-12-20" }]);
    const { stats } = await import("../src/api");
    const s = await stats(e.DB, at(today, 12), 30);
    expect(s.active[s.days.indexOf("2026-12-08")]).toBe(1);
  });
});

describe("counting server: admin access", () => {
  const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");
  async function signer() {
    const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
    const sign = async (payload: object, kid = "k1") => {
      const h = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid })));
      const p = b64url(new TextEncoder().encode(JSON.stringify(payload)));
      const s = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${h}.${p}`));
      return `${h}.${p}.${b64url(s)}`;
    };
    const certs = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch;
    return { sign, certs };
  }
  const now = at("2026-12-20");
  const good = { iss: "https://pluto.cloudflareaccess.com", aud: ["aud-tag"], exp: now.getTime() / 1000 + 600 };
  const ask = (e: Env, jwt: string | null, f: typeof fetch) =>
    handle(new Request("https://admin.example/api/v1/admin/stats?days=30", { headers: jwt ? { "cf-access-jwt-assertion": jwt } : {} }), e, { now, fetch: f });

  it("answers the dashboard only through Cloudflare Access: right team, audience, signature and time", async () => {
    const { sign, certs } = await signer();
    const e = env({ ACCESS_TEAM: "pluto", ACCESS_AUD: "aud-tag" });
    expect((await ask(e, await sign(good), certs)).status).toBe(200);
    expect((await ask(e, null, certs)).status).toBe(403);
    expect((await ask(e, await sign({ ...good, aud: ["other-app"] }), certs)).status).toBe(403);
    expect((await ask(e, await sign({ ...good, iss: "https://evil.cloudflareaccess.com" }), certs)).status).toBe(403);
    expect((await ask(e, await sign({ ...good, exp: now.getTime() / 1000 - 1 }), certs)).status).toBe(403);
    expect((await ask(e, await sign(good, "unknown-key"), certs)).status).toBe(403);
    const tampered = (await sign(good)).replace(/\.[^.]+\./, `.${b64url(new TextEncoder().encode(JSON.stringify({ ...good, aud: ["aud-tag"], exp: 9e9 })))}.`);
    expect((await ask(e, tampered, certs)).status).toBe(403);
  });

  it("answers no one until Access is set up", async () => {
    const { sign, certs } = await signer();
    expect((await ask(env(), await sign(good), certs)).status).toBe(403);
  });
});
