import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "src-tauri", "crates", "target", "node_modules", "spikes", "src/ipc/generated", "desktop-pet-docs/docs/learning"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    // Node-run tooling (not shipped): allow the Node globals it uses.
    files: ["scripts/**/*.mjs", "e2e/**/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly", setTimeout: "readonly", fetch: "readonly" } },
  },
  {
    // The website's one script runs in the visitor's browser.
    files: ["website/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        document: "readonly", window: "readonly", navigator: "readonly", localStorage: "readonly", matchMedia: "readonly",
        requestAnimationFrame: "readonly", performance: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly", fetch: "readonly", Image: "readonly", IntersectionObserver: "readonly",
      },
    },
  },
);
