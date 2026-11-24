// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { handle, stats } from "../src/api";
import { d1 } from "./d1";

/** The admin site draws exactly what the server's stats route returns. */
const code = readFileSync(resolve(import.meta.dirname, "../../admin/admin.js"), "utf8");
type Admin = { render: (s: unknown, root: HTMLElement) => void; demo: (days: number) => unknown };
function load(): Admin {
  (window as unknown as { PLUTO_ADMIN_NO_AUTOLOAD: boolean }).PLUTO_ADMIN_NO_AUTOLOAD = true;
  new Function(code)();
  return (window as unknown as { PlutoAdmin: Admin }).PlutoAdmin;
}

describe("admin site", () => {
  it("shows the server's downloads, installs and active users, with the funnel", async () => {
    const env = { DB: d1(), ID_KEY: "a", TOKEN_KEY: "b" };
    const now = new Date("2026-12-20T10:00:00Z");
    const body = (id: string) => JSON.stringify({ install_id: id, os: "macos", version: "0.6.1" });
    await handle(new Request("https://x/v1/hello", { method: "POST", body: body("3f2b8c1e-5a7d-4e2b-9c1a-7d8e9f0a1b2c") }), env, { now });
    for (let i = 0; i < 4; i++) await handle(new Request("https://x/d/mac", { headers: { "user-agent": "Mozilla/5.0 Safari" } }), env, { now });
    const root = document.createElement("main");
    load().render(await stats(env.DB, now, 30), root);
    const text = root.textContent ?? "";
    expect(text).toContain("Downloads, last 7 days");
    expect(root.querySelector(".tile.kpi .value")?.textContent).toBe("4");
    expect(text).toContain("25% of downloads");
    expect(text).toContain("macOS");
    expect(text).toContain("0.6.1");
    // Active line, downloads by system, new installs, installs per hour.
    expect(root.querySelectorAll("svg.chart")).toHaveLength(4);
    // Every per-day chart can be read as a table.
    expect(root.querySelectorAll("details.as-table").length).toBeGreaterThanOrEqual(4);
  });

  it("draws the demo layout, and puts names in as text, not HTML", () => {
    const admin = load();
    const root = document.createElement("main");
    admin.render(admin.demo(90), root);
    expect(root.querySelectorAll(".tile.kpi")).toHaveLength(6);
    expect(root.textContent).not.toContain("NaN");
    expect(root.textContent).not.toContain("undefined");
    expect(root.querySelectorAll(".tile.kpi .value")[5]?.textContent).toMatch(/^\d+%$/);
    // Two series (Windows, macOS) get a legend; retention cells use the one-hue scale.
    expect(root.querySelector("[aria-label=\"Website downloads per day\"] .legend")?.textContent).toContain("Windows");
    expect(root.querySelectorAll(".heat td[class^=l]").length).toBeGreaterThan(0);
    expect(root.textContent).toContain("+11%"); // weekly active 420 vs 380
    expect(code).not.toMatch(/innerHTML/);
  });

  it("is kept out of search engines and only talks to its own server", () => {
    const html = readFileSync(resolve(import.meta.dirname, "../../admin/index.html"), "utf8");
    const headers = readFileSync(resolve(import.meta.dirname, "../../admin/_headers"), "utf8");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(headers).toContain("X-Robots-Tag: noindex");
    expect(headers).toContain("connect-src 'self'");
    expect(code).toContain("fetch(`/api/v1/admin/stats?days=${days}`");
  });
});
