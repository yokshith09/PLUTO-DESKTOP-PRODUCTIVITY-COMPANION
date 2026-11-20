import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const conf = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8")) as { bundle: { resources: Record<string, string> } };
const shipped = Object.keys(conf.bundle.resources);

/**
 * 2026-11-19: the installer shipped the four built-in characters without their `pluto.json`, so no
 * character's own reactions or special worked in the installed app. Each shipped pack now ships whole.
 * (Mira and Raja were deleted from the app, owner 2026-11-20.)
 */
const SHIPPED = ["bolt", "ghosty", "mochi", "pip"];
describe("built-in characters in the installer", () => {
  it("only ships packs that exist", () => {
    const packs = readdirSync(resolve(root, "packs"));
    expect(packs).toEqual(expect.arrayContaining(SHIPPED));
  });
  for (const id of SHIPPED) {
    it(`ships ${id} with its pet.json, pluto.json and sprite sheet`, () => {
      for (const f of ["pet.json", "pluto.json", "spritesheet.webp"]) {
        expect(existsSync(resolve(root, "packs", id, f))).toBe(true);
        expect(shipped).toContain(`../packs/${id}/${f}`);
      }
    });
  }
});
