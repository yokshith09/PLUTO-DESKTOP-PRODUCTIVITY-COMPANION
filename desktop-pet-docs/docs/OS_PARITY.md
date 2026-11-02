# Feature parity across operating systems (2026-10-23)

Pluto ships **Windows and macOS** installers (release workflow matrix: `windows-latest`, `macos-latest`). **Linux has no build yet** (FR-57 planned). Everything is **Unverified on a real PC** except what the owner has tested on Windows (v2.0.0).

| Feature | Windows | macOS | Linux |
|---|---|---|---|
| Notes, tasks, meetings, routine, diary (planned), links, Today, Settings | ✅ | ✅ | ⬜ no build |
| Desktop pet window, reactions, bubbles, pet library, ZIP import | ✅ | ✅ (transparent window; drag uses OS move) | ⬜ |
| Daily greeting, birthdays, nudge budget, messages above the pet | ✅ (see bug S1) | ✅ (see bug S1) | ⬜ |
| System reminder notifications | ✅ | ✅ (needs notification permission) | ⬜ |
| Open at login (autostart) | ✅ registry Run key | ✅ login item | ⬜ |
| Global shortcuts | ✅ | ✅ (may need Accessibility for some keys) | ⬜ |
| **App time tracking** (`tracking.rs`) | ✅ event hook, no polling | ✅ checks once a second (exception to ADR-009) | ⬜ "unavailable" |
| **Pet and card seen through; dashboard counts as Pluto** (0.5.8) | ✅ by window handle | ✅ by which Pluto window has focus (compiled and tested in CI only) | ⬜ |
| **Hover card in its own window** (0.5.8) | ✅ shown without activating | ✅ shown with `focus: false` (CI only) | ⬜ |
| **Away after 10 minutes** (0.5.8) | ✅ | ✅ | ⬜ |
| **Website time** (`sites.rs`) | ✅ Chrome, Edge, Brave, Firefox… via UI Automation; private windows skipped (English UI only) | ✅ Chrome, Edge, Brave, Vivaldi, **Arc** (AppleScript), **Firefox** (session file, ~15 s behind); **Safari** only with the opt-in switch (private windows can't be told apart) | ⬜ |
| **Open tabs list / close tab** (`tabs.rs`) | ⚠️ the browser window **in front only**; domain only for the visible tab | ✅ Chrome-family + **Arc** + **Safari** (opt-in) list and close; **Firefox** listed, can't be closed | ⬜ |
| **Typing along** (`typing.rs`) | ✅ keyboard hook counter | ✅ system key counter; needs Input Monitoring (+ Accessibility for the text-box part) | ⬜ |
| Code signing | ❌ unsigned (SmartScreen warning) → SignPath once the repo is public | ❌ unsigned (Gatekeeper; needs Apple Developer $99/yr) | — |

**Gaps to close for parity:**
1. Linux build (FR-57): AppImage + .deb; tracking via X11 (`_NET_ACTIVE_WINDOW`) and a Wayland fallback ("unavailable"); typing via evdev needs permissions — likely "unavailable" on Wayland.
2. ~~macOS Safari/Firefox/Arc~~ done 2026-10-23 (Unverified); Safari stays opt-in.
3. Windows tabs: all windows, not just the front one (UI Automation can walk every browser window).
4. Signing on both platforms.
