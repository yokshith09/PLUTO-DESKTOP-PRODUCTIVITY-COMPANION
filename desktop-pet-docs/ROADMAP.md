# Pluto — Roadmap
> **Start here: [`MASTER_PLAN.md`](MASTER_PLAN.md)** — phases, milestones, every feature with its "done when" (2026-10-22).
>
> Requested-feature inventory, extra milestones (FM-x), test matrix and release gates: [`FEATURE_ROADMAP.md`](FEATURE_ROADMAP.md). Delivery order for M0–M13 stays in this file.

The one page that tracks progress. Flow: **build principles → phases → milestones → features.**
Everything else is reference — open it when a feature needs it:

| Need | Document |
|------|----------|
| Where things stand, evidence, defects | [PROJECT_STATUS](PROJECT_STATUS.md) |
| Why things were decided, open questions | [DECISIONS](DECISIONS.md) |
| What changed | [CHANGELOG](CHANGELOG.md) |
| Why / what the product is | [Product Document](docs/00-product/product-document.md) · [PRD](docs/02-prd/PRD.md) |
| How it is built | [TRD](docs/03-trd/TRD.md) · [Schema](docs/05-backend/backend-schema.md) · [ADRs](docs/01-build-principles/07-architecture-decisions.md) |
| What it looks like | [App flow](docs/04-design/app-flow.md) · [UI/UX brief](docs/04-design/ui-ux-brief.md) |
| Feature detail (acceptance, tests) | [`docs/features/`](docs/features/README.md) |
| Sizes and exit gates | [Implementation plan](docs/06-plan/implementation-plan.md) |

**Rule from here:** this file tracks plan and status. Evidence for every status is in [`PROJECT_STATUS.md`](PROJECT_STATUS.md). Scope or design changes are one line in [`DECISIONS.md`](DECISIONS.md); a locked document is amended only if it would otherwise contradict the code.

**Last updated:** 2026-11-02 — no-flicker pet window, Allow card, Bin for reminders and meetings, MCP resources (Unverified, for 0.5.9); MCP change tools with Undo, prompts, focus guard, developer reactions built (Unverified, for 0.5.9); MCP read tools (P4.1b) and assistant tiles with auto-setup built (Unverified); Assistants page built (switch live, setup to copy, developer preview; Unverified); 0.5.8 draft for the owner's test; MCP P4.1a bridge and pipe built (Unverified); 2026-11-01 — P4 MCP plan written (`MCP_PLAN.md`), nothing built; hover card in its own window (same size and place) and the pet seen through by time tracking, both Unverified and not in a build yet; 2026-10-25 — UI reset batch 1 built (A4, A6, B1–B7, C1–C5, D1–D4, E1; Unverified on Windows); batch 2 next (F character page, G settings, H pet, I time, J characters); earlier: owner's UI reset previewed (see "UI reset (owner, 2026-10-25)" below), nothing built until approved; 2026-10-23 — FR-106…FR-109 task upgrades built (Unverified); FR-05 focus sessions and FR-110 timer by the pet built (Unverified); remaining FM-V2 fixes next; student-pack and now-strip (FR-88) previews published for owner review (P2, not built); all notifications now show above the pet only (toast stack removed); new-feature building paused until the remaining FM-V2 fixes (FR-43 edges, FR-44, FR-45, FR-46, FR-48, FR-62 findable) are done and a draft release goes out; building FM-V2 (done: FR-41, FR-42, FR-47, FR-52, FR-61, FR-63 slice, FR-85, FR-90, FR-92-94, FR-96, pet-visibility fixes, FR-104; see MASTER_PLAN); all sprite-pack rows drawn (FR-50, Unverified); student-first delivery order approved and V2 milestones added (see "Delivery order"); earlier: 2026-10-13 — milestones M4 onward redesigned around the owner's 2026-10-13 feature list (Quick Actions, Writing/Prompt Assistant, Focus & Wellbeing, an expanded Privacy Radar) and renumbered; see §2 "Renumbering" and `DECISIONS.md` for what changed and what is still open (an AI-provider choice for M5, and whether Developer reactions — old M5, now M12 — is still wanted). Status words (Complete, Unverified, Partial, Planned…) are defined in PROJECT_STATUS §2. **Unverified** means it compiles and CI is green but nobody has run it on a real machine.

---

## 1. Build principles

Full text: [`docs/01-build-principles/`](docs/01-build-principles/README.md).

1. **Event-driven, always** — no polling; one-shot timers are fine.
2. **Lightweight, always** — idle CPU <1%, RAM <100 MB.
3. **Local-first** — user data lives in SQLite on their machine.
4. **One feature at a time** — finish and verify before the next.
5. **UI first** — design before backend.
6. **Tests early** — before or alongside code; >80% coverage to ship.
7. **Learn fundamentals first** — understand it before reaching for a library.
8. **Usable at every phase** — each phase ships something people can use.
9. **No premature optimisation** — make it work, right, then fast.
10. **Technical debt is a debt** — log it with a payoff date.

## 2. Milestones (release order)

The first release is **M1: Notes and daily work management (P0)**. Everything else waits for it. The PRD's "v1.0.0" (notes + tasks + meetings + pet) stays as the full Phase 1 target; M1 is the smaller release before it, labelled **v0.1.0** (owner, 2026-10-11).

