// Bundles the counting server into one JavaScript file, server/dist/pluto-api.js, for pasting into
// Cloudflare's online editor (Workers & Pages → pluto-api → Edit code) when deploying without a
// terminal. `wrangler deploy` does not need this file. Run: pnpm build:server
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [resolve(here, "src/index.ts")],
  outfile: resolve(here, "dist/pluto-api.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "neutral",
  legalComments: "none",
  banner: { js: "// Pluto counting server, bundled from server/src by `pnpm build:server`. Do not edit here." },
  logLevel: "warning",
});
console.log("server/dist/pluto-api.js");
