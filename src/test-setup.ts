// Vitest setup for every frontend test file.
import { configure } from "@testing-library/react";

// `findBy…` and `waitFor` give up after 1 s by default. Screens that need two or three queries
// to arrive (e.g. the "Yesterday" line on Today) can take longer than that on a slow CI runner:
// on 2026-10-13 one did on macOS (1.3 s) while passing locally and on Windows. 5 s still fails
// fast on a real bug; the per-test limit (vite.config.ts) is 15 s.
configure({ asyncUtilTimeout: 5_000 });

// The rich note editor (ProseMirror, U-1) measures text ranges to scroll the caret into view;
// jsdom has no layout, so these answer "nothing on screen" instead of throwing.
const noRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
const noRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) }) as DOMRect;
if (typeof Range !== "undefined") {
  Range.prototype.getClientRects ??= noRects;
  Range.prototype.getBoundingClientRect ??= noRect;
}
if (typeof Text !== "undefined") {
  (Text.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects ??= noRects;
}
if (typeof document !== "undefined" && !document.elementFromPoint) document.elementFromPoint = () => null;