| Milestone | Name | Contents | Status |
|-----------|------|----------|--------|
| **M0** | Foundation closure | Real-Windows run, autostart, export/import/delete, perf harness | 🟡 Partial |
| **M1** | **Notes + daily work (P0, first release, v0.1.0)** | Notes, tasks, search, labels, dates, completion history, daily progress, release gate | 🟡 Code complete; owner reports it works in v2.0.0 (written results pending). **Active work is now FM-V2 + companion (see Delivery order / MASTER_PLAN)** |
| M2 | Phase 1 completion → v1.0.0 | Meetings, pet window, global shortcuts, settings screens, first run | 🟡 code complete; signing blocked on the owner |
| M3 | Capture, browser tracking & privacy (Phase 2) | App/site time, extensions, macOS collector, open tabs, privacy-radar capture | 🟡 Feature-complete for the option-d scope; shipped as 0.2.0 for owner testing, **Unverified** on Windows and Mac |
| M4 | Universal Quick Actions | Keyboard-accessible command centre: notes, tasks, search, AI actions | ⬜ |
| M5 | Context-aware writing & prompt assistant | Message polishing, prompt generation/improvement, controlled refinement | ⬜ **blocked on an AI-provider decision (owner)** |
| M6 | Reminders & contextual pet, continued | Event-driven reactions to focus/app time, quiet hours, settings | 🟡 base built in M1/M2 (reminders, pet, task/reminder reactions); this finishes it |
| M7 | Meeting-to-action, AI-assisted | Auto-summary and suggested decisions/action items; audio recording later | 🟡 manual version built in M2 (F1-17…19); the AI parts need M5's provider interface |
| M8 | Focus & digital wellbeing | Focus timers, task-linked sessions, daily/weekly summaries, goals | ⬜ |
| M9 | Voice commands & dictation (Phase 6) | STT benchmark, push-to-talk, voice → task/note/search | ⬜ |
| M10 | MCP connectors (Phase 5, 5.1) | One verified connector first, then GitHub, Calendar, Gmail, Slack, Notion, CI status | ⬜ |
| M11 | Privacy radar: the report | Evidence-based tracker report with uncertainty shown, not claims | 🟡 the option-d panel shipped with M3 (0.2.0 work); M11 is only what remains: per-site don't-track/delete actions and a richer report |
| M12 | Developer reactions (Phase 4) | Git and local build awareness | ⬜ **not in the owner's 2026-10-13 list — confirm still wanted** |
| M13 | Character customization (Phase 7) | 18 characters, outfits | 🟡 4 characters + the bear's typing pose pulled forward |

**Renumbering (2026-10-13):** everything from old M4 onward was never started, so renumbering it is free. Old **M4 Desktop companion** → **M6**; old **M5 Developer** → **M12**; old **M6 MCP** → **M10**; old **M6b CI status** → **M10b**; old **M7 Voice** → **M9**; old **M8 Character** → **M13**. New: **M4 Quick Actions**, **M5 Writing/Prompt assistant**, **M7 Meeting-to-action (AI)**, **M8 Focus & wellbeing**, **M11 Privacy radar report**.

### Delivery order (student-first, approved 2026-10-22)

M-ids are unchanged; this is the order we build in. Specs for the new rows are in `docs/features/FR-v2-features.md`.

| Order | Milestone | What | Notes |
|-------|-----------|------|-------|
| 1 | M1 / M2 gates | Windows verification of v2.0.0 | Owner-side; blocks nothing below but nothing is "Complete" without it |
| 2 | **FM-V2** V2 fix pack | FR-41..FR-48, FR-52, FR-61, FR-49a: toasts, actionable links, pet pop-ups fixed, resizable Time tiles, date/time picker, auto-delete, remove Logs, pet shortcuts, rename links, browser tabs spike | All questions answered |
| 3 | **FM-ST** Student pack (course label, exam countdown, weekly report built 2026-10-28, Unverified; diary, Guide next; now strip skipped) | FR-58 plus FR-52: course label, focus linked to a task, weekly report, exam countdown, quick capture, meeting action items on Today | Quiz from notes waits for AI |
| 4 | **FM-GUIDE** Guide | FR-51: tour, Guide page, "Built by QUORBIT TECHNOLOGIES" | Skippable |
| 5 | **FM-CS** Character Studio and sprite packs | FR-49, FR-50: accessories, pack format, Studio | Personal photos on HOLD |
| 6 | M8 Focus and wellbeing | Timers, summaries, goals | Builds on the student pack |
| 7 | **FM-INT** Local MCP server (**NEXT, owner 2026-10-29**) | FR-54 | Local only; shape approved 2026-10-22 (stdio + named pipe + token; status / react / say) |
| 8 | FR-76 coding-agent link, M12 developer reactions, **FM-PS** Project Spaces | FR-76, M12, FR-53 | P4 Developer & MCP, in this order |
| 8b | **Small features pack** (P5): M4 Quick Actions, FR-72 Launch Buddy, FR-73 System resources, M11 Privacy report, FR-74 .ics import | — | One phase of quick wins |
| 8c | **Voice M9** (P6, second developer, in parallel) | — | On-device speech; contract in `MASTER_PLAN.md` |
| 10 | **FM-LIN** Linux build, Wayland, Languages, LAN mode (P7) | FR-57, FR-81, FR-79, FR-78 | Unverified until run on Linux |
| 11 | **FM-BE** Backend and gallery (P9); plugins are art packs only, no SDK | FR-56, FR-55 | Needs the privacy statement; code signing on HOLD |
| 12 | M4, M5, M7, M9, M10, M11, M13 | As in the table above | M5 blocked on the AI provider |

