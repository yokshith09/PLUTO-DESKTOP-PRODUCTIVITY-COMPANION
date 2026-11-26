// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { d1 } from "./d1";

/** server/dist/pluto-api.js is what the owner pastes into Cloudflare's editor: it must be current and work. */
const out = resolve(import.meta.dirname, "../dist/pluto-api.js");

describe("bundled server (for Cloudflare's online editor)", () => {
  it("matches the source (run `pnpm build:server` after changing server/src)", async () => {
    const fresh = await build({
      entryPoints: [resolve(import.meta.dirname, "../src/index.ts")], bundle: true, format: "esm", target: "es2022",
      platform: "neutral", legalComments: "none", write: false,
      banner: { js: "// Pluto counting server, bundled from server/src by `pnpm build:server`. Do not edit here." },
    });
    expect(readFileSync(out, "utf8")).toBe(fresh.outputFiles[0]?.text);
  });

  it("counts a hello and a ping, and counts a download", async () => {
    const worker = (await import(pathToFileURL(out).href)).default as { fetch: (r: Request, env: unknown) => Promise<Response> };
    const env = { DB: d1(), ID_KEY: "a", TOKEN_KEY: "b", DL_WINDOWS: "https://example.com/pluto.exe", DL_MAC: "https://example.com/pluto.dmg" };
    const id = "3f2b8c1e-5a7d-4e2b-9c1a-7d8e9f0a1b2c";
    const hello = await worker.fetch(new Request("https://x/v1/hello", { method: "POST", body: JSON.stringify({ install_id: id, os: "windows", version: "0.6.1" }) }), env);
    expect(hello.status).toBe(200);
    const { token } = (await hello.json()) as { token: string };
    const ping = await worker.fetch(new Request("https://x/v1/ping", { method: "POST", body: JSON.stringify({ install_id: id, os: "windows", version: "0.6.1", token }) }), env);
    expect(ping.status).toBeLessThan(300);
    const dl = await worker.fetch(new Request("https://x/d/windows", { headers: { "user-agent": "Mozilla/5.0 Chrome" } }), env);
    expect(dl.status).toBe(302);
    expect(dl.headers.get("location")).toBe("https://example.com/pluto.exe");
  });
});
