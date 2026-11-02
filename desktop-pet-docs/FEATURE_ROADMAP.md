# FEATURE_ROADMAP — canonical feature and release roadmap

**Audited:** 2026-10-19 on `main` @ `8368daa`. Owner-reported release: **`v2.0.0`** (tag at `4bad6a2`, installed and tested by the owner); source version is still 0.2.0 (see §2 finding 10). Unsigned; **signing on hold** (owner, 2026-10-19) · **Product name:** undecided — "Pluto" is a working name in code and docs; nothing here renames it (see §13, D-NAME).

> **How this file relates to the others (no duplicate sources of truth).** Milestone M0–M13 *delivery order* stays in [`ROADMAP.md`](ROADMAP.md). *Current state* stays in [`PROJECT_STATUS.md`](PROJECT_STATUS.md). *Decisions* stay in [`DECISIONS.md`](DECISIONS.md). User-visible history stays in [`CHANGELOG.md`](CHANGELOG.md). This file adds what those do not hold: the **complete requested-feature inventory** (FR-01…FR-58), a milestone plan for the features ROADMAP.md does not cover (FM-0…FM-12), the test matrix, traceability, release gates and the documentation protocol. Per-feature 13-point specs live in [`docs/features/FR-requested-features.md`](docs/features/FR-requested-features.md); older specs: [`docs/features/README.md`](docs/features/README.md), [`AN-assistant-notifications.md`](docs/features/AN-assistant-notifications.md). Product/design sources: [PRD](docs/02-prd/PRD.md) · [TRD](docs/03-trd/TRD.md) · [UI/UX brief](docs/04-design/ui-ux-brief.md) · [App flow](docs/04-design/app-flow.md) · [Schema](docs/05-backend/backend-schema.md) · [Implementation plan](docs/06-plan/implementation-plan.md).

> **Conflict to resolve before anyone starts FM-3 or later:** the owner's recorded order after M3 is Quick Actions → Writing → Reminders/pet → Meeting-to-action → Focus → Voice → MCP → Privacy report → Developer → Character ([`ROADMAP.md`](ROADMAP.md)). Project Spaces, Credentials, Community and Computer Use are **not in that order at all**. The FM-order below is a *proposal*; `ROADMAP.md` stays authoritative until the owner approves a merge of the two (D-ORDER).

## 1. Product scope

**Owner instructions, 2026-10-19 (binding for this document):** (a) keep every existing feature and add the requested ones; (b) all application keyboard shortcuts are **off by default** and users enable them, with an enable/disable button (FR-37); (c) keep one Git branch (`main`) and remove the others; (d) code signing on hold; (e) the Meetings feature does not make sense to the owner and needs redesign, to be done in a later phase (FR-38); (f) for now, only the feature document and current-state documentation are in scope: **no feature code is built yet**.

Pluto is a local-first Windows/macOS desktop pet and productivity companion (Tauri v2 shell, Rust core `crates/pluto-core`, React/TypeScript UI). Non-negotiables already locked: local-first SQLite, no browser extension, event-driven (idle CPU <1%, RAM <100 MB), one feature at a time, tests with every change. Features that need a server, secrets, cloud AI or OS control change those assumptions and are marked **Blocked** until the owner decides (§13).

## 2. Current-state audit (evidence, not documentation)

Checks run 2026-10-19 on `4bad6a2`:

| Check | Result |
|---|---|
| `cargo test --workspace` | **376 passed, 0 failed** (PROJECT_STATUS still says 347 — stale) |
| `pnpm typecheck` / `pnpm lint` | clean |
| `pnpm test` | **111 passed, 18 files** (PROJECT_STATUS says 70/41/327 in places — stale) |
| `pnpm e2e`, release build, macOS run | **not run here** — need Windows/CI/Mac |

Audit findings (each tagged):

1. **[Certain]** Implemented in code: notes, tasks, links, labels, meetings, calendar, reminders, bin, daily log, settings, tray, autostart, shortcuts, pet window, app/website usage collectors, tab reader, known-tracker flag, privacy radar panel, data export/import/delete, DB backups.
2. **[Certain]** Absent from code: projects, focus/Pomodoro, any HTTP client or network call, AI provider, keychain/credentials, updater plugin, image/photo import, QR, git reading, accounts/backend, telemetry, referral logic, character packs. Plugins present: single-instance, notification, opener, autostart, dialog, global-shortcut, window-state.
3. **[Certain]** Dashboard tiles reorder (dnd-kit) and persist order (`ui.overview_order`); tile **spans are constants, so no resize and no auto-layout** exist (`MovableTiles.tsx`).
4. **[Certain]** Releases are unsigned (`release.yml`); no updater exists, so FR-36 cannot be met by configuration alone.
5. **[Likely]** Order survival on minimise/restore is already true because order is stored, but no test proves it (FR-23).
6. **[Likely]** Browser time may be shown in both apps and websites lists; not verified (FR-24).
7. **[Certain]** Every OS-facing feature is Unverified; Windows is checked only by the owner and e2e; macOS only by CI. Parity gaps: PROJECT_STATUS §4.8.
8. **[Certain]** Documentation drift: PROJECT_STATUS §1/§4 counts, §3 "active milestone", §4.5 version; `CLAUDE.md` still says active milestone M1; R6 says F0 specs are DRAFT. Counts are corrected in this change; milestone wording needs the owner (D-ORDER).
10. **[Certain]** Owner-reported `v2.0.0` tag points at `4bad6a2`, the same commit as `v0.2.0`, whose source version is 0.2.0. So the owner's installed build reports a version that differs from the tag name, unless the owner built with a different version. Decision needed (D-VERSION): bump source to 2.0.0 in one change, or keep 0.2.0 and treat the tag as a label.
11. **[Certain]** Global shortcuts are registered at startup with no master switch (`src-tauri/src/shortcuts.rs`; only `shortcuts.global_open` and `shortcuts.global_new_note` are configurable). They are therefore **on by default**, which conflicts with the owner's instruction (FR-37).
12. **[Certain]** Meetings is built (F1-17…19: `src/features/meetings`, `crates/pluto-core/src/meetings.rs`). The owner says the flow does not make sense; no defect list has been given yet (FR-38 needs one).
13. **[Likely]** About 18 of the 36 requested features have no precursor in the code at all; about 10 conflict with locked decisions or need a server/secrets (Blocked).

