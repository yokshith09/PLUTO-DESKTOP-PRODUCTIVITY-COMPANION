// @vitest-environment node
import { describe, expect, it } from "vitest";
import worker from "../src/admin-worker";

function env() {
  const seen: Request[] = [];
  const api = { fetch: async (r: Request) => { seen.push(r); return new Response("api"); } };
  const assets = { fetch: async () => new Response("page") };
  return { seen, env: { API: api, ASSETS: assets } };
}

describe("admin Worker", () => {
  it("passes the stats route to the counting server with the Access token", async () => {
    const { seen, env: e } = env();
    const res = await worker.fetch(new Request("https://pluto-admin.x.workers.dev/api/v1/admin/stats?days=30", { headers: { "cf-access-jwt-assertion": "a.b.c" } }), e);
    expect(await res.text()).toBe("api");
    const sent = seen[0];
    expect(sent && new URL(sent.url).pathname + new URL(sent.url).search).toBe("/v1/admin/stats?days=30");
    expect(sent?.headers.get("cf-access-jwt-assertion")).toBe("a.b.c");
  });

  it("serves the page itself, and nothing else of the counting server", async () => {
    const { seen, env: e } = env();
    expect(await (await worker.fetch(new Request("https://a.workers.dev/"), e)).text()).toBe("page");
    expect((await worker.fetch(new Request("https://a.workers.dev/api/v1/hello", { method: "POST" }), e)).status).toBe(405);
    expect((await worker.fetch(new Request("https://a.workers.dev/api/v1/ping"), e)).status).toBe(404);
    expect((await worker.fetch(new Request("https://a.workers.dev/api/d/windows"), e)).status).toBe(404);
    expect(seen).toHaveLength(0);
  });
});