### UI reset (owner, 2026-10-25) — batch 2 (F, G, H, I2, J1–J3) built 2026-10-26, Unverified; task editor and Projects redesigned the same day

**Batch 1 built (owner's list A4, A6, B1–B7, C1–C5, D1–D4, E1).** Projects (FR-53) is pulled forward as a sidebar tab, always on (supersedes "opt-in, off by default"). **Batch 2 (next):** F Character page layout, G Settings reset, H pet (timer below the pet inside its width, clickable hover-card tasks, Focus → Focus tile, music controls), I Time per-app visuals, J character format/skill and editable reactions. The preview canvas below was deleted at the owner's request.

#### Preview (superseded)

Owner: "before changing the UI show me UI preview". Preview boards: Today (no focus/activity/done-this-week, overdue days, quote), Tasks **Week** view (next 7 days, large), task editor (one row per property, reminder N min before with +/− and sound, focus length), Notes (top strip removed, readable links, even spacing), note editor (formatting, pop-out window), **Projects** (tasks and notes together, numbered — pulls FR-53 forward), Character (current pet first, age, animation preview, outfits and reactions marked Later), Settings (six groups, pet settings moved to Character, no duplicates), Time per app (hour map, by day, sessions), pet (timer below inside the pet's width, clickable coloured hover card, music controls). Open questions in `DECISIONS.md` 2026-10-25. Nothing here is Planned until the owner approves it.

**Order after M3 before 2026-10-22 (superseded by the table above), per the owner's 2026-10-13 feature list:** Quick Actions → Writing assistant → Reminders/pet (finish) → Meeting-to-action (AI) → Focus & wellbeing → Voice → MCP → Privacy radar report → Developer → Character. This **supersedes part of ADR-015** (which had Developer → MCP → Voice): Voice now comes before MCP, and Developer reactions wasn't in the new list at all. See `DECISIONS.md` — this is flagged for the owner to confirm, not silently assumed.

---

## M0 — Foundation closure

| ID | Feature | Status (2026-10-11) |
|----|---------|--------|
| F0-01 | Scaffold | ✅ Complete (V-1 oldest macOS: Unverified, needs a Mac) |
| F0-02 | CI matrix + V-2 | ✅ CI green · final V-2 on the full app Unverified (gate: private working set, ADR-020) |
| F0-03 | Event bus | ✅ Complete |
| F0-04 | Database, migrations | ✅ Complete (migrations 001–003) |
| F0-05 | DB writer + read pool | ✅ Complete |
| F0-06 | Clock + rollover | 🟡 Partial — core and scheduler wired; wake-from-sleep and timezone hooks missing |
| F0-07 | Settings + typed IPC | ✅ Complete (settings keys hand-typed) |
| F0-08 | Tray, single instance, close-hides, quit | 🟡 Unverified — never run on a real desktop |
| F0-09 | Autostart `--hidden` | 🟡 Unverified — built 2026-10-11, never run on a real OS |
| F0-10 | Frontend shell | ✅ Complete |
| F0-11 | Export / import / delete all data | 🟡 Unverified — core done and tested (9 tests); file dialogs never run on a real OS |
| F0-12 | Performance harness | 🟡 Partial — V-2 only |
| F0-13 | Errors and logging | ✅ Complete |

---

## M1 — Notes + daily work (P0, first release)

**Goal:** someone can capture notes, plan and finish tasks, find things, and see what they got done each day — on a real Windows machine, with their data safe. **Exit gate:** every checked item below, the Windows checklist (PROJECT_STATUS §8) passed, CI green on Windows and macOS, installer built.

### M1.1 Notes
- [x] Create, edit, autosave (500 ms), discard-if-empty (F1-01, F1-03)
- [x] List, sort, pin, archive, colours (F1-02, F1-05, F1-06, F1-08)
- [x] Delete to a 30-day Bin with Undo, restore, empty (F1-04 + owner addition)
- [x] Labels: add, create inline, filter with counts, **manage (rename, delete)** (F1-07)
- [x] Search (plain, notes)
- [x] N1 Markdown edit / preview (F1-09)
- [x] N3 Pin from the editor, `Mod+D`, `Mod+E`, `Mod+Shift+A`, `Mod+L`; app keys `Mod+1…4`, `Mod+,`, `Mod+T`
- [x] N4 PRD amended (v1.5): autosave 500 ms, Bin instead of confirm-delete

### M1.2 Tasks
- [x] Create, quick add, edit, complete with Undo, overdue badge (F1-10, F1-12)
- [x] Core: state machine, history, defer, delete rule, five views, filters (F1-11, F1-14)
- [x] T1 Tasks page: Today, Upcoming, Pending, All, Completed + priority/project/status/date filters + search
- [x] T2 Status buttons: Start, Pause, Resume, Complete, Cancel, Reopen
- [x] T3 Defer (tomorrow or a chosen day)
- [x] T4 Task detail: description, project, planned date, deadline, linked note, history, work updates (F1-13)
- [x] T5 Delete a finished task

### M1.3 Daily progress
- [x] Daily log core: live, freeze, missed days (F1-15)
- [x] Done-this-week bars, Activity feed
- [x] D-a/D-b Daily log on the Time page: last 14 days, done of planned, change vs the day before, expand, copy as Markdown (F1-16)
- [x] D-c **dropped**: no Progress card (owner)

### M1.4 Release gate
- [ ] G1 Real-Windows checklist passed and recorded — **owner**
- [x] G2 Export / import / delete all data (F0-11) — built, Unverified
- [x] G3 Autostart (F0-09) — built, Unverified
- [x] G4 Installer workflow `release.yml` + bundle config — built, never run; **signing not set up (owner's certificates)**
- [x] G5 Time-of-day test bug fixed
- [x] G6 Coverage floors enforced in CI (core ≥ 90% lines, frontend thresholds)
- [x] Version bumped to 0.1.0; tag push builds installers and a draft release
- [ ] Install the draft release's installer on a clean PC and pass the checklist, then publish

**Already built and not part of the original M1 list (owner additions):** reminders with notifications, the Today overview dashboard with drag-to-reorder tiles, week calendar, Links, Time page and Windows app tracking. They ship with M1 but their real-machine behaviour is Unverified.

---

## M2 — Phase 1 completion → v1.0.0

| ID | Feature | Status |
|----|---------|--------|
| F1-17 | Meeting create/edit + participants | ✅ Built 2026-10-12 (core `meetings.rs`, Meetings page, autosave, participant suggestions, filters) |
| F1-18 | Decisions + action items | ✅ Built 2026-10-12 (add, edit, remove, reorder) |
| F1-19 | Action item → task | ✅ Built 2026-10-12 (task status shown live on the item) |
| F1-22 | Minimal pet window | 🟡 Built, Unverified (0.1.1, pulled forward by the owner after testing v0.1.0): hover card, click/double-click/right-click, drag, saved spot. 0.1.2 adds the soft-3D bear and task/reminder reactions with bubbles. Missing: reactions to focus/app time |
| F1-23 | Today view (R1-70 rest) | ✅ 2026-10-12: one line "Yesterday: X of Y done · N still open" that opens those tasks (owner chose only this; follow-ups and pinned notes dropped) |
| F1-24 | Global shortcuts + quick-add popup + keymap | ✅ 2026-10-12 (Unverified on Windows): `Mod+Shift+L/N` changeable in Settings, `Mod+Shift+P` fixed; quick-add popup and `Mod+Shift+T` dropped by the owner |
| F1-25 | Settings screens (Pet, Shortcuts, Advanced) | ✅ 2026-10-12: Shortcuts (change/reset), Data (database location, open folder), Advanced (log detail live, open logs folder, reset settings), About (open-source licenses) |
| F1-26 | First run + empty states | 🟡 Welcome screen built (2026-10-12): shown once on a fresh Pluto or after Delete all, never to someone with notes or tasks; three start actions (task, note, meeting); pet on, tracking and login off. |
| F1-27 | Cross-OS E2E, signing, **v1.0.0** | 🟡 E2E built 2026-10-12: Windows WebDriver run (welcome, task, note, meeting → task, restart) and macOS launch smoke test in `.github/workflows/e2e.yml`; passes 3/3 locally on Linux. **Signing waits for the owner's certificates.** The release is after Phase 2 (owner) |

F1-20 and F1-21 (search) are cancelled; their numbers are retired.

---

## M3 — Browser tracking (Phase 2)

| Item | Status |
|------|--------|
| Windows foreground-app tracking, opt-in, domain-only (ADR-019) | 🟡 Built, **Unverified** on Windows. 2026-11-01: away after 10 min without input; the pet and its card no longer stop the app's time (found with the 0.5.7 trace); not in a build yet |
| Per-app / per-site time, Time page, filters | ✅ Complete (UI-mock) |
| Website time from the address bar (Windows: UI Automation; Mac: AppleScript for Chrome/Edge/Brave/Vivaldi), `tracking.sites` | 🟡 Built 2026-10-12, **Unverified** on both |
| Open tabs, no extension | 🟡 Built 2026-10-13 (owner: the pet does it all with granted permissions). Windows: tab titles via UI Automation, domain for the showing tab only. macOS: every tab's domain via AppleScript (Chrome-family). Close a tab from the list. **Unverified** |
| Open-tabs list and close tab | 🟡 Built (see the row above), **Unverified** |
| Firefox, Safari | ⬜ Not built: no extension by decision; Safari/Firefox on macOS record nothing, Firefox on Windows untested |
| Known-tracker check for visited sites (U16 option d) | 🟡 Built 2026-10-18: core helper, `is_tracker` on each site, a "Known tracker" tag in the site list and a Privacy radar panel on Time › Sites (known-tracker sites, time on them, sites by category; wording says "not flagged", never "clean"). No third-party request tracking. Tests in Rust and the UI. **Unverified** on a real PC (needs real browsing) |
| Windows / macOS parity audit (2026-10-18) | 🟡 Done on paper; see PROJECT_STATUS §4.8. Real gaps: Safari/Firefox/Arc on Mac; Windows open-tab domains only for the showing tab; Windows private-window detection is English-only |
| macOS foreground-app collector | 🟡 Built 2026-10-12 (NSWorkspace, 1 s), **Unverified** on a Mac |

---

## Outline: Phase 2 remainder *(see M3)*
**Milestone 2.1 — Capture**
- App-focus tracking (OS events, no polling)
- ~~Chrome + Edge extensions (MV3), native-messaging bridge~~ — dropped 2026-10-13: open tabs and site time are both read directly, no extension (see DECISIONS.md)

**Milestone 2.2 — Data & privacy**
- Browser / domain sessions, buffered writes (≤1/min)
- Domain categories
- **Privacy radar capture — blocked on a design decision (DECISIONS U16):** the address bar only shows the page you are on, never the third-party requests that page makes (ad and tracker calls). Seeing those needs a browser extension (ruled out 2026-10-13), a system-level network watcher (Windows DNS event tracing needs administrator rights; nothing equivalent on macOS), or a local proxy. Flagging *visited* sites that are themselves known trackers is possible but nearly useless. Original wording kept below for reference. Privacy radar capture: known-tracker domains flagged on the same per-domain record used for `tracking.exclude_apps`-style do-not-track, incognito excluded, delete data. The report UI that explains this to the person, with evidence and uncertainty, is **M11** — item 9 on the owner's list, scheduled here only because it shares this milestone's browser-extension groundwork; if the owner wants the capture-and-report shipped together, say so and M11 folds back into M3.

**Milestone 2.3 — Dashboard**
- ~~Today dashboard: time by category, top apps and domains, hourly chart~~ — **built** (Today overview and Time page)
- ~~Open tabs view + close tab~~ — **built 2026-10-13**, see the table above
- ~~Today vs yesterday~~ — **built** ("23m less than yesterday" on Today)


## M4 — Universal Quick Actions *(outline)*

*Owner's feature 2. A keyboard-accessible command centre, reachable from anywhere on the desktop, not just inside the main window.*

**Milestone 4.1 — Invocation and shell**
- Global shortcut opens the command palette as its own small always-on-top window (same pattern as the pet window), so it works while another app has focus
- Fuzzy search over commands; recent and frequent commands ranked first
- Esc closes it; it never steals focus it doesn't need

**Milestone 4.2 — Core actions (no AI, ships first)**
- New note, new task (with the same quick-add parsing already in Today)
- Search notes and tasks from the palette, jump straight to the result
- Jump to a page (Today, Time, Notes, Meetings, Settings)

**Milestone 4.3 — AI actions**
- Depends on **M5**'s provider interface: "Polish this message," "Turn this into a prompt," "Summarize the clipboard"
- The palette shows AI actions only once a provider is configured (Settings), never a dead button
- Every AI action opens M5's review screen before anything is copied or sent; the palette never acts unreviewed

**Initial scope:** 4.1 and 4.2 only — a working command centre with zero cloud dependency. 4.3 is a thin front end once M5 exists; it is not blocked on M5 existing when M4 itself is built, only on it being *used*.

---

## M5 — Context-aware writing & prompt assistant *(outline)*

*Owner's feature 3, verbatim brief kept as the spec. This is the project's first feature that sends user text to an external AI provider — a deliberate exception to build principle 3 (local-first data in SQLite), scoped tightly: the text sent is whatever the person explicitly put in, nothing is stored remotely, and nothing leaves the device until the person asks for this specific action.*

**Blocked on one decision only the owner can make, before any code:** which AI provider (Claude via the Anthropic API is the natural default inside this stack; OpenAI or a local model are the alternatives), whether there's a free/local fallback for people without an API key, and how the key is stored (OS keychain, matching the pattern MCP will need anyway in M10). See `DECISIONS.md` §1.

### 5.1 — Writing foundation
- Shared UI: one interface, three modes (Polish Message / Generate Prompt / Improve Prompt)
- AI provider interface: one trait the UI calls, so the provider choice above is a plug-in, not a rewrite
- Draft preservation (the original text is never overwritten until the person accepts), copy, loading and error states
- Settings: provider, API key (OS keychain), a visible "this sends text to \<provider\>" notice — cloud use is never silent

### 5.2 — Message polishing
- Rewrite rough messages for WhatsApp, email, professional communication and other messaging platforms
- Tones: friendly, professional, polite, concise, confident
- Preserve intent and facts; never invent commitments, dates or excuses the person didn't write

### 5.3 — Prompt generation and improvement
- Rough idea → structured prompt, using the five-part framework (role/task, dynamic content, detailed instructions, optional examples, repeated critical instructions) — adapted to the task, so a simple request doesn't get an over-engineered prompt
- Prompt improvement: review an existing prompt for ambiguity, missing context, conflicting instructions, weak constraints, unclear output format; explain the problems, then generate the improved version
- Task-specific templates for ChatGPT/Claude-style chat prompts, coding-agent prompts and research prompts

### 5.4 — Context engineering
- Optional context box: paste in relevant text, a document, or (later) authorised project information
- Never invent missing information; if context materially changes the result and wasn't given, ask once — the spec's own rule
- Framework selection is automatic: the assistant picks structured prompting, few-shot examples, an output schema or a template based on the task, not a menu the person has to understand first

### 5.5 — Controlled refinement
- A bounded draft → review → refine → validate loop, with a defined success check and a maximum number of attempts (this is "loop engineering" from the spec — deterministic code owns the bound and the exit condition, the AI only drafts)
- Review/edit/copy/retry UI: the person always sees the draft before it goes anywhere, can edit it directly, ask for another version, or refine further
- Nothing is sent on the person's behalf (no auto-send to WhatsApp, no auto-paste into another app) in this milestone — see 5.6 for why that stays deferred

### 5.6 — Cross-application support
- Ships first inside: the Notes editor, and M4's Quick Actions palette
- Explicit-input workflow for text copied from WhatsApp, email, ChatGPT, Claude or anywhere else: paste in, get a result, copy out — the person stays in control of the send
- **Deferred, not in initial scope:** browser extensions for in-page rewriting, system-wide text selection/replacement. Both need platform APIs validated first (accessibility/selection hooks differ per OS and per app) and both would need their own permission story like M3's site reading; revisit after the explicit-input version proves useful

**Initial scope (owner's own list):** message polishing, prompt generation, prompt improvement, optional context, review/edit/copy, retry. **Explicitly deferred:** advanced repository retrieval, unrestricted autonomous loops, large framework libraries, system-wide text replacement.

**Success criterion (owner's words):** people can turn rough thoughts into polished messages or effective prompts directly from their workflow, with less context switching, without losing control of the final output.

---

## M6 — Reminders & contextual pet, continued *(outline)*

*Owner's feature 4. The reminder system and the pet already exist (M1, M2) and already react to task/reminder events. This milestone is what's left: reacting to the kind of events that need the usage-tracking and focus infrastructure from M3/M8, plus making the reaction rules configurable instead of hardcoded.*

**Milestone 6.1 — More triggers**
- React to a task left open past its deadline, not just a reminder firing (distinct from the dropped "overdue reaction," which fired on every overdue task on every event; this is a single, deliberate nudge)
- React to a finished focus session (depends on M8)
- React to unusually long unbroken app time, rate-limited so it nags at most once per stretch

**Milestone 6.2 — Quiet hours and configurability**
- A quiet-hours window in Settings and a manual quiet-mode switch on the pet: no sound, no taskbar flash, no OS toast inside it (notifications still log). Bubbles follow the rule per type: pet reactions are hidden; assistant-event bubbles still show (owner, 2026-10-18; amends this line — confirm, U20)
- Per-reaction-type on/off, reusing the pattern `pet.typing` already set: off by default for anything new, its own switch, explained in one line

**Milestone 6.4 — AI assistant notifications (owner request 2026-10-14)**
- Native notification when Claude Code finishes a task, needs input or fails, even while the owner works in another app. Hook → small helper → local pipe/socket → policy (dedupe, quiet hours, min turn length) → notifier. Plan, acceptance criteria and verification gate: [`docs/features/AN-assistant-notifications.md`](docs/features/AN-assistant-notifications.md) (AN-00…AN-09, ≈19 dev-days)
- Bubble above the pet is the primary channel (owner, 2026-10-18). **Not started.** AN-00 (a verification spike on a real Claude Code install) comes first and gates everything else; open questions U17–U22 in DECISIONS.md. Needs M6.2 quiet hours (built once, shared). Other assistants only after AN-00-style verification of their mechanism (AN-09).

**Milestone 6.3 — Already built, verify only**
- Task/reminder reactions with bubbles (M2), typing-along (M2), text-box waiting (M2) — these need a real-OS pass (PROJECT_STATUS §7), not new code

---

## M7 — Meeting-to-action, AI-assisted *(outline)*

*Owner's feature 7. The manual version — create/edit a meeting, add decisions and action items by hand, convert one to a task — is built (M2, F1-17…19). This milestone is the AI layer on top.*

**Milestone 7.1 — Auto-summary**
- From the meeting's Markdown notes, suggest a short summary — review-before-save, same as every M5 result
- Uses M5's provider interface and its bounded refine loop; no new AI plumbing

**Milestone 7.2 — Suggested decisions and action items**
- Suggest decisions and action items extracted from the notes; the person reviews each one before it's added (never auto-created, matching the spec's "users review the suggestions before they become tasks")
- Suggestions that look like an action item but lack an owner or date are flagged, not silently guessed

**Milestone 7.3 — Audio** *(later, explicitly deferred by the spec)*
- Automatic audio recording and transcription into the meeting's transcript field
- Shares groundwork with **M9** (Voice): once STT is benchmarked there, meeting transcription reuses it rather than picking a second engine

---

## M8 — Focus & digital wellbeing *(outline)*

*Owner's feature 8. New; no existing code. Start with tracking, not intervention — the spec's own order.*

**Milestone 8.1 — Focus sessions**
- A focus timer, optionally linked to one task (so finishing a session can trigger M6's pet reaction)
- Local-first: sessions are just another local, deletable record, same shape as the existing usage data

**Milestone 8.2 — Summaries**
- Daily and weekly focus summaries, alongside the existing Time page rather than a separate page
- Optional personal goals (e.g. "3 focus sessions a day"); no accountability pressure, no streaks that punish a missed day

**Milestone 8.3 — Later, explicitly conditional**
- More invasive app-usage monitoring (blocking distracting apps, stricter enforcement) — the spec says "before considering" this, i.e. it needs its own owner decision once sessions alone prove useful, not a default to build toward

---

## M9 — Voice commands & dictation: Phase 6 *(outline; was M7)*

*Owner's feature 5. Reordered ahead of MCP per the owner's 2026-10-13 list — see the note under §2.*

**Milestone 9.1 — Benchmark first**
- Benchmark speech-to-text engines before committing to one: accuracy, latency, Indian English specifically (the owner's own requirement), and resource use (build principle 2: idle CPU <1%, RAM <100 MB — a local STT model is the risk here)
- Write up the comparison and pick one before any UI is built

**Milestone 9.2 — Capture & intent**
- Activation by push-to-talk button (no wake word, no always-on mic — matches build principle 2 and ordinary privacy expectations)
- Audio capture and intent parsing

**Milestone 9.3 — Actions**
- Voice → task, voice → note, voice queries ("what's on today"), spoken results
- Dictation into the note/task editor as an alternative to typing, not just discrete commands

**Milestone 9.4 — Meetings**
- Meeting transcription into the transcript field (M7.3), once this milestone's STT choice exists

---

## M10 — MCP connectors: Phase 5, 5.1 *(outline; was M6)*

*Owner's feature 6. The owner's own scope: start with one verified integration and a secure permission system, not all five at once.*

**Milestone 10.1 — Foundation**
- MCP client scaffold
- OAuth 2.0 + PKCE; tokens in the OS keychain (the same storage M5 needs for its API key — build it once, reuse it)
- Per-integration toggle in Settings; MCP events routed into Pluto's own event bus

**Milestone 10.2 — First connector, verified**
- One service, end to end, used for real before adding a second. GitHub or Google Calendar are the two the owner has mentioned by name; the choice is the owner's (it decides what "verified" tests against)
- Read-only to start: list/show, never write, until the permission system itself has been exercised

**Milestone 10.3 — More services (read-only)**
- Gmail (+ action-item extraction, which reuses M5/M7's extraction pattern), Google Calendar, Slack, Notion
- Today's agenda gains calendar events (already in the plan since 2026-10-04 — see DECISIONS.md)

### M10b — CI status: Phase 5.1 *(outline; was M6b)*
- GitHub Actions status (Jenkins if sizing allows)
- CI pass/fail pet reactions, reusing M6's reaction and quiet-hours plumbing
- CI-failure notification and a suggested task (reuses M7's "suggest, don't auto-create" rule)

---

## M11 — Privacy radar: the report *(outline; new)*

*Owner's feature 9. Detection rides with M3 (same browser integration); this milestone is the person-facing report.*

- Show what was detected — known third-party trackers, by domain, with the evidence (which site, which tracker, how many times) — never an unsupported claim about what data was collected, which the person's browser and Pluto cannot actually see
- Show uncertainty explicitly where it exists (a domain matching a known tracker list is not proof of what it does); the report reads like a researcher's note, not a verdict
- One place to act: don't track, delete, or see detail — reusing the existing per-domain settings from `tracking.exclude_apps`'s pattern

---

## M12 — Developer reactions: Phase 4 *(outline; was M5)*

*Fully offline, as originally planned. **Not on the owner's 2026-10-13 feature list** — kept here rather than deleted, since removing locked scope without being told isn't right either. Flagged in `DECISIONS.md` for the owner to confirm: still wanted, or drop it?*

**Milestone 12.1 — Git**
- Repository watcher on `.git` refs
- Commit and push detection

**Milestone 12.2 — Build**
- Local build monitoring
- Build state in the dashboard

**Milestone 12.3 — Reactions**
- Pet reactions to git and build events (reuses M6's reaction plumbing)
- Build-failure notification
- Suggest a task from a failure (reuses M7's "suggest, review, never auto-create" rule)

---

## M13 — Character customization: Phase 7 *(outline; was M8)*
*Pulled forward (owner, 2026-10-12): four character designs and the bear's typing pose exist as a preview; typing along is built for the bear (Unverified on a real OS); the other characters are not selectable yet.*

**Milestone 13.1 — Character system**
- Asset pipeline and lazy loading
- Character switching UI

**Milestone 13.2 — Wardrobe**
- Outfits and closet — 🟡 first part built 2026-10-26 for every character (nine accessories, six outfits, party hat on birthdays, per-character fit; Unverified). Still planned: schedules (FR-64).
- Seasonal packs

**Milestone 13.3 — Context**
- App-specific reactions
- Character pack download


## Later (added 2026-10-27)

- **Music buttons under the pet** (parked): the first try pressed system media keys and did not work reliably. Re-plan before building: per-OS media session (Windows SMTC, macOS MediaRemote), what to show when nothing plays, and a way to test without a real player. Not Planned until the owner approves.

## After 0.6.0 (owner 2026-11-02: "plan these after 6.0")

Order to be confirmed with the owner after 0.6.0 ships.

1. **Project Spaces and a pet per project** (P4.4, FR-67): MCP access to projects; each project can have its own character.
2. **Opt-in network layer**: one HTTP client, off by default, a Connections page; then CI reactions (GitHub Actions), calendar feed, connectors (`RESEARCH_INTEGRATIONS.md` F).
3. **Characters** (P3, paused): the remaining character work.
4. **Clean-up before an outside release**: tracking trace (after a full day matches), old-name migration (after testers pass 0.5.x), history comments (`MCP_PLAN.md` §17).

- 2026-11-02: Today overview (auto-fitting tiles, Now / Next up, ordering) and Daily routine fix built for the next build; owner to test.

- 2026-11-02: P4.3a done in code (git watcher, one-time folders). Next: Project Spaces (preview first), then UI polish (preview first), then 0.5.10.

- 2026-11-02: P4.4 Project Spaces done in code. P4 local part complete; left in P4: CI reactions (need the network layer). Next: UI polish U-1..U-4 (preview first), then 0.5.10 on the owner's word.

- 2026-11-02: added P4.5 (FS-1 full-screen compatibility, TT-1 Tab Tantrum), U-5 free tile resize, U-6 Time calendar grid, U-7 / FR-113 project templates. Blockers and fixes per feature in docs/features/OWNER_FEATURE_LIST_2026-11-02.md.

- 2026-11-02: U-8 Routine tracker (FR-114). D-TELEMETRY, D-CRED, D-NAME decided (see DECISIONS).

- 2026-11-03: U-1 done in code. Next U-2.

- 2026-11-03: assistant ideas A-1..A-5 listed for the owner; U-2 approved.
- 2026-11-03: H-1..H-4 done in code (Codex, Cursor hooks, OpenCode, Windsurf).
- 2026-11-03: U-3 done in code; assistants H-1..H-4 next.
- 2026-11-03: pipe fix (pet went quiet after a while); U-3 waits for the owner's reference.
- 2026-11-03: U-2 done in code (Unverified in the real window).
- 2026-11-03: U-4 Diary part done in code (date-card year, several entries per day); owner to review the layout. Study screens to be suggested.
- 2026-11-03: U-4 Diary reworked to month tiles with sliding and a flip-open day card; owner to review.
- 2026-11-03: U-10 colour themes planned (five choices, Periwinkle default); previews shown, Diary in Periwinkle approved to build with the theme. Nothing built yet.
- 2026-11-03: U-9 and U-10 done in code (committed before the owner's review of the Settings colour row; changes welcome).
- 2026-11-03: Character page: duplicate preview removed.
- 2026-11-03: A-6 done in code. Study screens (5 ideas) and the A-1 badge previewed; waiting for the owner's pick.
- 2026-11-03: Study scope set by the owner (stripped overview with sliding Report tab, trimmed course page with a real syllabus, adjustable timetable with CSV/Excel import; no review cards). A-1 approved as previewed.
- 2026-11-04: A-1 done in code. Study screens ON HOLD (owner did not like the preview). U-5..U-8 next, preview first.
- 2026-11-04: A-4 click-to-go wanted with A-1 (window of the chat via its process tree). U-5..U-8 previews published.
- 2026-11-04: U-6, U-7, U-8 done in code (commit dots and extra tabs left out). U-5 next.
- 2026-11-04: U-5 done in code. U-5..U-8 complete; next FS-1 / TT-1 previews, A-4 on the owner's go.
- 2026-11-04: A-4 done in code. Order now: FS-1, TT-1 (previews first) -> release v0.6.0 on the owner's word -> A-8, A-3, A-7, A-2, A-5 -> P5. On hold: Study screens. Not built from approved previews: U-6 commit dots, U-7 Exams/Questions/Hours tabs.
- 2026-11-04: Handover to Codex (A-3, A-7) and Antigravity (A-2, A-5) prepared. Next for Claude Code: review and merge their draft PRs; then FS-1 / TT-1 previews, A-8 preview, release v0.6.0 on the owner's word.
- 2026-11-09: A-3, A-7, A-2, A-5 merged (Codex built, Claude Code reviewed). Next: owner picks the daily-tracker look (preview), then build it with skip reasons; FS-1 / TT-1 / A-8 previews; release v0.6.0 on the owner's word.
- 2026-11-09: Routine stepping stones with skip reasons done in code. Student pack: new preview, waiting for the owner's pick; build order proposed: syllabus, home rings and tabs, timetable and CSV, Excel import, pet class reminders.
- 2026-11-09: Next after the owner approves the previews: Student pack v2 (syllabus topics, exam info, ChatGPT-to-notes and write-out, full-week timetable, xlsx import), new routine tracker, per-assistant reaction tiles. Needs the role-mapping decision first.
- 2026-11-09 plan after the previews are approved, in order: (1) Student pack v3 data model: subtopics with notes and a written flag per note, topic importance and status, exam info and dates (core types, migration, `pnpm gen:types`, tests); (2) Courses tab rebuild with Open cards and the editable write-out mode; (3) one Exams-notes-tasks tab; (4) timetable CSV and .xlsx import (the one approved dependency); (5) assistant editor with per-tool and per-reaction switches (Claude Code first); (6) routine tracker rebuild once a look is chosen; (7) per-class reminders from the pet. Planned, on hold: Friends (P9 Online): a study group of up to 8 with a shared weekly focus goal, cheers and a leaderboard-free progress strip; needs accounts, a small server, end-to-end privacy review and the owner's consent design, so it is not started until local features ship. Windows items still Unverified are listed in PROJECT_STATUS.
- 2026-11-09: Done: assistant permissions (storage `mcp.perms`, enforcement, editor tabs). Next: Study v4 build once approved (data model first), then the routine tracker.
- 2026-11-09: Next (other agents): K-1 Timetable → K-2 Exams, notes, tasks → K-3 class reminders; K-4 test hardening in parallel. Claude Code reviews and merges. Course page waits for the design.
- 2026-11-09: Done: A-8, Letters tracker. Next: owner approves FS-1 / TT-1 previews, then build FS-1 then TT-1; K-1..K-4 with other agents; Study waits for the outside design; Windsurf after the owner's check.
