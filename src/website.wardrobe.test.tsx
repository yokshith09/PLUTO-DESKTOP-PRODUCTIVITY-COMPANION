import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccessoryIcon } from "@/features/wardrobe/Accessories";
import { ITEMS, OUTFITS } from "@/features/wardrobe/wardrobe";

/**
 * The website's dressing room uses the app's own accessory drawings and outfits, copied out of
 * Accessories.tsx and wardrobe.ts so the site needs no build step. This test keeps the copies equal
 * to the app. After changing an accessory, refresh them with:
 *   WRITE_SITE=1 pnpm vitest run src/website.wardrobe.test.tsx
 */
const dir = resolve(import.meta.dirname, "..", "website", "wardrobe");
const write = process.env.WRITE_SITE === "1";

/** Each item twice: in the bear's 200x200 space (to wear) and cropped (for its button). */
function files(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of ITEMS) {
    const icon = renderToStaticMarkup(<AccessoryIcon id={item.id} />)
      .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace(' aria-hidden="true"', "")
      .replace(/ data-icon="[^"]*"/, "");
    out[`${item.id}-icon.svg`] = `${icon}\n`;
    out[`${item.id}.svg`] = `${icon.replace(/viewBox="[^"]*"/, 'viewBox="0 0 200 200"')}\n`;
  }
  const data = {
    note: "Copied from src/features/wardrobe (wardrobe.ts and Accessories.tsx) by src/website.wardrobe.test.tsx. Do not edit by hand.",
    items: ITEMS.map(({ id, name, slot }) => ({ id, name, slot })),
    outfits: OUTFITS.map(({ id, name, items }) => ({ id, name, items: [...items] })),
  };
  out["wardrobe.json"] = `${JSON.stringify(data, null, 2)}\n`;
  return out;
}

describe("website dressing room", () => {
  it("wears the app's own accessories and outfits", () => {
    if (write) mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(files())) {
      const path = resolve(dir, name);
      if (write) writeFileSync(path, text);
      expect(existsSync(path), name).toBe(true);
      expect(readFileSync(path, "utf8"), name).toBe(text);
    }
  });
});