## 3. Feature inventory

Legend: **Requested** = in the owner's list; **Technical requirement (TR)** = derived from repo evidence, *proposed*, not requested; **Decision** = unresolved. All FR rows below are *requested*.

| ID | Feature | Group | Status | Milestone | Effort | Decision state |
|---|---|---|---|---|---|---|
| FR-01 | Customisable floating pet (appearance, position) | Companion | Partial | FM-8 | M | U-none; M13 scope |
| FR-02 | User photos / supported artwork as pets | Companion | Planned | FM-8 | L | Open: U-new-1 (art format, content rules) |
| FR-03 | Character packs: install, project-aware behaviour | Companion | Planned | FM-8 | XL | Open: U-new-2 (pack format, executable content), M13 scope |
| FR-04 | Referral codes and points (unlock after 3 qualifying referrals) | Companion | Blocked | FM-10 | XL | Blocked: backend (U-new-3) |
| FR-05 | Focus Sessions with Pomodoro | Productivity | Built, Unverified | FM-4 | M | ROADMAP M8; U-none |
| FR-06 | Project Spaces (notes, tasks, files, resources, links, context, setup) | Productivity | Built (setup tab = FR-14 still planned), Unverified | FM-3 | XL | Open: U-new-4 (type taxonomy) |
| FR-07 | Prompt Improvement | Productivity | Blocked | FM-5 | M | Blocked: U12 (AI provider) |
| FR-08 | Tab Tantrum (pet reacts to tab overload) | Productivity | Planned P4.5 TT-1 (owner 2026-11-02; blocker fixed: count from the tab strip) | FM-4 | L | Blocked: no-extension decision |
| FR-09 | One-Click Workspace Launcher | Productivity | Planned | FM-3 | M | Open: U-new-5 (what may be launched) |
| FR-10 | Group Project Tracker and team leaderboards | Productivity | Blocked | FM-10 | XL | Blocked: backend (U-new-3), privacy of ranking |
| FR-11 | Student Project Organizer | Student & developer | Planned | FM-3 | M | none |
| FR-12 | Study Companion | Student & developer | Planned | FM-5 | L | Depends on U12 |
| FR-13 | Secure Credential Access (references only) | Student & developer | Planned | FM-6 | XL | Open: U-new-6 (storage policy) |
| FR-14 | Project Setup Assistant | Student & developer | Planned | FM-3 | M | none |
| FR-15 | Presentation Practice Companion | Student & developer | Planned | FM-5 | L | Voice stack open (M9) |
| FR-16 | Coding Error Translator | Student & developer | Planned | FM-5 | M | Depends on U12 |
| FR-17 | QR Code Scanner (image, camera, screen) | Utilities | Planned | FM-7 | L | Camera/screen permission policy |
| FR-18 | Notification Triage | Utilities | Planned | FM-7 | XL | OS notification access varies; relates to AN-xx |
| FR-19 | Website and app activity tracking | Utilities | Unverified | FM-0 | S (verify) | U16 option d decided |
| FR-20 | GitHub-style Time-tab visualisations | Utilities | Partial | FM-1 | M | none |
| FR-21 | GitHub commit tracker | Utilities | Planned | FM-7 | L | Open: U-new-7 (token vs local git) |
| FR-22 | Resizable, reorderable dashboard tiles with auto layout | Utilities | Partial (reorder + 2 sizes + equal rows built; free resize U-5) | FM-1 | L | none |
| FR-23 | Tile order kept on minimise/restore; no rearranging on window resize | Utilities | Unverified | FM-1 | S | none |
| FR-24 | Correct separation of website and app activity | Utilities | Unverified | FM-1 | S | none |
| FR-25 | Time tab layout fix | Utilities | Planned | FM-1 | S | Needs owner screenshot of the defect |
| FR-26 | Tab Tantrum, Project Spaces and Focus in full-screen scenarios | Utilities | Planned P4.5 FS-1 (owner 2026-11-02) | FM-4 | L | Open: U-new-8 |
| FR-27 | Clean shutdown/restart and state preservation | Utilities | Partial | FM-1 | M | none |
| FR-28 | Local AI via Ollama | AI | Planned | FM-5 | L | Blocked: U12 |
| FR-29 | Optional cloud fallback with cost-aware routing | AI | Blocked | FM-11 | L | Blocked: owner + secrets (FR-13) |
| FR-30 | Computer-Use Assistant (permissions, approved actions, verification) | AI | Blocked | FM-12 | XL | Blocked: safety design + owner approval |
| FR-31 | Character sharing | Community | Blocked | FM-10 | L | Blocked: backend; content moderation |
| FR-32 | Transparent telemetry (consent, opt-out, retention) | Community | Blocked | FM-9 | L | Blocked: backend; legal |
| FR-33 | Abuse and duplicate prevention | Community | Blocked | FM-10 | L | Blocked: backend |
| FR-34 | Product website and downloads | Distribution | Planned | FM-9 | M | Blocked: product name (undecided) |
| FR-35 | In-app announcements and release notes | Distribution | Planned | FM-2 | M | none |
| FR-36 | Secure auto-update (integrity, recovery, rollback) | Distribution | Blocked | FM-2 | XL | Blocked: signing certificates (owner) |
| FR-37 | Keyboard-shortcut master switch (off by default; users enable) | Utilities | Planned | FM-1 | S | Open: D-SHORTCUT-DEFAULT (owner-stated: off) |
| FR-38 | Meetings redesign (flow the owner finds confusing) | Utilities | Planned (deferred, later phase) | FM-13 (new, deferred) | M | Blocked: D-MEETINGS (owner will define; ask next time) |
| FR-39 | Personalised 2D character system: built-in characters, sprite/package format, optional personal character | Companion | Research done; detailed specs CH-01…CH-08 in docs/character/CHARACTER_FEATURE_SPECS.md (Planned); build not started | FM-8 | XL | Open: D-GEN, D-UPLOAD, D-FORMAT, D-SIZE, D-RIVE, D-LICENCE, D-CHARS (see docs/archive/CHARACTER_PIPELINE_RESEARCH.md) |
| FR-40 | Emote and Reactions System: registry, state machine, right-click Emotes menu, 8 emotes (back_turn_shake, chaotic_dance, tiny_tantrum, moonwalk_escape, dramatic_crying, smug_taunt, instant_sleep, over_the_top_celebration), optional double-click/random/favourites, optional contextual reactions (off by default) | Companion | **Planned**; spec docs/character/EMOTE_FEATURE_SPECS.md; nothing built. `back_turn_shake` blocked on back/three-quarter art; focus-complete reaction blocked on FR-05 | FM-8b (proposed, after FM-8) | XL | Open: D-EMOTE-ORDER, D-EMOTE-MILESTONE, D-EMOTE-DOUBLECLICK, D-EMOTE-ART, D-EMOTE-MASTER |
| FR-41 | Messages above the pet and return-to-dashboard after add/edit | UI | Built, Unverified | FM-V2 | M | Toast stack replaced by pet bubbles (owner 2026-10-23) |
| FR-42 | Actionable links: Open note, Linked tasks on a note, Links in Notes, create note from task | Notes/Tasks | Built, Unverified | FM-V2 | M | Q5 confirmed |
| FR-43 | Pop-ups above the pet fixed (owner reversed: they stay, emotes too) | Companion | Planned | FM-V2 | S | Q2 answered |
| FR-44 | Time tiles resizable and filled | Time | Planned (extends FR-22) | FM-V2 | M | — |
| FR-113 | Project templates: Developer, Student, Research, Freelance, Personal (owner list 2026-11-02, #31-33) | Productivity | Planned (U-7) | P4.5+ | M | Preview first |
| FR-45 | Purpose-built date/time picker with presets | UI | Planned | FM-V2 | M | — |
| FR-46 | Retention and auto-delete (preview, Bin first) | Data | Planned | FM-V2 | M | Q3: Time history + completed tasks |
| FR-47 | Remove Logs rows from Settings (UI only) | Settings | Built, Unverified | FM-V2 | XS | — |
| FR-48 | Editable pet-window shortcuts, default off | Companion | Planned | FM-V2 | S | — |
| FR-49 | Character accessories | Companion | Planned | FM-CS | M | Built as OpenPets wardrobe outfits; Q4 moved to FR-49a |
| FR-50 | Sprite-pack format and Character Studio | Companion | Planned; spec docs/character/CHARACTER_STUDIO_SPEC.md | FM-CS | XL | D-SIZE closed (192x208); packs built, Unverified |
| FR-51 | Guide page, tour, quiz, "Built by QUORBIT TECHNOLOGIES" | Onboarding | Planned | FM-GUIDE | M | — |
| FR-52 | Meeting action items on Today with source chip | Meetings | Built, Unverified | FM-V2 | S | Q6: yes |
| FR-53 | Project Spaces, opt-in sidebar | Projects | Planned (FR-06) | FM-PS | L | — |
| FR-54 | Local MCP server | Integrations | Planned (plan written 2026-11-01: `MCP_PLAN.md`) | FM-INT | L | Shape approved 2026-10-22; bridge option 1 and reads/writes decided 2026-10-31; 9 questions open (`MCP_PLAN.md` §15) |
| FR-55 | Plugins from the website | Platform | Planned; signing on HOLD | FM-PLUG | XL | Open: D-PLUGIN-MODEL |
| FR-56 | Backend and gallery | Platform | Planned; needs privacy statement | FM-BE | XL | — |
| FR-57 | Linux build | Platform | Planned; Unverified until run | FM-LIN | M | — |
| FR-59 | Cursor gaze rows (OpenPets V2 format, 16 look directions) | Companion | Planned | FM-CS | M | — |
| FR-60 | Drag-and-throw and wander for the pet | Companion | Planned | M6 | M | — |
| FR-61 | Rename links (V2-16) | Links | Built, Unverified | FM-V2 | S | — |
| FR-62 | Browser tabs on the dashboard: switch and close, no extension (UI Automation) | Time | Built (tabs.rs), Unverified; hidden behind app+site tracking — make findable | FM-V2 | S | — |
| FR-63 | Import any OpenPets/Codex pet pack | Companion | Partial, Unverified (folder, ZIP, Codex/Petdex scan, use as pet) | FM-CS | L | drag-and-drop to do |
| FR-64 | Wardrobe: outfits and schedules (replaces FR-49) | Companion | Planned | FM-CS | L | — |
| FR-65 | Activities (emotes as one-shot animations) | Companion | Planned | M6 | M | — |
| FR-66 | Pet gallery / catalog | Companion | Planned | FM-CS | L | GitHub Pages (decided) |
| FR-67 | Multiple pets; pet per Project Space | Companion | Planned | M13 | L | FR-53 |
| FR-68 | Size presets, reaction pace, reaction mapping | Companion | Planned | M6 | S | — |
| FR-69 | Wellbeing: calm corner, water, mood, routines | Wellbeing | Planned | M8 | L | — |
| FR-70 | Timer and quick reminders from the pet | Productivity | Planned | M8 | S | — |
| FR-71 | Care mode, fortune cookie, magic 8-ball | Companion | Planned | M13 | M | — |
| FR-72 | Launch Buddy (merges FR-09) | Productivity | Planned | M4 | M | — |
| FR-73 | System resources badge | Utilities | Planned | M12 | S | — |
| FR-74 | Calendar reminders (.ics, then Google/Outlook) | Integrations | Planned | M10 | L | — |
| FR-75 | Talk to your pet (AI chat + voice) | AI | On hold | M5/M9 | XL | AI provider |
| FR-76 | Coding-agent integration | Developers | Planned, P4.2 (`MCP_PLAN.md` §7) | FM-INT | L | After P4.1 |
| FR-77 | Plugin SDK (code plugins) | Platform | Not planned — owner: plugins are art packs | — | — | — |
| FR-78 | LAN mode | Companion | Planned (last) | P5 | L | — |
| FR-79 | Languages | Shell | Planned | P5 | L | Hindi + Telugu first (decided) |
| FR-80 | AI Pet Studio | Companion | On hold | FM-CS | XL | AI provider, personal characters |
| FR-81 | Wayland support (part of FR-57) | Platform | Planned | FM-LIN | S | — |
| FR-82 | Flashcards from notes, usage buddy | Students | Planned | FM-ST | M | — |
| FR-83 | Role profiles: Student / Developer / Student who codes / General set feature defaults | Shell | Planned | FM-GUIDE | M | — |
| FR-84 | Community pets website + upload server (moderated) | Platform | Planned | P7 | XL | Supabase (decided); hosting budget |
| FR-85 | Daily routine tile + "N routine tasks pending" reminder | Productivity | Built, Unverified | FM-V2 | M | — |
| FR-86 | Private diary (password, encrypted) with task pick-up | Journal | Planned | FM-ST | L | — |
| FR-87 | Pet reacts to every feature; user picks reaction per event | Companion | Planned | M6 | M | — |
| FR-88 | "Now strip" beside the pet: current task, timer, next deadline | Companion | Planned | P2 | S | Research 2026-10-23 |
| FR-89 | Quiet modes: choose monitor, hide in full-screen and meetings | Companion | Planned | P2 | S | Research 2026-10-23 |
| FR-90 | Forgiving routine progress: "N of last 7 days", nothing resets | Wellbeing | Built, Unverified | FM-V2 | S | Social research |
| FR-91 | Earned pet growth paced per user, in export/import | Companion | Planned | M13 | M | Social research |
| FR-92 | No-guilt rule + automated copy check | All | Built (test) | — | S | Owner 2026-10-23 |
| FR-93 | Pet age and birthdays (pet = day you met; user day+month) | Companion | Built, Unverified | M6 | S | Owner 2026-10-23 |
| FR-94 | Greeting once a day, birthdays first | Companion | Built, Unverified | M6 | S | Owner 2026-10-23 |
| FR-95 | Full backup (.plutobackup incl. pet packs), weekly auto-backup to a chosen folder | Data | Planned | M0 | M | Owner 2026-10-23 |
| FR-96 | Notification budget + quiet hours, user-adjustable in Settings | Shell | Built, Unverified | FM-V2 | S | Owner 2026-10-23 |
| FR-97 | Friends/study groups, friends-only opt-in leaderboard, weekly recap card | Social | Planned | P7 | L | Backend (Supabase) |
| FR-98 | Festival and seasonal outfits | Companion | Planned | P3 | M | FR-64 |
| FR-99 | Weekly recap card (save as image) | Students | Planned | P2 | S | — |
| FR-100 | Study groups with friends | Social | Planned | P7 | L | Supabase |
| FR-101 | Leaderboards: visibility Off (default) / Friends / Everyone, weekly reset | Social | Planned | P7 | M | Owner 2026-10-23 |
| FR-102 | Monthly community pet drops | Companion | Planned | P7 | S | FR-84 |
| FR-103 | Photo to pet | Companion | Planned (later) | P6 | XL | AI provider |
| BUG-PV | Pet doesn't come back / needs Show twice (B1-B6, S1-S4) | Companion | Fixed B1-B6 + S1, Unverified | — | M | `docs/BUG_REPORT_2026-10-23_pet_visibility.md` |
| FR-104 | macOS website time + tabs for Arc, Firefox, Safari (opt-in) | Time | Built, Unverified | — | M | Owner 2026-10-23 |
| FR-105 | Real animations for packs (see `docs/character/ANIMATION_PLAN.md`) | Companion | Planned | FM-CS | M-L | — |
| FR-106 | UI redesign pass (layout, hierarchy, polish) | UI | Planned, audit first | FM-V2 | L | Owner 2026-10-23 |
| FR-58 | Student pack | Students | Planned; quiz waits for AI | FM-ST | L | — |

**Verified existing (Unverified on real OS, tests pass):** FR-19 tracking, ROADMAP M1–M3 features. **Partial:** FR-01, FR-20, FR-22, FR-27. Everything else: Planned or Blocked. Nothing is "Complete" on a real OS.

**Technical requirements (proposed, not requested):**

| ID | Requirement | Evidence | Milestone |
|---|---|---|---|
| TR-01 | Code signing (Windows Authenticode, macOS notarisation) | `release.yml` unsigned | FM-2 |
| TR-02 | Migration safety: backup before migrate, additive migrations 004+ | `db.rs`, migrations 001–003 | every data milestone |
| TR-03 | Core must stay OS/tauri-free | `pnpm check:core-deps` | all |
| TR-04 | Accessibility: keyboard + labels for all new UI | dnd-kit keyboard sensor exists | all UI |
| TR-05 | Performance budget: idle CPU <1%, RAM <100 MB | `v2-ram.yml` | all |
| TR-06 | Secrets canary test (no secret in DB/log/export) | none | FM-6 |
| TR-07 | Network egress policy: allow-list + test that default build makes no non-loopback calls | no network code today | FM-5 |
| TR-08 | Threat models before FR-04, FR-13, FR-29, FR-30 | none | before those milestones |

## 4. Release scope and phases

**Order decided by the owner, 2026-10-21:** (1) fix the V2 issues the owner will list; (2) define and complete **all local features and characters**; (3) only then cloud and AI integration (FM-9 to FM-12 move after local completion). Cloud-dependent features stay Blocked until then.

| Phase | Goal | Milestones | Exclusions | Exit criteria |
|---|---|---|---|---|
| A Stabilise | 0.2.0 verified, dashboard correct, safe updates | FM-0, FM-1, FM-2 | New features | Windows checklist passes; signed build; updater test |
| B Productivity core | Projects, focus, local AI | FM-3, FM-4, FM-5 | Server, cloud | Each feature Complete on Windows |
| C Secure & utilities | Credentials, QR, git, triage | FM-6, FM-7 | Server | Secrets canary test green; Win+Mac checks |
| D Character | Look, photos, packs | FM-8 | Online gallery | Hostile-pack tests green |
| E Network | Backend, telemetry, community, cloud AI, computer use | FM-9…FM-12 | — | **Owner approval of backend and safety design first** |

Dependency map: FM-0 → FM-1 → FM-2; FM-3 → FM-4, FM-8(project-aware), FM-6; FM-5 → FM-11 → FM-12; FM-9 → FM-10; FM-6 → FM-11.

## 5. Milestones

One milestone is active at a time: **FM-0**. Effort: S ≤1 day · M 2–4 · L 1–2 weeks · XL >2 weeks (single developer + Claude; assumes owner answers decisions within a day and tests on Windows).

### FM-0 — Verify 0.2.0 and reconcile docs  **[ACTIVE]**
- **Goal / value:** know what really works before building more. · **Status:** In progress (owner has installed and tested `v2.0.0`; results not yet recorded here). · **Evidence:** 376 Rust + 111 frontend tests pass on `8368daa`; tag `v2.0.0` pushed by owner; source version mismatch (finding 10).
- **Features:** FR-19. · **Prerequisites:** owner PC. · **Effort:** S.
- **Tasks (ordered):** 1 owner sends test results for `v2.0.0` (`RELEASE_0.2.0_TEST.md` and the Windows checklist); 2 record them in PROJECT_STATUS §8; 3 decide D-VERSION; 4 fix defects; 5 reconcile ROADMAP active-milestone wording and `CLAUDE.md`.
- **Tests:** T-19-01…03. · **Acceptance:** each checklist line has a recorded pass/fail; failures logged as risks. · **DoD:** docs updated; no unexecuted result claimed.
- **Risks:** R-owner-time. · **Next action:** owner runs the Windows checklist and reports results.

### FM-1 — Dashboard and Time-tab correctness
- **Goal / value:** layout does what a user expects. · **Status:** Planned. · **Evidence:** audit finding 3, 5, 6. · **Features:** FR-20, 22, 23, 24, 25, 27. · **Prereq:** FM-0 · **Effort:** L.
- **Tasks:** 1 FR-23 regression tests; 2 FR-24 audit + test; 3 FR-22 layout pref + resize + auto-layout; 4 FR-25 repro from owner screenshot; 5 FR-20 heatmap; 6 FR-27 shutdown test.
- **Affected:** `src/features/overview`, `time`, `charts`, `ipc/settings.ts`, `mock.ts`. · **Tests:** T-20, 22, 23, 24, 25, 27. · **Acceptance:** per spec. · **DoD:** `pnpm typecheck && pnpm lint && pnpm test` green, Windows visual check, docs.
- **Risks:** FR-25 undefined without screenshot. · **Next action:** write FR-23 order-stability test in `src/features/overview`.

### FM-2 — Signed releases, updater, release notes
- **Features:** FR-35, FR-36, TR-01. · **Status:** Blocked — **code signing on hold** by owner (2026-10-19). Updater design may still be written; nothing signed ships until the owner lifts the hold. · **Prereq:** FM-0 · **Effort:** XL.
- **Tasks:** 1 owner orders certificates; 2 updater signing keys; 3 add `tauri-plugin-updater`; 4 What's-new dialog; 5 tampered-artifact and interrupted-update tests; 6 rollback doc.
- **Tests:** T-35, T-36. · **Acceptance:** tampered artifact rejected; previous version recoverable. · **Risks:** cert lead time; SmartScreen reputation. · **Next action:** owner orders signing certificates.

### FM-3 — Project Spaces and project tools
- **Features:** FR-06, 09, 11, 14. · **Status:** Planned (decision U-new-4, ordering D-ORDER). · **Prereq:** FM-0, owner approval · **Effort:** XL.
- **Tasks:** migration 004 (+backup test) → core service → link notes/tasks/links → UI → launcher → student type → setup checklist.
- **Tests:** T-06, 09, 11, 14. · **Acceptance:** existing data intact after migration; no shell execution. · **Risks:** data-model creep. · **Next action:** owner picks project types (student/developer/personal) and approves schema sketch.

### FM-4 — Focus, Pomodoro, Tab Tantrum, full-screen
- **Features:** FR-05, 08, 26. · **Status:** Planned; FR-08 Blocked on accuracy decision. · **Prereq:** FM-3 (project link) · **Effort:** L.
- **Tasks:** focus migration → scheduler events → UI → pet states → per-OS full-screen spike → Tab Tantrum decision.
- **Tests:** T-05, 08, 26. · **Risks:** full-screen behaviour differs per OS; Windows tab count partial. · **Next action:** per-OS full-screen spike write-up.

### FM-5 — Local AI and AI tools
- **Features:** FR-28, 07, 12, 15, 16. · **Status:** Blocked on U12. · **Prereq:** D-AI · **Effort:** XL.
- **Tasks:** resolve U12 → provider trait → Ollama client → rules-first error translator → prompt improvement → study quiz → practice timer.
- **Tests:** T-28, 07, 12, 15, 16, TR-07 egress test. · **Risks:** model quality/RAM. · **Next action:** owner answers U12.

### FM-6 — Secure Credential Access
- **Features:** FR-13. · **Status:** Planned; threat model first. · **Prereq:** FM-3 · **Effort:** XL.
- **Tasks:** threat model → reference table → keychain trait (Win/Mac) → clipboard clear → env template → rotation reminders → canary test.
- **Tests:** T-13 (canary). · **Acceptance:** no secret in SQLite/logs/export. · **Risks:** highest-security feature; macOS verification needs a Mac. · **Next action:** write the threat model.

### FM-7 — Desktop utilities
- **Features:** FR-17, 18, 21. · **Status:** Planned. · **Prereq:** FM-1 (heatmap for commits) · **Effort:** XL.
- **Tests:** T-17, 18, 21. · **Risks:** permission prompts, OS notification APIs. · **Next action:** decoder spike with QR fixtures.

### FM-8 — Character
- **Features:** FR-01, 02, 03. · **Status:** Planned (ROADMAP M13). · **Prereq:** FM-3 for project-aware · **Effort:** XL.
- **Tests:** T-01, 02, 03 (zip-slip, EXIF). · **Risks:** untrusted files. · **Next action:** owner picks supported image formats.

### FM-9 — Backend foundation, telemetry, website
- **Features:** FR-32, 34. · **Status:** Blocked (D-BACKEND, D-NAME). · **Effort:** XL. · **Next action:** owner decides whether any server may exist.

### FM-10 — Community, referrals, groups
- **Features:** FR-04, 10, 31, 33. · **Status:** Blocked. · **Prereq:** FM-9, FR-03 · **Effort:** XL. · **Next action:** none until D-BACKEND.

### FM-11 — Cloud AI fallback
- **Features:** FR-29. · **Status:** Blocked (D-CLOUD, FR-13). · **Effort:** L.

### FM-13 — Meetings redesign (deferred, later phase)
- **Features:** FR-38. · **Status:** Planned, deferred by owner. · **Prereq:** owner description of what does not work. · **Effort:** M (unknown until described).
- **Next action:** owner lists the parts of Meetings that do not make sense.

### FM-12 — Computer-Use Assistant
- **Features:** FR-30. · **Status:** Blocked (D-COMPUTER, TR-08). · **Effort:** XL.

(Fields not repeated for FM-9…FM-12 — goals, tests, acceptance and risks — are in the FR specs; they are not startable, so no further planning is committed.)

## 6. Test matrix

Commands are the repo's real ones: `cargo test --workspace`, `pnpm test`, `pnpm typecheck && pnpm lint`, `pnpm e2e` (Windows, `e2e.yml`), manual = owner checklist. "Not run" means written but not executed; nothing marked missing has been run.

| Test ID | Feature | Level | Case | Coverage now | Command | Where | OS | Status |
|---|---|---|---|---|---|---|---|---|
| T-01-01 | FR-01 | Unit | appearance validation rejects unknown values | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-01-02 | FR-01 | Component | controls update setting | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-01-03 | FR-01 | Manual-Win | position restored after restart, monitor unplugged | missing | `RELEASE checklist` | Manual (owner PC) | Windows | Not run |
| T-02-01 | FR-02 | Unit | rejects non-image / oversize / polyglot | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-02-02 | FR-02 | Component | crop UI | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-02-03 | FR-02 | Manual-Win | large photo, animated GIF | missing | `checklist` | Manual (owner PC) | Windows | Not run |
| T-03-01 | FR-03 | Unit | zip-slip, oversize, bad manifest | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-03-02 | FR-03 | Integration | install/uninstall roundtrip | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-03-03 | FR-03 | Manual-Win | pack with 50 MB assets | missing | `checklist` | Manual (owner PC) | Windows | Not run |
| T-04-01 | FR-04 | Unit | qualifying rules table | missing | `server repo` | CI + local | Both in CI | Not run |
| T-04-02 | FR-04 | Integration | fake-install replay rejected | missing | `server repo` | CI + local | Both in CI | Not run |
| T-04-03 | FR-04 | Manual | two-machine referral | missing | `checklist` | Manual (owner PC) | Both in CI | Not run |
| T-05-01 | FR-05 | Unit | restart mid-session recomputes remaining | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-05-02 | FR-05 | Component | timer UI | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-05-03 | FR-05 | Manual-Win | sleep/resume during session | missing | `checklist` | Manual (owner PC) | Windows | Not run |
| T-06-01 | FR-06 | Unit | migration keeps existing rows | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-06-02 | FR-06 | Integration | delete project keeps notes (unlinked) | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-06-03 | FR-06 | Component | switcher | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-07-01 | FR-07 | Unit | template rendering | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-07-02 | FR-07 | Integration | fake provider | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-08-01 | FR-08 | Unit | threshold logic | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-08-02 | FR-08 | Manual-Win | count accuracy vs real tabs | missing | `checklist` | Manual (owner PC) | Windows | Not run |
| T-09-01 | FR-09 | Unit | rejects shell-injection strings | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-09-02 | FR-09 | Manual-Win | launch 5 items | missing | `checklist` | Manual (owner PC) | Windows | Not run |
| T-10-01 | FR-10 | Integration | conflict merge | missing | `server/core` | CI + local | Both in CI | Not run |
| T-11-01 | FR-11 | Unit | meta validation | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-11-02 | FR-11 | Component | form | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-12-01 | FR-12 | Integration | fake provider quiz | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-13-01 | FR-13 | Unit | DB/log dump contains no secret (canary value) | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-13-02 | FR-13 | Unit | clipboard clear timing | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-13-03 | FR-13 | Manual-Win | Credential Manager entry created/removed | missing | `checklist` | Manual (owner PC) | Windows | Not run |
| T-13-04 | FR-13 | Manual-Mac | Keychain prompts | missing | `checklist` | Manual (owner PC) | macOS | Not run |
| T-14-01 | FR-14 | Component | check/uncheck persists | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-15-01 | FR-15 | Component | timer | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-16-01 | FR-16 | Unit | rules map known errors | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-17-01 | FR-17 | Unit | decode fixtures incl. damaged | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-17-02 | FR-17 | Manual-Mac | screen-recording permission | missing | `checklist` | Manual (owner PC) | macOS | Not run |
| T-18-01 | FR-18 | Unit | priority/quiet-hour rules | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-19-01 | FR-19 | Unit | usage aggregation | existing | `cargo test --workspace` | CI + local | Both in CI | Existing, passing 2026-10-19 |
| T-19-02 | FR-19 | Manual-Win | real browsing | missing | `RELEASE_0.2.0_TEST.md` | Manual (owner PC) | Windows | Not run |
| T-19-03 | FR-19 | Manual-Mac | real browsing | missing | `CI only` | Manual (owner PC) | macOS | Not run |
| T-20-01 | FR-20 | Component | grid renders N days, empty state | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-21-01 | FR-21 | Integration | fixture repo | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-22-01 | FR-22 | Component | order/size clean + persist | existing (order only) | `pnpm test` | CI + local | Both in CI | Partial |
| T-22-02 | FR-22 | Component | resize persists | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-23-01 | FR-23 | Component | order stable across unmount/mount | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-23-02 | FR-23 | Manual-Win | minimise/restore | missing | `checklist` | Manual (owner PC) | Windows | Not run |
| T-24-01 | FR-24 | Unit | browser time not counted twice | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-25-01 | FR-25 | Component | no overflow at widths | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-25-02 | FR-25 | Manual-Win | visual | missing | `checklist` | Manual (owner PC) | Windows | Not run |
| T-26-01 | FR-26 | Manual-Win | video/browser full-screen | missing | `checklist` | Manual (owner PC) | Windows | Not run |
| T-26-02 | FR-26 | Manual-Mac | Spaces | missing | `checklist` | Manual (owner PC) | macOS | Not run |
| T-27-01 | FR-27 | Integration | writer flush on shutdown | existing (partial) | `cargo test --workspace` | CI + local | Both in CI | Partial |
| T-27-02 | FR-27 | Manual-Win | kill process then relaunch | missing | `checklist` | Manual (owner PC) | Windows | Not run |
| T-28-01 | FR-28 | Integration | mock server | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-29-01 | FR-29 | Unit | cap blocks request | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-30-01 | FR-30 | Unit | unapproved action refused | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-30-02 | FR-30 | Manual | kill switch | missing | `checklist` | Manual (owner PC) | Both in CI | Not run |
| T-31-01 | FR-31 | Unit | export/import roundtrip | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-32-01 | FR-32 | Unit | nothing sent before consent | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-33-01 | FR-33 | Integration | replay/dupe | missing | `server` | CI + local | Both in CI | Not run |
| T-34-01 | FR-34 | E2E | links resolve | missing | `link checker` | CI (Windows e2e) | Both in CI | Not run |
| T-35-01 | FR-35 | Component | shows once per version | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-36-01 | FR-36 | Manual-Win | update from 0.2.0 to next, tampered artifact rejected | missing | `checklist` | Manual (owner PC) | Windows | Not run |
| T-37-01 | FR-37 | Unit | shortcuts are not registered when the switch is off (default) | missing | `cargo test --workspace` | CI + local | Both in CI | Not run |
| T-37-02 | FR-37 | Component | enable/disable button toggles registration; state survives restart | missing | `pnpm test` | CI + local | Both in CI | Not run |
| T-37-03 | FR-37 | Manual-Win | Ctrl+Shift shortcut works only after enabling | missing | checklist | Manual (owner PC) | Windows | Not run |
| T-38-01 | FR-38 | Manual-Win | owner walkthrough of the current Meetings flow, defects logged | missing | checklist | Manual (owner PC) | Windows | Not run |

## 7. Requirements traceability

| Feature | Source | Milestone | Tests | Status |
|---|---|---|---|---|
| FR-01 | Owner request (inventory §1.1) | FM-8 | T-01-01…03 | Partial |
| FR-02 | Owner request (inventory §1.1) | FM-8 | T-02-01…03 | Planned |
| FR-03 | Owner request (inventory §1.1) | FM-8 | T-03-01…03 | Planned |
| FR-04 | Owner request (inventory §1.1) | FM-10 | T-04-01…03 | Blocked |
| FR-05 | Owner request (inventory §1.2) | FM-4 | T-05-01…03 | Planned |
| FR-06 | Owner request (inventory §1.2) | FM-3 | T-06-01…03 | Planned |
| FR-07 | Owner request (inventory §1.2) | FM-5 | T-07-01…02 | Blocked |
| FR-08 | Owner request (inventory §1.2) | FM-4 | T-08-01…02 | Blocked |
| FR-09 | Owner request (inventory §1.2) | FM-3 | T-09-01…02 | Planned |
| FR-10 | Owner request (inventory §1.2) | FM-10 | T-10-01…01 | Blocked |
| FR-11 | Owner request (inventory §1.3) | FM-3 | T-11-01…02 | Planned |
| FR-12 | Owner request (inventory §1.3) | FM-5 | T-12-01…01 | Planned |
| FR-13 | Owner request (inventory §1.3) | FM-6 | T-13-01…04 | Planned |
| FR-14 | Owner request (inventory §1.3) | FM-3 | T-14-01…01 | Planned |
| FR-15 | Owner request (inventory §1.3) | FM-5 | T-15-01…01 | Planned |
| FR-16 | Owner request (inventory §1.3) | FM-5 | T-16-01…01 | Planned |
| FR-17 | Owner request (inventory §1.4) | FM-7 | T-17-01…02 | Planned |
| FR-18 | Owner request (inventory §1.4) | FM-7 | T-18-01…01 | Planned |
| FR-19 | Owner request (inventory §1.4) | FM-0 | T-19-01…03 | Unverified |
| FR-20 | Owner request (inventory §1.4) | FM-1 | T-20-01…01 | Partial |
| FR-21 | Owner request (inventory §1.4) | FM-7 | T-21-01…01 | Planned |
| FR-22 | Owner request (inventory §1.4) | FM-1 | T-22-01…02 | Partial |
| FR-23 | Owner request (inventory §1.4) | FM-1 | T-23-01…02 | Unverified |
| FR-24 | Owner request (inventory §1.4) | FM-1 | T-24-01…01 | Unverified |
| FR-25 | Owner request (inventory §1.4) | FM-1 | T-25-01…02 | Planned |
| FR-26 | Owner request (inventory §1.4) | FM-4 | T-26-01…02 | Planned |
| FR-27 | Owner request (inventory §1.4) | FM-1 | T-27-01…02 | Partial |
| FR-28 | Owner request (inventory §1.5) | FM-5 | T-28-01…01 | Planned |
| FR-29 | Owner request (inventory §1.5) | FM-11 | T-29-01…01 | Blocked |
| FR-30 | Owner request (inventory §1.5) | FM-12 | T-30-01…02 | Blocked |
| FR-31 | Owner request (inventory §1.8) | FM-10 | T-31-01…01 | Blocked |
| FR-32 | Owner request (inventory §1.8) | FM-9 | T-32-01…01 | Blocked |
| FR-33 | Owner request (inventory §1.8) | FM-10 | T-33-01…01 | Blocked |
| FR-34 | Owner request (inventory §1.9) | FM-9 | T-34-01…01 | Planned |
| FR-35 | Owner request (inventory §1.9) | FM-2 | T-35-01…01 | Planned |
| FR-36 | Owner request (inventory §1.9) | FM-2 | T-36-01…01 | Blocked |

FR-37 and FR-38 come from the owner's 2026-10-19 instructions (shortcut master switch; Meetings redesign). Inventory §1 numbering: 1 Companion · 2 Productivity · 3 Student & developer · 4 Utilities · 5 AI · 8 Community · 9 Distribution. Item 6 (Project Spaces) = FR-06/09/11/14; item 7 (Credentials) = FR-13; item 10 (naming) = D-NAME.

## 8. Release gates

| Gate | Condition |
|---|---|
| G-test | `cargo test --workspace`, `pnpm test`, typecheck, lint green on the release commit; coverage floors met |
| G-win | Owner Windows checklist recorded |
| G-mac | Mac checklist recorded, else the release says "macOS untested" |
| G-sign | Signed artifacts (FM-2) before any public (non-test) release |
| G-sec | Secrets canary + egress tests green before FM-6 / FM-5 ship |
| G-docs | Documentation protocol (§11) satisfied |

## 9. Risks and blockers

| ID | Risk / blocker | Effect | Mitigation |
|---|---|---|---|
| RB-1 | Backend features conflict with local-first | FR-04, 10, 31, 32, 33, 34 cannot start | Owner decision D-BACKEND |
| RB-2 | No signing certificates | No safe updater (FR-36) | Owner orders certs |
| RB-3 | No Mac available | Mac features stay Unverified | Say so in release notes |
| RB-4 | Tag push blocked in this session | Owner pushes the tag | Commands given to owner |
| RB-5 | Scope: 36 features, one developer | Slips | One active milestone; Blocked items not planned |
| RB-6 | Existing R1–R11 | See PROJECT_STATUS §6 | — |

## 10. Current Focus

**Active milestone: FM-0** (verification of `v2.0.0`). **Mode: documentation only** (owner, 2026-10-19). Blockers: owner's test results for v2.0.0; D-SHORTCUT-DEFAULT upgrade detail. **Single next task:** owner sends the `v2.0.0` test results; Claude then records them in PROJECT_STATUS §8 and drafts FR-37 and FR-38 for owner approval. Update this section after every task.

**Update 2026-10-22:** active work is the documentation of FR-41..FR-58 and the student-first order (ROADMAP.md "Delivery order"). Next code milestone: FM-V2. Mode stays documentation-first until the owner says build.

## 11. Documentation update protocol (mandatory)

After **each feature, milestone and phase**: (1) update the feature spec and tick its checklist; (2) update status here and in `ROADMAP.md`; (3) update `PROJECT_STATUS.md`; (4) add a user-facing line to `CHANGELOG.md`; (5) update affected TRD / schema / app-flow docs; (6) record test results (command, date, count); (7) update §10 Current Focus. **Never** mark work Complete while tests, acceptance criteria or docs are outstanding; **never** state OS behaviour or test results that were not executed; **never** delete, reset, overwrite or discard user work — migrations are additive and preceded by a backup.

## 12. Technical-choice notes

Prefer existing plugins and crates over new dependencies; `keyring` crate for FR-13, `tauri-plugin-updater` for FR-36, local `git` for FR-21, Ollama over bundled models. Each is a proposal until its milestone starts.

## 13. Unresolved decisions (owner)

| ID | Decision | Blocks |
|---|---|---|
| D-SIZE | Sprite cell size: 192×208 (OpenPets-compatible, unconfirmed) or 256×256 | FR-50 |
| D-MCP-SHAPE | Local MCP transport (proposed stdio + local socket) | FR-54 |
| D-PLUGIN-MODEL | Plugin package, sandbox and permissions | FR-55 |
| Q1-Q6 | See docs/V2_ISSUES.md | FM-V2 |
| D-NAME | Final product name (stays undecided; no renames) | FR-34 |
| D-EMOTE-ORDER | Approve FM-8b (emotes) after FM-8 and the order in EMOTE_FEATURE_SPECS §3 | closed 2026-10-22 (approved) |
| D-EMOTE-MILESTONE | Define "milestone" for contextual reactions | closed 2026-10-22 (planned in EM-06; numbers tunable) |
| D-EMOTE-MASTER / D-EMOTE-DOUBLECLICK | Master switch default on; double-click keeps hiding the main window | closed 2026-10-22 |
| D-EMOTE-ART | Back and three-quarter turnaround art for built-in characters (needed by back_turn_shake) | closed for built-in characters: bear, Mochi, Pip, Bolt, Ghosty built (Unverified); personal-photo characters excluded by owner |
| D-UPLOAD | **Decided 2026-10-21: allowed.** Consent text and local-first processing required (FR-02, FR-39) | closed |
| D-FORMAT | **Approved 2026-10-21 as a starting point**; format to be found by trial and error (FR-39) | open (iterative) |
| D-RIVE | **Decided 2026-10-21: run the one-character Rive trial** (FR-39 §3.3) | open (trial) |
| D-CHARS | **Decided 2026-10-21: owner supplies reference images; Claude designs the built-in characters** | open (inputs) |
| D-VERSION | **Decided 2026-10-19: keep source version 0.2.0** (owner: "leave it"). Tag `v2.0.0` stays as the owner's label | closed |
| D-SHORTCUT-DEFAULT | **Owner, 2026-10-19: off by default "in the coming versions".** Open detail: does this also apply to existing installs on upgrade? | FR-37 |
| D-MEETINGS | **Owner will define it. Owner asked to be asked about it next time Meetings comes up.** Do not start | FR-38 (later phase) |
| D-ORDER | Merge FM-order with the owner's ROADMAP order; where Project Spaces goes | FM-3+ |
| D-BACKEND | May any server exist (accounts, telemetry, referrals, gallery)? | FM-9, 10 |
| D-AI | U12 provider; Ollama as the local default | FM-5 |
| D-CLOUD | Cloud fallback at all? default off | FM-11 |
| D-COMPUTER | Is a computer-use assistant in scope and with what permission model | FM-12 |
| D-CRED | Keychain-only credential policy | FM-6 |
| D-TANTRUM | Tab Tantrum accuracy on Windows without extension | FR-08 |
| D-TYPES | Project types and unit of "project" | FM-3 |
| existing | U13, U16 (provisional), U18, U19, U21–U23 in [`DECISIONS.md`](DECISIONS.md) | various |
