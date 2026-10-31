# Pluto — Project Status

**Last updated:** 2026-10-27 (version 0.5.1 prepared: owner's polish list, pet fixes, time-tracking gaps, analytics; front-end 361 / Rust 31 shell + 421 core passing; Windows and macOS targets compile-checked and linted from Linux; all OS parts Unverified) · 2026-10-26 (version 0.5.0 prepared; project rename added; later: task editor and Projects redesigned, quote highlighted, Today tiles resizable, J1 character standard, J2 character skill + prompt, J3 changeable reactions and hello bubble — all Unverified on a real OS) · 2026-10-26, UI reset batch 2 built (F character page, G settings, H pet timer/media/card, I2 Time analytics; front-end 314 / Rust 446 passing; OS parts Unverified; J1–J3 not started) · 2026-10-25, release 0.4.0 draft building for owner testing (owner: "build a draft release so I can test") · 2026-10-25, later (owner's UI reset batch 1 built: Today with Focus tile and quotes, task editor rebuilt with explained settings, task reminders with lead time and sound, focus length per task, Tasks week tile, Notes toolbar and own window, Projects tab, built-in characters usable, small-window layout; migration 007; front-end 271 / Rust 438 passing; OS parts Unverified — the preview canvas was deleted at the owner's request) · 2026-10-25 (owner asked for a UI reset → **preview published, no screen changed until approved**; fixed: File Explorer counted for the desktop/taskbar/Alt+Tab (Windows, Unverified), Save in the task editor always closes, daily hello can't show twice; front-end 251 / Rust 433 passing) · 2026-10-23 (version 0.3.0 — draft release building for owner testing; FM-V2 fixes all built — FR-43 edges, FR-44, FR-45, FR-46, FR-48, FR-62 — Unverified, ready for a draft release; front-end 249 / Rust 432 passing; FR-111 hover-card shortcuts and dashboard messages when the pet is hidden, Unverified; front-end 239 / Rust 425 passing; focus sessions FR-05 and the timer by the pet FR-110 built, Unverified; tests re-run: front-end 237 passed / 5 skipped, Rust 425 passed, all checks clean; late night: task links, stars, chosen days, repeating tasks built — FR-106…FR-109, migration 004, Unverified; tests re-run: front-end 226 passed / 5 skipped, Rust 414 passed, lint/typecheck/clippy/fmt/core-deps clean; night: student-pack preview redesigned and now-strip preview (FR-88) published, spec draft with open questions — previews only, no code; notifications only above the pet — toast stack and `sonner` removed, Undo/Done by clicking the pet, Unverified; front-end tests re-run 208 passed / 5 skipped; new-feature building paused until the remaining FM-V2 fixes are done; pet-visibility fixes + macOS Arc/Firefox/Safari, Unverified; companion phase: FR-90/92/93/94/96 built, Unverified; tests re-run 2026-10-23 end of phase: front-end 198 passed / 5 skipped, Rust 386 passed, lint/typecheck/clippy clean — all new features Unverified on Windows; routine reminder above the pet, FR-52 built; FR-41 toasts and FR-85 daily routine built, Unverified; earlier 2026-10-22: building started: FR-47 and FR-61 built, Unverified; pet library FR-63 built, Unverified — tests: 385 Rust, 154 front-end passing this session; planning closed; cleanup; master plan written: `MASTER_PLAN.md`; sprite poses drawn for all pack rows, Unverified; numbers below are from 2026-10-19 and were not re-run) · earlier: 2026-10-19 · **Owner-reported release:** `v2.0.0` tag (points at `4bad6a2`, the same commit as `v0.2.0`; installed and tested by the owner). Source version in `tauri.conf.json`/`Cargo.toml`/`package.json` is **0.2.0** and stays that way (owner decision 2026-10-19, D-VERSION). **Work branch:** `main` only (owner decision, 2026-10-19: one branch; `claude/repo-context-review-trprp8` identical to `main` and removed). Code signing **on hold** (owner, 2026-10-19). All OS features Unverified until the owner's test results are recorded. PR #1 and PR #2 are merged. Releases: `v0.1.0` published; `v0.1.1` draft (pet); `0.1.2` adds pet reactions and the soft-3D bear; `0.1.3` drops the overdue reaction and makes the bear sleep only when nothing has happened for 15 minutes.
**Read this first.** Then [`ROADMAP.md`](ROADMAP.md) (plan), [`DECISIONS.md`](DECISIONS.md) (why) and [`CHANGELOG.md`](CHANGELOG.md) (what changed).

Every claim is tagged with how it was checked. **Fact** = seen in code, tests, Git or CI. **Inference** = a reasoned guess from facts. **Unknown** = no evidence either way.

---

## 1. Summary

1. **Fact:** Pluto is a Tauri v2 app: Rust core (`crates/pluto-core`, no Tauri dependency), thin shell (`src-tauri`), React + TypeScript UI (`src`).
2. **Fact:** On 2026-10-11 the owner decided: merge now and build in one branch (done: PR #1 merged), no Progress card, calendar shows the next 7 days, autostart is built before the first release, the phase order stays as locked (ADR-015), M1 is labelled v0.1 and v1.0.0 stays for the full Phase 1.
3. **Fact:** The whole M1 build list is now implemented: Notes (Markdown preview, label manager, shortcuts), Tasks (page, all views, status controls, defer, detail, work updates, delete, search), daily-log history on the Time page, autostart, export/import/delete-all, installer workflow, coverage floors.
4. **Fact:** Tests run on 2026-10-19 (`4bad6a2`): **376** Rust tests (core + shell) pass; **111** frontend tests pass (18 files); `cargo clippy -D warnings`, `cargo fmt --check`, `pnpm lint`, `pnpm typecheck`, `pnpm check:core-deps` pass; generated types are fresh.
5. **Fact:** Coverage measured today: `pluto-core` **97.3%** of lines; frontend **89.7%** lines. CI now enforces floors (core ≥ 90% lines; frontend lines/statements ≥ 80, branches ≥ 70, functions ≥ 55).
6. **Fact (owner, 2026-10-11):** the owner installed v0.1.0 on Windows; the app opens, app tracking lists apps (Pluto, Claude, File Explorer) and tasks can be added. The owner reported: no desktop pet, colours confusing, the dashboard opened full screen, no way to delete every task. All four are addressed in 0.1.1 (§4.6), **Unverified** until the owner installs it.
7. **Unknown (the main risk):** the rest of the Windows checklist (§8) has not been run line by line. Everything that needs the operating system is **Unverified**: the tray, reminder notifications, the Windows app tracker, opening links, **autostart**, the **file dialogs for export and import**, and the **installer**.
8. **Fact:** CI failed on `00ae175` (2026-10-11 08:17 UTC) because the demo data in the frontend tests depended on the time of day. Fixed in `3ed177f` with a regression test; CI is green on it for Windows and macOS.

**M1 (first release) is feature-complete in code.** What stands between here and a release is **verification on a real Windows PC (G1)** and **signing certificates (owner)**.

---

## 2. What each status word means

| Word | Meaning |
|------|---------|
| **Complete** | Built, automated tests pass, CI green. Nothing known missing. |
| **Unverified** | Built and compiles, but it needs a real machine or OS to prove it works. Never call these verified until someone runs them. |
| **In progress** | Work started and not finished. |
| **Partial** | A screen or code path exists but part of the requirement is missing. |
| **Planned** | Written in the docs, no code. |
| **Blocked** | Cannot continue until something outside the code is decided or done. |
| **Deprecated** | Removed or replaced on purpose. |

---

## 3. Current work

| Item | Detail |
|------|--------|
| **Current milestone** | **M3 — Browser tracking and privacy** is feature-complete for DECISIONS U16 option (d) and shipped as the owner's `v2.0.0` tag (commit `4bad6a2`); the owner has installed and tested it. Status: **Unverified** on a real PC until the owner records results. **No milestone is being built now:** owner instruction (2026-10-19) is docs only until the feature document is agreed. |
| **Just finished** | Owner's first-test fixes (0.1.1): desktop pet with hover card, click / double-click / right-click menu, drag, global shortcuts; Pet and Shortcuts settings; calmer colours; main window opens at 1180×760 and remembers its size; delete any task. See the CHANGELOG. |
| **Open work** | Owner's test results for v2.0.0 (record in §8). Feature document: [`FEATURE_ROADMAP.md`](FEATURE_ROADMAP.md) and [`docs/features/FR-requested-features.md`](docs/features/FR-requested-features.md). Meetings UX needs redesign (owner, 2026-10-19; deferred to a later phase). Shortcut master switch, off by default (new requirement FR-37, not built). |
| **Blockers** | Signing **on hold** (owner, 2026-10-19). Owner asked for the remote branch `claude/repo-context-review-trprp8` to be deleted; deletion failed from this session (proxy hang-up, retried). Owner or a session with push rights to run `git push origin --delete claude/repo-context-review-trprp8`. |
| **Characters (2026-10-28)** | Each character has its own pose for common moments and one special (`pluto.json`: click / every N tasks / daily), shown on the Character page with a Watch button. `pluto-character` skill rebuilt: name + picture in, one ZIP out (`pack.py prepare/finish`, ten finished prompts, layout guides). Alignment is enforced by code (`pack.py build` and the stricter `check`); our five characters failed the new check (clipped waving/jumping, bobbing feet) and were rebuilt through it. Rust + Python + TypeScript tests pass. **Unverified:** nobody has seen the animation play on a real PC, and the skill has not had its first real run with the Codex image tool (owner's). |
| **Docs in progress (2026-10-22)** | Emote and Reactions System defined as FR-40 in [`docs/character/EMOTE_FEATURE_SPECS.md`](docs/character/EMOTE_FEATURE_SPECS.md); all **Planned**, except: the bear now has drawn three-quarter, back and look-back views and a tested `back_turn_shake` sequence runner with a preview button on the Character page, now also for Mochi, Pip, Bolt and Ghosty (**Unverified**: not seen on a real PC, not wired into the pet window). Rive trial (CH-08) **blocked**: needs a `.riv` authored by the owner in the Rive editor. |
| **Next** | Owner's order after M3 (`ROADMAP.md`): M4 Quick Actions. Not started; not to start without the owner's go-ahead. |
| **Where we stand (2026-10-27)** | **Phase:** P1 Fix & polish (FM-V2) is built in full, and work since has been the owner's UI reset batches 1–2 and polish lists, with parts of P3 Characters pulled forward (wardrobe FR-49 first part, reactions, packs, hover and sleep for picture pets). **Milestone:** none being built; M0–M3 are code-complete and FM-V2 is built, all awaiting the owner's Windows results. **Versions:** 0.5.0 draft built; 0.5.1 is this batch. **Against plan:** P1 done in code; P2 Student release (FM-ST, FM-GUIDE, M8 beyond focus sessions) not started; P3 about a third (packs, import partly, wardrobe, reactions, Reactions page; not yet gallery, export, schedules, cursor gaze, studio); P4–P7 not started. **The real gap is verification:** nothing since v2.0.0 has a recorded Windows result. **2026-10-28:** 0.5.2 drafted with two new characters (Mira, Raja), Unverified; student pack built (courses, exam countdown, weekly report; migration 008), Guide in Settings, credit line, and the encrypted Diary (migration 009), all Unverified on a real PC; the now strip is skipped by the owner. **Next features (owner's call):** (1) owner tests 0.5.1 on Windows and records results; (2) FM-ST student pack + diary + now strip; (3) wardrobe schedules FR-64 and pack export; (4) re-plan the music buttons; (5) M4 Quick Actions. |
| **2026-10-29** | **Re-planned** (`MASTER_PLAN.md`): next milestone is MCP (P4 Developer & MCP); Voice is its own phase for a second developer (P6); small features are one phase (P5). **Built since 0.5.2, Unverified on a real PC, not yet released:** crash-safe time tracking (journal, migration 011; schema is now version 11, 28 tables), Tasks and Notes lists draw 100 rows at a time, four accessibility fixes found by an automated scan, `zip` 9 (advisories), dependency audit in CI. Tests re-run: 472 Rust (pluto-core) + 34 shell, 469 UI. Still open: a real screen-reader pass (owner's PC). |
| **2026-10-31 (late)** | **Open bug, owner report on 0.5.5:** between 22:08 and 22:53 (45 min of continuous keyboard and mouse use in ChatGPT, VS Code and Claude, Pluto not used) the total grew by 24 min. Not explained by the known rules (idle, Pluto itself, desktop). Cause unknown; 0.5.6 does not address it. Next step: the owner runs `scripts/tracking-report.py` to list the stored sessions and gaps for that hour. MCP design questions and E1/E2 answered (`DECISIONS.md`). |
| **2026-10-31** | **0.5.5 published; 0.5.6 drafted.** Owner confirmed on a real PC that the hover-card blink is fixed in 0.5.5 (first item verified since v2.0.0). 0.5.5 does not contain the live-total fix (idle read at read time); it is in 0.5.6. Mac: not yet run by anyone (owner to test). |
| **2026-10-30** | **Time-tracking accuracy audit** (see `AUDIT_2026-10-28.md` pass 5, `DECISIONS.md` 2026-10-30): the total could climb through idle minutes and fall back; finished sessions vanished from the total for up to a minute; films and calls with no input were cut after 5 minutes; a missed focus event lost time; a clock set back froze the stretch. Fixed in `pluto-core` (tested, two tests proven to fail before the fix); the Windows part type-checks, the macOS part is compiled only in CI. **All Unverified on a real PC.** Tests: 482 Rust (pluto-core) + 34 shell. Correction 2026-10-31: the "climb then fall" fix was incomplete (a drop of up to two minutes remained between looks); closed in 0.5.5 by reading the idle time at read time. Tests now 492 Rust (pluto-core). |
| **2026-10-30** | **Renamed to Pluto** (`DECISIONS.md` 2026-10-30): 262 files, one tagline, a one-time copy of an earlier build's data into the new folder. Tests: 489 Rust (`pluto-core`, 7 new for the data copy) + 34 shell, 469 UI. Not run on a real PC; trademark and domain search still to do. |
| **2026-10-31** | **Checklist and Character layout fixes** (`CHANGELOG.md` Unreleased, `DECISIONS.md` 2026-10-31 evening): checklists in notes now behave as lists (button works on an empty note, Enter continues, Preview boxes tick and save, cards show ☐ ☑); the Character page has no empty block under the Wardrobe at widths 1180, 1400 and 1700 (measured in a browser against the in-memory shell). **Unverified on the real Tauri window.** Tests: 479 UI. Plan for assistant/VS Code/build/CI notifications written under P4 in `MASTER_PLAN.md`; **local MCP first, network layer after**. **0.5.4 is published; its End-to-end check is red on `main`** (it was red on the four commits before too; cause not yet read). |
| **2026-10-31 (night)** | **0.5.5 drafted** (fixes on top of the published 0.5.4): the second-pet blink above the hover card (diagnosed from the code, fix not seen on a real PC), checklists, Character layout. **If the blink is still there:** check Task Manager for two Pluto processes, or an old Loaf still running from before the rename (the old app and the new one both start with Windows and sit at the same saved spot). **Time tracking:** its fixes are in 0.5.4, which the owner has installed; 0.5.5 changes nothing there; the stopwatch checks in §8 are what settle it. After MCP: rich-text notes, two-tab Settings, task editor, Diary and Study (`MASTER_PLAN.md`). |
| **Latest (2026-10-26, after 0.5.0)** | Built, local, **Unverified on a real PC**: wardrobe (accessories and outfits for every character, FR-49 first part), music buttons (UI removed 2026-10-27, parked), richer per-app sessions view in Time. Tests re-run in this session: see CHANGELOG. Seasonal/weekday outfit schedules (FR-64) are still Planned. **0.5.0 CI failed on Windows only** (a compile error in the media-key code, now fixed and cross-checked against the Windows target). |

---

## 4. Feature audit

**How verification was done:** *core* = `cargo test --workspace` (376 pass, 2026-10-19); *UI-mock* = Vitest against the in-memory demo shell (111 pass, 2026-10-19); *CI* = Windows + macOS jobs; *human* = used in the real app (none recorded).

### 4.1 Foundation (Phase 0)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| F0-01 | Scaffold | Complete | Builds in CI on both OSes. **V-1 (oldest macOS): Unverified**, needs a Mac. |
| F0-02 | CI matrix, V-2 RAM job | Complete (CI) / Unverified (final V-2) | `v2-ram` jobs pass; the numbers were not read. Gate: private working set (ADR-020). |
| F0-03 | Event bus | Complete | core |
| F0-04 | Database, migrations 001–003 | Complete | core |
| F0-05 | DB writer thread | Complete | core; `compact()` added for delete-all |
| F0-06 | Clock, midnight rollover | Partial | Core + scheduler wired. **Missing:** wake-from-sleep and timezone-change hooks (no code in `src-tauri`). |
| F0-07 | Settings, typed IPC | Complete | core + UI-mock |
| F0-08 | Tray, single instance, close-hides, quit | Unverified | 4 tray tests; never run on a desktop. Window position not remembered. |
| F0-09 | Autostart `--hidden` | **Unverified** | Built: login item via the autostart plugin, `--hidden` starts hidden in the tray (window created hidden), second `--hidden` launch does not pop the window, reconcile at startup (4 combinations tested), login item removed on Delete all. Never run on a real OS. |
| F0-10 | Frontend shell | Complete | UI-mock |
| F0-11 | Export / import / delete all | **Unverified** (core Complete) | 9 core tests: round trip is identical, import refuses a non-empty Pluto, wrong format/newer schema/damaged row/missing parent imports nothing, `DELETE` must be exact, append-only rules restored. **Unverified:** the system file dialogs and file writing in `src-tauri/src/ipc.rs`. |
| F0-12 | Performance harness | Partial | `scripts/ram` measures V-2 only. V-3, V-5 have no harness. |
| F0-13 | Errors and logging | Complete | core |

### 4.2 P0 — Notes

| Req | Feature | Status | Evidence |
|-----|---------|--------|----------|
| R1-01 | Create note, discard if empty | Complete | core + UI-mock |
| R1-02 | Autosave | Complete | 500 ms (PRD v1.5), saves on closing the editor |
| R1-03 | List, pinned first, three sorts | Complete | core + UI-mock |
| R1-04 | Edit; `edited_at` only on real change | Complete (core) | cursor-at-end Unknown |
| R1-05 | Delete | Complete | 30-day Bin + Undo (PRD v1.5) |
| R1-06 | Pin / unpin | Complete | card hover, editor toolbar, `Mod+D` |
| R1-07 | Archive / restore | Complete | `Mod+Shift+A` in the editor |
| R1-08 | Labels | Complete | add, create inline, **Manage labels** dialog (rename, delete with confirm, name clash refused), `Mod+L` |
| R1-09 | Label filter with counts | Complete | chips on the Notes tab |
| R1-10 | Colours | Complete | |
| R1-11 | Markdown edit / preview | **Complete** | `react-markdown` + GFM; raw HTML shown as text (tested); task boxes read-only; links open via `open_url`; `Mod+E` |
| — | Notes search | Complete | substring on title and body |

### 4.3 P0 — Tasks and daily work

| Req | Feature | Status | Evidence |
|-----|---------|--------|----------|
| R1-20/21 | Create, quick add | Complete | Today, Tasks page, `Mod+T` |
| R1-22/23 | Status machine, buttons | **Complete** | Task detail offers only valid moves (Start, Pause, Resume, Complete, Cancel, Reopen); mirrors the PRD table, tested cell by cell |
| R1-24 | Defer | **Complete** | Tomorrow or a chosen day; history records it |
| R1-25 | Work updates | **Complete** | new core code: add, list newest first, delete only within 5 minutes; tested |
| R1-26 | Link a note | **Complete** | picker in task detail |
| R1-27 | Views + filters | **Complete** | Tasks page: Today, Upcoming, Pending, All, Completed; priority, project, status, date range |
| R1-28 | Overdue badge | Complete | |
| R1-29 | Delete task | **Complete** | finished tasks only, with confirmation |
| — | Task search | **Complete** | box on the Tasks page (title, description, project) |
| R1-40–43 | Daily log: live, freeze, missed days | Complete (core) / Unverified (real rollover) | 23 core tests |
| R1-44 | History with compare | **Complete** | Time page "Daily log": last 14 days, done of planned, change vs the day before, expand to see tasks |
| R1-45 | Export a day as Markdown | **Complete** | copy-to-clipboard button per day (clipboard is Unverified on a real OS) |
| — | Daily progress | Complete | Done this week, Activity, Daily log. **No Progress card** (owner, 2026-10-11) |

### 4.4 Owner additions

| Feature | Status | Evidence |
|---------|--------|----------|
| Reminders | Complete (core + UI) / Unverified (OS notification) | |
| Bin (30 days) | Complete | |
| Today overview with drag-to-reorder tiles | Complete | UI-mock |
| Calendar on Notes: **next 7 days** | Complete | UI-mock |
| Links card | Complete (UI) / Unverified (opening in a real browser) | |
| App and site time tracking | Core Complete; Windows collector **Unverified** | |
| Time page with filters and daily log | Complete (UI-mock) | |

### 4.5 Release (M1 gate)

| Item | Status |
|------|--------|
| G1 Real-Windows checklist (§8) | **Open — owner** |
| G2 Export / import / delete all | Unverified (built) |
| G3 Autostart | Unverified (built) |
| G4 Installer | **Built, Unverified** (version in source is still `0.2.0` while the owner's tag is `v2.0.0`; see header). Signing **on hold**: changing the version in `src-tauri/tauri.conf.json` on `main` (or pushing a `v*` tag, or pressing Run workflow) runs `.github/workflows/release.yml`, which builds installers on Windows and macOS and creates a **draft GitHub Release** `v<version>` with them (publishing it = one click, and creates the tag). `webviewInstallMode: embedBootstrapper`. Version at the time of the first build was `0.1.0` (now 0.2.0). The workflow ran successfully on 2026-10-11 and produced `Pluto_0.1.0_x64-setup.exe`, `Pluto_0.1.0_x64_en-US.msi` (Windows) and `Pluto_0.1.0_aarch64.dmg` (Apple Silicon only; no Intel Mac build). None of these installers has been installed or run by a person yet. **Signing: not set up** (needs the owner's certificates). |
| G5 Time-of-day test bug | Fixed (`3ed177f`) |
| G6 Coverage floors | Done (core ≥ 90% lines, frontend thresholds) |

### 4.6 Rest of Phase 1 (v1.0.0), later phases

| Item | Status |
|------|--------|
| Meetings (F1-17…19) | **Built** 2026-10-12: list (newest first, filter by participant and dates), editor that saves itself, participants with suggestions, Markdown notes, decisions and action items (reorder), follow-up date, action item → task with live status, delete. Core `crates/pluto-core/src/meetings.rs` (9 tests), UI `src/features/meetings/`. Not yet: follow-ups on the Today overview (R1-70, F1-23). |
| Pet window (F1-22) | **Built, Unverified** (owner asked for it after testing v0.1.0). Transparent, always-on-top window with the animated bear (breathing, blinking, waving on hover, sleeping after 15 quiet minutes; CSS transforms only). Hover → card with today's total, top 3 apps, top 2 tasks, next reminder, done/open counts; the window grows toward the free side of the screen. Click opens Pluto, double-click hides it, right-click opens a native menu (open/hide, new note, new task, tracking on/off, settings, hide pet, quit), drag moves it and the spot is remembered. Code: `src-tauri/src/pet.rs`, `src/pet/`. **0.1.2:** soft-3D redraw and reactions with speech bubbles (task added, done, all done, started, reminder, deleted; overdue removed in 0.1.3; `src/pet/reactions.ts`); Character page previews every pose. Missing from F1-22: reactions to app/focus time. |
| Global shortcuts + quick-add popup (F1-24) | **Built, Unverified**: `Mod+Shift+L` and `Mod+Shift+N` can be changed in Settings › Keyboard shortcuts (press the keys; Esc cancels; clashes refused; Reset); `Mod+Shift+P` fixed. The shell re-registers on change. Quick-add popup and `Mod+Shift+T` removed (owner). |
| Settings screens (F1-25) | **Built**: Appearance, General, Notifications, Desktop pet, Keyboard shortcuts, Privacy and tracking, Your data (with database location), Advanced (log detail, logs folder, reset settings), About (licenses). Folder buttons and live log level are **Unverified** on Windows. |
| First run (F1-26) | **Built** (welcome screen S-00, `src/features/welcome/Welcome.tsx`; tests in `App.test.tsx`): add a task, write a note, log a meeting. |
| Phase 2 rest: browser extensions, bridge, macOS collector, open tabs | Planned |
| Phases 3–7 | Planned |

### 4.8 Windows vs macOS parity (audit 2026-10-18, from the code; nothing run on either OS by the developer)

| Feature | Windows | macOS | Parity |
|---|---|---|---|
| App time | Foreground window events | NSWorkspace, 1 s poll | Yes (different mechanism) |
| Site time | UI Automation address bar: Chrome, Edge, Brave, Firefox (Firefox untested) | AppleScript: Chrome, Edge, Brave, Vivaldi | **Gap**: Firefox only on Windows, Vivaldi only on Mac; Safari/Arc nowhere |
| Private windows | Skipped; Chrome/Brave detected by English toolbar text, unknown windows skipped | Skipped via the browser's own incognito flag | **Gap**: Windows detection is English-only (non-English Chrome may record nothing) |
| Open tabs | Titles for all tabs, domain only for the showing tab | Domain for every tab | **Gap** |
| Close tab | Tab's own Close button | AppleScript | Yes |
| Permissions | None | Automation prompt per browser; Accessibility for text-box; Input Monitoring for typing-along | Different by OS |
| Privacy radar | Same | Same | Yes (uses the stored sites) |
| Verified on real machine | No | No | n/a |
| Pet window resize (card opening) | One call moves and resizes (`SetWindowPos`), so no jump | Two calls (size, then position) | **Gap**: the "pet jumps when the card opens" fix of 0.2.x is Windows-only; the 0.5.5 blink fix is in the page and applies to both, but was diagnosed for Windows |
| Hide while another app is full screen | Asks Windows (full-screen state) | Looks for an ordinary window that covers a screen | Yes (different mechanism) |
| Held screen counts as activity (films, calls) | `ES_DISPLAY_REQUIRED` | `PreventUserIdleDisplaySleep` | Yes |
| Which app is in front, corrected at each look | Asks `GetForegroundWindow` | Already polled each second | Yes |
| Removing an earlier Loaf | Installer (`-setup.exe` and `.msi`) | One-time dialog in the app | Yes, different mechanism |
| Linux | Not supported: tracking, typing, media and full-screen detection are stubs; planned P7 | | n/a |

Not fixable without the other OS: Safari (private windows can't be told apart, kept off on purpose), Arc and Firefox on Mac (no way to ask), Windows localisation. The UI now lists the right browsers per OS.

#### How often Pluto looks at the computer (audit 2026-10-26, from the code)

| What | Windows | macOS |
|---|---|---|
| Which app is in front | Not polled: a Windows event fires on each change | Looked at once a second, reported only on change |
| Idle check (is the person still there?) | Every 60 s, only while tracking is on and a trackable app is in front; away after 5 min with no input, and the time stops at the last input | same |
| Waking from sleep | Seen as a gap of more than 150 s between two idle checks; the session ends at the last check | same |
| Saving to the database | One batch 60 s after the first unsaved session | same |
| Typing along (off by default) | Key count every 200 ms while on | same |
| Sites in the browser (off by default) | Every 2 s while the browser is in front | same |
| Pet wake/monitor watcher | Every 60 s | same |

Known causes of "wrong time" found in this audit: (1) the app in front was not counted until you left it — **fixed 2026-10-26**; (2) up to ~6 minutes after you walk away showed as active — **fixed 2026-10-27** (live total stops at the last input); (3) all Microsoft Store apps shared one name, "Windows App" — **fixed 2026-10-27** (Windows type-checked and linted, not run); (4) on a Mac, clicking the desktop counted as Finder — **fixed 2026-10-27** (type-checked and linted for macOS, not run); (5) time in Pluto's own windows counted as "Pluto" — **no longer counted (decision 2026-10-27)**. All Unverified on a real machine.

Audit pass 3 (2026-10-28): (6) **open, not fixed:** if Pluto is killed or the PC loses power, the stretch in progress (kept in memory until it ends) is lost; options in `AUDIT_2026-10-28.md`, owner decides. 0.5.2 itself changed no time-tracking code.

### 4.7 Deprecated

| Item | Replaced by |
|------|-------------|
| Global search (ADR-006, ADR-014, R1-50…56) | Removed (ADR-017); plain notes and task search added |
| Separate Overview / Today pages | One Today overview |
| Sidebar label list | Label chips on Notes + Manage labels |
| Progress card, Coming up, stat strip | Removed (owner) |
| Mon–Sun week calendar | Next 7 days |

---

## 5. M1 build list — done

N1 Markdown · N2 label manager · N3 pin shortcut and keyboard map · N4 PRD amended (v1.5) · T1 Tasks page · T2 status controls · T3 defer · T4 task detail with work updates and linked note · T5 delete · task search · D-a daily-log history (Time page) · D-b compare + Markdown copy · D-c dropped by the owner · G2 · G3 · G4 (workflow, unsigned) · G5 · G6.

Remaining for release: **G1**, **signing**, version bump, and fixing whatever G1 finds.

---

## 6. Known risks and defects

| # | Problem | Evidence | Severity |
|---|---------|----------|----------|
| R1 | No wake-from-sleep or timezone-change hooks. If the PC sleeps over midnight the rollover relies on the startup catch-up and the day scheduler. | no code in `src-tauri`; core has multi-day-gap tests | Medium |
| R2 | The Windows tracker, tray, notifications, autostart, file dialogs and installer have never run on real Windows. | no record | **High** |
| R3 | The pet uses a transparent window. On Windows it needs WebView2 transparency; on macOS the private API (`macOSPrivateApi`), which the Mac App Store does not allow. Nobody has seen it on a real desktop yet. | `tauri.conf.json` | Medium |
| R9 | The pet's animations run all the time while it is visible. R1-65 asks for ~0% CPU when idle; CSS transforms are cheap but not zero. Not measured. | `src/index.css` | Low |
| R4 | Delete-all removes the login item through the autostart plugin; if the plugin refuses, the item can stay. The warning is logged. | `src-tauri/src/autostart.rs` | Low |
| R5 | Export holds the whole database in memory (fine at expected sizes; the 5000-item fixture is not measured). | `data.rs` | Low |
| R6 | Feature spec files F0-01…F0-13 still say DRAFT. | `docs/features/*.md` | Low (doc debt) |
| R7 | GitHub shows the repository as `DESKTOP-PRODUCTIVITY-TRACKER`. This cloud session can only push through the old name, so the **local remote on your PC needs updating by you**: `git remote set-url origin https://github.com/yokshith09/DESKTOP-PRODUCTIVITY-TRACKER.git` | push attempt to the new URL was refused by the session's git proxy | Low |
| R10 | Until 2026-10-12 the app never started its logger, so no log file or crash report was ever written (F0-13 was built in the core but not wired). Fixed; logs are in the app's log folder (Settings › Advanced › Open logs folder). | `src-tauri/src/logs.rs` | Fixed, Unverified |
| R11 | The Windows end-to-end job depends on a matching Microsoft Edge Driver (installed by `msedgedriver-tool` in CI). If WebView2 and the driver drift apart, the job fails before any test runs. **2026-10-13: ruled out** — CI's own log shows the tool correctly detecting WebView2 153.0.4234.48 and downloading the matching driver. The real failure (every run so far) is "session not created: DevToolsActivePort file doesn't exist" after three ~60s-apart launch attempts; most likely Windows Defender's real-time scan of the freshly-built debug `.exe` outrunning chromedriver's internal wait for its debug port. The Defender theory was wrong (exclusion did not help). A probe showed WebView2 starts but the debug flag never reaches it; likeliest cause is a leftover WebView2 process from the smoke test on the same profile. Fix pushed (dc0c8f8): kill the whole process tree and clear leftovers. **2026-10-18: NOT fixed.** The first full run with dc0c8f8 (881b532, End-to-end run 38621093711) fails the same way. The driver log shows chromedriver sets WebView2's arguments itself (`--remote-debugging-port=0`), then waits 60 s twice for `DevToolsActivePort`. The post-job process listing found no leftover `pluto` or WebView2 processes. The process-tree theory is therefore not the cause. **Root cause found in the source (2026-10-18):** wry 0.57 always passes its own browser arguments to WebView2 (`wry/src/webview2/mod.rs:300`), and an app-supplied value overrides `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, which is how msedgedriver passes `--remote-debugging-port`. The flag therefore never reached WebView2, so no `DevToolsActivePort` file. Fix: `forward_webview_args` in `src-tauri/src/lib.rs` appends that variable to each window's arguments on Windows (unset for users). **Confirmed 2026-10-18: End-to-end run 39125777963 on ecfb4e8 is green.** | `.github/workflows/e2e.yml`, `e2e/smoke.mjs` | Closed |
| R12 | App time counted the desktop, taskbar, tray and Alt+Tab as "File Explorer" (all are `explorer.exe`). Fixed 2026-10-25 on Windows by checking the window class; macOS still counts clicks on the desktop as Finder. | owner report 2026-10-25; `src-tauri/src/tracking.rs` | Fixed on Windows (Unverified); macOS open, Low |
| R14 | Reminder notifications on Windows were silent: no sound was named, so the toast was sent with `audio silent`. Fixed 2026-10-25 (named "Reminder" sound; macOS "Glass"); per-reminder sound switch. | `src-tauri/src/notify.rs` | Fixed, Unverified |
| R15 | A note's own window (new) and the built-in characters (bundled as app resources) have never run in the real app. | new 2026-10-25 | Unverified |
| R13 | The owner's Kayadu pack: its frames are placeholder transforms of one image (its own README), so every row looks like the picture jumping around even when nothing happens. | DECISIONS 2026-10-23 (afternoon) | Pack content, not Pluto code |
| R8 | A session hook reported missing `memory/decisions.md` and `memory/FACTS.md`. They do not exist in this repo. | hook output | Low |

Fixed since the first audit: D1 time-of-day tests (CI had failed on it), D2 autostart switch, D4 two documents named ADR-001 (the RAM one is now ADR-020), a race in the demo shell that made it create two copies of itself on start (events were lost; found while testing delete-all).

---

## 7. Next three actions

0. **2026-10-22 (owner tested v2.0.0):** all features work except the 15 items in [`docs/V2_ISSUES.md`](docs/V2_ISSUES.md). Specs FR-41..FR-58 are written ([`docs/features/FR-v2-features.md`](docs/features/FR-v2-features.md)); **nothing is built yet** (Planned). Student-first order approved (ROADMAP.md "Delivery order"). Backend, gallery, plugins, Linux and a local MCP server are decided YES; personal-photo characters and code signing are on HOLD. Owner answers needed: Q1-Q6, D-SIZE. Character art/sprite packs: owner is working on character integration.

1. **M2 (owner, 2026-10-12: "keep moving"; next release only after Phase 2).** Done: F1-26 first run, F1-17…19 meetings. Done also: F1-23 (Yesterday line), F1-24, F1-25. M2: F1-27 end-to-end tests built (`e2e/`, CI workflow *End-to-end*); only **signing** is left, and it needs the owner's certificates. Next: M3 (Phase 2), then the release. M3 started 2026-10-12: website time from the address bar, and Mac parity (app + site tracking on Mac). All Unverified on real machines.
2. **Owner: re-check the three 0.1.3 fixes** when convenient: Actions → Release build → Run workflow refreshes the `v0.1.3` draft with them (no version change). Notifications: Settings › Notifications › Send a test notification.
3. **Characters (owner, 2026-10-12, pulled forward):** four designs (3D-lit; Byte dropped) and the bear's typing pose are in as a preview. Typing along is built (`pet.typing`, off by default) — **Unverified**: needs a run on the owner's Windows PC (turn on Character › Type along with me, type in Notepad). Text-box waiting built too (Windows caret check; macOS needs Accessibility) — **Unverified**.
4. **Code signing: on hold** (owner, 2026-10-19). Not a blocker for the current docs work. Release artifacts stay unsigned and Unverified.
5. **Roadmap redesigned 2026-10-13** around the owner's new core-features list (Universal Quick Actions, a context-aware writing/prompt assistant, Focus & Wellbeing, an expanded Privacy Radar). New milestones M4–M13; see `ROADMAP.md` §2 for the full table and `DECISIONS.md` U12–U15 for four open questions: which AI provider for the writing assistant (blocks M5 from starting), whether Developer reactions (now M12) is still wanted, confirming Voice-before-MCP (changes part of locked ADR-015), and whether the Privacy Radar report should ship with M3 instead of waiting for M11. Work continues on **M3** until those are answered.
6. **AI assistant notifications (owner request 2026-10-14):** plan written, nothing built — [`docs/features/AN-assistant-notifications.md`](docs/features/AN-assistant-notifications.md), ROADMAP M6.4. Starts with spike AN-00 on a real Claude Code install; waiting on owner answers U17–U22.

---

## 8. Windows checklist (owner)

**Result on 0.1.3 (owner, 2026-10-12):** everything passed except three lines, now fixed in code and **Unverified**:
- line 5 **FAIL**: no Windows notification for a reminder. Cause not confirmed (the plugin hides errors). Fix: errors are logged, the taskbar flashes, the pet rings for 15 s, an in-app alert with Done / Snooze appears, Settings › Notifications has a test button and a link to the system settings.
- reminders could not be edited (none could; the owner noticed it on a missed one). Fix: click a reminder to change its text or time, or snooze it.
- line 13 **FAIL**: the pet could not be dragged while its card was open. Fix: the grown window is dragged as is; the shell follows the pet and saves the new spot.
- **Re-reported 2026-10-13** (same symptom, after that fix): dragging still failed when the press started exactly on the bear; it worked from elsewhere in the window. Likely cause: only the bear's own small `<button>` had the drag-arming pointer handlers, so a press that (for whatever OS/WebView2 reason) landed a pixel outside its hit box, or on the card beside it, never started a drag — matching "I have to put my cursor somewhere else." Fix: the whole pet window now arms a drag on any press; only the bear itself still opens/hides the dashboard on a plain click. **Still Unverified** — I could not reproduce this without a real Windows PC, so I could not confirm the exact original cause, only make the fix robust to it.

Run `pnpm tauri dev` or install the CI build. Write pass or fail next to each line.

1. App opens as a window (not full screen) and the tray icon appears. Resize it, quit, reopen: same size and place.
2. Close the window: it hides. Tray → Quit: the process ends. A second copy brings the first to the front.
3. Notes: create, edit, pin (`Ctrl+D`), colour, label, preview Markdown (`Ctrl+E`), archive, delete + Undo, search, rename and delete a label. Restart: everything is still there.
4. Tasks: add one, Start, Pause, Resume, Complete, Reopen, add a work update, defer to tomorrow, change priority and deadline, delete a finished one. Restart: all correct.
5. A reminder two minutes ahead produces a Windows notification.
6. Settings → app tracking on; use three apps for five minutes: the Time page shows them; click one for its active spans.
7. Paste a link in Links and click it: the default browser opens.
8. Settings → **Open Pluto at login** on, sign out and in: Pluto starts hidden in the tray. Turn it off, sign out and in: it does not start. Remove the login item in Windows settings, reopen Pluto: the switch is off.
9. Settings → **Export**: choose a place, a file appears. **Delete all** (type DELETE): everything is gone. **Import** that file: everything is back, identical.
10. Leave Pluto open past midnight (or move the clock): yesterday appears in the Time page's Daily log. Copy a day as Markdown and paste it somewhere.
11. Task Manager: idle CPU near 0%, memory under 100 MB.
12. Install from the CI installer on a clean PC: it installs, starts, uninstalls cleanly.
13. Desktop pet: hover card fully visible (no scrollbars), click / double-click / right-click, drag and restart (same spot), `Ctrl+Shift+P/L/N/T`, reactions (add, start, finish, finish last, reminder, delete), sleeps after 15 quiet minutes.

---

## 9. Session protocol (for every future Claude session)

1. **Read** this file, then `MASTER_PLAN.md` (active work and order) and the open decisions in `DECISIONS.md`.
2. **Inspect Git:** `git status`, `git log --oneline -15`, `git branch -vv`. Check the open PR and the CI result on the head commit.
3. **Re-verify before trusting:** `cargo test --workspace`, `pnpm typecheck`, `pnpm lint`, `pnpm test`. If a number here differs, trust the run and fix this file.
4. **Continue the active milestone only.** Ask before design choices (the owner dislikes decisions made without asking) and before starting a later milestone.
5. **Build small and test:** add tests with the change. `cargo fmt`, `cargo clippy -D warnings`, `pnpm gen:types` after changing a core type. Never mark something Complete if it needs a real OS and nobody ran it: use Unverified.
6. **Update the docs in the same change:** status here, plan in `ROADMAP.md`, decisions in `DECISIONS.md`, one line in `CHANGELOG.md`.
7. **Commit and push** to the designated branch; keep the PR open; check CI after pushing. Do not stack new work on a merged PR: restart the branch from `main`.
8. **End of session:** state the current feature, what changed, what is open, and the next action.

Never: rewrite working code without a reason, add dependencies silently, mix a future feature into a P0 change, or claim Windows or macOS behaviour was tested when only CI compiled it.
