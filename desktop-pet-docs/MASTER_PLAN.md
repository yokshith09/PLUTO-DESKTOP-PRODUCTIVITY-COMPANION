# Pluto — Master plan (phases, milestones, features)

> **Owner's 2026-10-28 list (progress):** phases 1-3 built, all Unverified on a real PC. Phase 1 (notes delete, quick add, calmer task editor, narrow focus timer, right-click menu), phase 2 (fullscreen hiding, Character page tiles, stretch and water reminders, every delete asks first), phase 3 (research, per-character reactions + one special each, alignment checker and our five characters rebuilt through it, `pluto-character` skill: name + picture in, one ZIP out). **Next:** T13 production-readiness audit, trivia is built (first-launch tour + Learn Pluto quiz + roles, 2026-10-28), T15 character design briefs, then the student release (P2). Owner still to test and then say "push" / the next version.

> **Re-planned 2026-10-29 (owner):** next milestone is **MCP** (P4 Developer & MCP); Voice is its own phase for a second developer (P6); the small features are one phase (P5); P3 Characters waits. See "Order from 2026-10-29" below. P2 Student release is complete in code (Unverified on a real PC; mood faces dropped as optional).

> **Active work (2026-10-23): FM-V2 fix pack + companion features + fixing the pet-visibility bugs (report: `docs/BUG_REPORT_2026-10-23_pet_visibility.md`).** M1-M3 are code-complete (owner: works in v2.0.0).

> **Where we stand (2026-10-27):** P0 and P1 are built (Unverified, waiting for the owner's Windows results); P3 Characters is partly pulled forward (wardrobe, reactions, packs); P2 Student release has not started. Version 0.5.1 is the current draft. Details: `PROJECT_STATUS.md` §3.

> **Planning is closed (owner, 2026-10-22).** From here we only build, top to bottom. New ideas go to DECISIONS.md as one line and wait for the next planning round. Blockers and the ways to unblock them: [`docs/BLOCKERS_AND_OPTIONS.md`](docs/BLOCKERS_AND_OPTIONS.md).

**Date:** 2026-10-22 · **Source version:** 0.2.0 (owner label v2.0.0) · **Positioning:** student-first, local-first desktop pet + productivity.

This is the one page that says **what we build, in what order, and when each thing is done**. Detail lives elsewhere: full 13-point specs in [`docs/features/FR-v2-features.md`](docs/features/FR-v2-features.md) (FR-41…FR-58) and [`docs/features/FR-openpets-parity.md`](docs/features/FR-openpets-parity.md) (FR-59…FR-82, every OpenPets feature) and [`docs/features/`](docs/features/README.md); evidence in [`PROJECT_STATUS.md`](PROJECT_STATUS.md); reasons in [`DECISIONS.md`](DECISIONS.md); competitor in [`docs/competitors/OPENPETS_RESEARCH_2026-10-22.md`](docs/competitors/OPENPETS_RESEARCH_2026-10-22.md).

**Status words:** Complete (run on a real OS) · Unverified (built, tests pass, nobody ran it on a real OS) · Partial · Planned · On hold (owner) · Blocked (needs something outside the code).

**Rule:** one milestone at a time, top to bottom. Nothing is "Complete" until the owner runs it on Windows.

---

## Phase overview

| Phase | Goal | Milestones | Ends when |
|---|---|---|---|
| **P0 Foundation** (done in code) | Notes, tasks, meetings, pet, time tracking work | M0, M1, M2, M3 | Owner's Windows test of v2.0.0 recorded |
| **P1 Fix & polish** | Everything the owner reported in V2 works | FM-V2 | All 16 V2 issues closed and run on Windows |
| **P2 Student release** | A student can plan, study and track a semester | FM-ST, FM-GUIDE, M8 | Student pack + guide + focus shipped as v0.3.0 |
| **P3 Characters** | Pets look alive, customisable, compatible with OpenPets packs | FM-CS, M6, M13 | Studio + packs + accessories + emotes shipped as v0.4.0 |
| **P4 Developer & MCP** (NEXT) | Pluto works with a developer's tools | MCP server (FM-INT) first, then FR-76, M12, FM-PS | MCP page live, pet reacts to a real coding assistant; v0.6.0 |
| **P5 Small features pack** | Quick wins in one phase | M4, FR-72, FR-73, M11, FR-74 (.ics) | Five features shipped; v0.7.0 |
| **P6 Voice** (second developer) | Speak a task or note | M9 | Held-key dictation works on-device; v0.8.0 |
| **P7 Reach** | Linux, languages, LAN | FM-LIN, FR-81, FR-79, FR-78 | Linux build and Hindi + Telugu; v0.9.0 |
| **P8 AI** (on hold) | Writing help, summaries, quiz, talk to the pet | M5, M7, FR-75, FR-80 | Owner picks an AI provider |
| **P9 Online** (on hold) | Accounts, gallery, sharing | FM-BE, FR-84, FR-97 | Owner approves backend + privacy statement; code signing |
---

## P0 — Foundation (M0-M3) — code done, waiting for the owner's Windows test

| ID | Feature | Status |
|---|---|---|
| M0 | Foundation: autostart, export/import/delete, performance harness | Partial |
| M1 | Notes, tasks, search, labels, dates, daily progress | Unverified (owner: works in V2) |
| M2 | Meetings, pet window, global shortcuts, settings, first run | Unverified (owner: works in V2) |
| M3 | App and website time, privacy panel (option d) | Unverified |

**Owner action:** run the v2.0.0 checklist on Windows and send results. This turns P0 Complete.

---

## P1 — Fix & polish: **FM-V2** (ACTIVE NEXT)

| ID | Feature | Defined as | Done when | Size | Status |
|---|---|---|---|---|---|
| FR-41 | Messages after add/edit — **above the pet only** (owner 2026-10-23, replaces the toast stack) | "Task saved", "Moved to Bin · click: Undo" as pet bubbles; errors 8 s; after add/edit the user returns to where they were | Every add/edit/delete says so above the pet; nothing pops up in the dashboard; tests for bubble text, pose, Undo by clicking the pet | M | **Built, Unverified** |
| FR-42 | Actionable task↔note links (Q5 confirmed) | "Open note" button on a task; "Linked tasks" list in the note; "Create note from task"; Links section inside Notes (V2-08) | Clicking a link opens the target; both sides show the link | M | **Built, Unverified** |
| FR-43 | Pop-ups above the pet, fixed (Q2) | Notifications and emote bubbles stay above the pet; positioned so they never go off-screen, one at a time, readable | Bubble visible at every screen edge; tests for placement | S | **Built, Unverified**: all messages above the pet; at screen edges the card/bubble takes the side with more room (tested) |
| FR-44 | Time tiles resizable, no empty space | Drag-to-resize with grid snap; tiles grow to fill the row | No gaps at any window size | M | **Built, Unverified** (snapped presets, not drag) |
| FR-45 | Date/time picker | Presets (Today, Tomorrow, This weekend, Next week, In 3 days), month grid, time list | Used in tasks, reminders, meetings | M | **Built, Unverified** (presets + system picker) |
| FR-46 | Auto-delete (Q3) | Per type: Time/activity history and completed tasks; Never / 30 / 90 days / 6 months / 1 year; preview first, goes to Bin | Older data moves to Bin on schedule; notes, meetings, open tasks never touched | M | **Built, Unverified** |
| FR-47 | Remove Logs rows from Settings | UI only, logging stays | Rows gone | XS | **Built, Unverified** |
| FR-48 | Editable pet-window shortcuts, default off | Record new keys, conflict check | Shortcut changes saved and work | S | **Built, Unverified** |
| FR-62 | Browser tabs on the dashboard (Q4) — **already built** (Time tab "Open tabs", `tabs.rs`), hidden unless app + website tracking are both on; remaining work: make it findable | List open tabs of Chrome/Edge/Firefox, click to switch, ✕ to close. **No extension**: Windows UI Automation. Off by default, titles never stored | A 1-day spike works on Windows; else reported back | L | **Built, Unverified** (always on Time; Windows lists the front window only) |
| FR-61 | **Rename links (V2-16, new)** | Edit a link's name (and URL) in place from the Links card and Notes | Rename saved and shown everywhere | S | **Built in the Links card, Unverified** (Notes Links section comes with FR-42) |
| FR-85 | **Daily routine tile + reminder** (owner 2026-10-23) | Checklist that resets daily, progress ring, streaks, "You have N daily routine tasks pending" once a day at a chosen time | Ticks reset; reminder fires once when pending | M | **Built, Unverified** |
| FR-52 | Meeting action items on Today (Q6 yes) | Converted tasks appear on Today with a "from: <meeting>" chip | Chip shown, click opens the meeting | S | **Built, Unverified** |

| FR-106…FR-109 | Task links, stars, chosen days, repeating tasks (owner 2026-10-23) | See `docs/features/FR-106-110-task-upgrades.md` | Built and tested; manual Windows check pending | M | **Built, Unverified** |
| FR-05 + FR-110 | Saved focus sessions; timer above/below the pet; hover card optional, bubble when off; cheer + break offer at the end | Same file | Built and tested; manual Windows check pending | M | **Built, Unverified** |

**Order inside FM-V2:** FR-47 → FR-61 → FR-42 → FR-41 → FR-43 → FR-52 → FR-45 → FR-44 → FR-46 → FR-48 → FR-62 spike.
**Release:** v0.2.1 for owner testing.

---

## P2 — Student release

### FM-ST Student pack (FR-58) + Diary (FR-86) + Now strip (FR-88) + Quiet modes (FR-89)
Specs: `docs/features/FR-84-87-owner-requests.md`; research: `docs/business/MARKET_RESEARCH_2026-10-23.md`.

| Feature | Defined as | Done when |
|---|---|---|
| Course label | Tag notes/tasks with a course; filter by course | Course filter on Notes and Tasks |
| Exam countdown | Exam dates with days-left on Today | Countdown tile |
| Weekly report | Hours studied per course, tasks done | Report screen, exportable |
| Focus linked to a task | Start focus from a task; time logged to it | Task shows focus time |
| Quick capture | One shortcut → new note or task from anywhere | Works while app is in the tray |
| Quiz from notes | Questions generated from notes | **On hold** (AI provider) |

### FM-GUIDE Guide (FR-51) + Role profiles (FR-83)
First run asks Student / Developer / Student who codes / General; each role sets which features start on or off (matrix in [`docs/features/FR-83-role-profiles.md`](docs/features/FR-83-role-profiles.md)); users can switch anything; privacy features off for every role.

Tour of each tab on first run, skippable at any step; Guide page in Settings; credit line "Built by QUORBIT TECHNOLOGIES". Done when a new user can finish or skip the tour and reopen it later.

### M8 Focus & wellbeing (FR-05, FR-69, FR-70)
| ID | Feature | Done when |
|---|---|---|
| FR-05 | Pomodoro focus with the pet reacting; daily/weekly summaries; goals | Session logged to a task; summary screen |
| FR-69 | Calm corner (breathing, grounding, relaxation, meditation, sounds), water reminder, mood check-in, morning/evening routines | Each works offline; only Calm corner on by default |
| FR-70 | Timer and quick reminders from the pet menu, snooze | Fires on time while minimised |
| FR-82 | Flashcards from notes (term : meaning, drag to match), usage buddy | Quiz runs from a note; usage nudge off by default |

**Release:** v0.3.0.

---

## P3 — Characters

### FM-CS Character Studio & sprite packs (FR-49, FR-50, FR-59)
| Feature | Defined as | Done when | Status |
|---|---|---|---|
| Sprite packs (FR-50) | OpenPets/Codex V1 format: `pet.json` + `spritesheet.webp`, 8×9 cells of 192×208, rows idle…review | 5 packs load in OpenPet/OpenPets on Windows | **Built, Unverified** (all rows drawn) |
| Pack import | Import any Codex/OpenPets pack (ZIP or folder), validate, preview | A downloaded pack runs as the Pluto pet | Planned |
| Studio preview | Row picker plays each row at its real timing | All 9 rows play | Planned |
| Accessories as **wardrobe outfits** (FR-49) | Hat, glasses, scarf, bow, headphones drawn per character; saved as OpenPets `wardrobe` outfits with optional schedule (e.g. scarf in winter) | Outfit switches live and by schedule | Planned |
| Cursor gaze (FR-59) | V2 format: 2 extra rows, 16 look directions | Pet eyes follow the cursor | Planned |
| Import any OpenPets/Codex pack (FR-63) | ZIP/folder/drag-drop, validated, preview, Codex folder scan | A real OpenPets pack runs in Pluto | **Partial, Unverified**: folder import, `~/.codex/pets` scan, preview, use as pet built; ZIP and drag-drop to do |
| Wardrobe with schedules (FR-64) | Outfits incl. graduation cap, pajamas; time/day/date rules | Outfit changes on schedule; loads in OpenPets | Planned |
| Pet gallery (FR-66) | Static catalog on **GitHub Pages** (owner-approved), install with one click, hash-checked | Install works; no request until opened | Planned |
| Export pack | Export the current character (+ outfits) as a pack ZIP | ZIP passes OpenPets validation | Planned |
| Personal photo characters | — | — | **On hold** |

### M6 Reminders & contextual pet (finish) · M13 Character customisation
| ID | Feature | Done when |
|---|---|---|
| FR-65 | Activities: emotes as one-shot animations, in the menu and in packs | All 8 emotes play and export |
| FR-60 | Drag, throw with physics, wander (off by default), multi-monitor | Throw always lands on screen |
| FR-68 | Size presets, Normal/Relaxed pace, "when X play Y" mapping | Applies without restart |
| FR-67 | Up to 3 pets; a pet per Project Space | RAM stays <100 MB |
| FR-71 | Care mode (productivity feeds the pet, no punishment), fortune cookie, magic 8-ball | Off by default |

**Release:** v0.4.0.

---

## Order from 2026-10-29 (owner re-plan)

**P3 Characters is paused ("can be done later"). The next milestone is MCP.** Voice is its own phase and is built by a second developer in parallel. The small features of the old P4 and P5 are one phase of quick wins. Plugins are art packs only (closed 2026-10-22), so there is no code Plugin SDK anywhere in this plan.

```
NOW        P4 Developer & MCP  ─ MCP server ▶ coding-agent link ▶ developer reactions ▶ Project Spaces
IN PARALLEL P6 Voice (second developer; only touches the voice module and the existing commands)
AFTER P4   P5 Small features   ─ Quick Actions · Launch Buddy · System resources · Privacy report · Calendar import
THEN       P7 Reach            ─ Linux + Wayland · Languages (Hindi, Telugu first) · LAN mode
LATER      P3 Characters (rest) · P8 AI (on hold) · P9 Online (on hold)
```

---

## P4 — Developer & MCP (NEXT; release v0.6.0)

> **Full plan: [`MCP_PLAN.md`](MCP_PLAN.md)** (2026-11-01): pieces, protocol versions, every tool, safeguards, hooks, screens, data, tests, build steps P4.1a-c, and nine questions for the owner. The table below is the summary; where they differ, `MCP_PLAN.md` is newer.

**In plain words:** Pluto stops being an island. Coding assistants and other tools on your PC can talk to your pet and your work, and developers get a project home. Everything is opt-in, off by default and local only: no network port is ever opened.

| # | Milestone | What you would see | How it is built | Done when |
|---|---|---|---|---|
| 1 | **MCP server (FM-INT, FR-54), the next milestone** | The **MCP** page in the sidebar (today "coming soon") becomes real: one switch, a copy-paste config line for your tool, the current connection, and a log of what asked for what. | Approved shape (2026-10-22): **stdio plus a named pipe with a per-run token; no open port.** Tools: `status` (what Pluto is doing), `react` (make the pet play a reaction), `say` (a bubble). A later step adds read-only task and note lookups only if you ask. Core stays free of Tauri: the server logic lives in `pluto-core`, the pipe in the shell. | A real MCP client connects, lists the three tools, makes the pet react; a wrong token is refused; switching it off closes the pipe. Windows tested by you, macOS only in CI. |
| 2 | **Coding-agent link (FR-76, moved here from the old P7)** | When Claude Code, Cursor and similar assistants start, think or finish, your pet shows it (working pose, "done" cheer, "needs you" bubble). | Small hook scripts that call the MCP `react`/`say` tools; one config line per assistant, generated for you. | Works with one real assistant end to end; nothing is sent anywhere. |
| 3 | **Developer reactions (M12)** | The pet reacts to a git commit, a local build finishing or failing, and CI going red or green. | Watches the folders you choose (git state only, never source) and wraps a build command with `pluto run`; the CI part needs a token and the network layer, so it comes after the local work (see the plan below). | Reactions fire on a test repository. |
| 4 | **Project Spaces (FM-PS, FR-53)** | A **Projects** item (opt-in): each project has its own notes, tasks, links and files; a project can have its own pet (FR-67). | A project is a row that notes and tasks point to, like courses; files are links to paths on your disk, never copies. | Turn it on, make a project, see only its things; turn it off, nothing is lost. |

**Order inside P4:** 1 → 2 → 3 → 4. **Needs from you:** nothing before starting 1. **Local first (owner 2026-10-31):** the whole of P4 is built without any network code. CI reactions (the one part that must call GitHub) wait for the separate network layer after the local MCP server is done and tested.

### P4 plan: "tell me when it's done" — four situations (owner 2026-10-31)

All four end the same way: Pluto raises a **named reaction** (`agent_done`, `agent_needs_you`, `agent_error`, `git_commit`, `git_push`, `build_ok`, `build_failed`, `ci_green`, `ci_red`). Each reaction gets a default pose and line and shows up in the Character page's Reactions list, so you can turn one off, change its pose or write your own words, like every other reaction. The pet is its own always-on-top window, so it shows over WhatsApp or any other app; it stays hidden while another app is full screen if "Get out of the way in full screen" is on. Nothing leaves your PC. Nothing is built yet.

| Situation | What detects it | Built in | Needs from you | Limits, stated plainly |
|---|---|---|---|---|
| **Claude (or another assistant) finishes while you use WhatsApp** | **Hooks**, not the model's own choice: Claude Code runs a command you configure when a reply ends ("Stop") and when it is waiting for you ("Notification"). The command is `pluto react agent_done` (a flag on the Pluto program, talking to the private pipe with the per-run token). The MCP `react` and `say` tools are the second route for assistants without hooks; they only fire if the model decides to call them, so they are best-effort. | P4.2 | Paste one generated config block into your assistant's settings (Pluto writes it for you and shows what it will do). | Works only while Pluto is running. If the pet is hidden by you, nothing shows (open: an OS notification as fallback). The exact hook names must be checked against the current Claude Code docs before building. [Likely] |
| **Commits and pushes from VS Code** | Pluto watches the `.git` folder of repositories you choose: a commit moves the branch's ref, and a push that **succeeded** moves `refs/remotes/origin/<branch>` (git updates it itself, whichever tool ran the push, so nothing is installed in VS Code). Git state only, never your source files; the reaction shows the repository's folder name, not the commit message. | P4.3a | Pick the folders (a folder picker; none by default). | A **failed** push changes no ref, so it cannot be seen this way. Seeing it needs the wrapper below or a small VS Code extension (later, optional). Uses a file-watcher library: a new dependency to check with `cargo audit`. |
| **Build finished or failed** | **`pluto run -- <command>`**: runs your build command, passes its output through untouched and reacts to the exit code (0 = `build_ok`, else `build_failed`). Works in any terminal and as a VS Code task (`tasks.json` calls the same command). | P4.3b | Put `pluto run --` in front of the command you already use. | Only builds started that way are seen; Pluto does not watch other processes. A small VS Code extension using the task-ended event would remove the prefix; it is a separate, optional piece. |
| **CI red or green** | After a push is seen (above), Pluto asks GitHub for that commit's check results every minute until they finish, then stops; it never polls idly. | **After the network layer** (not in P4's local part) | A GitHub token you create with read-only access and paste in; stored in the operating system's credential store, never in the database or a file. | The first network code in the app, so it is opt-in and off without a token. The one-minute polling rate is well inside GitHub's limits for a signed-in token. Needs your decision (see `RESEARCH_INTEGRATIONS.md` E1). |

**Order:** P4.1 local MCP server → P4.2 assistant hooks (situation 1) → P4.3a git watcher (2) → P4.3b `pluto run` (3) → P4.4 Project Spaces → *network layer* → CI reactions (4) and the connectors in `RESEARCH_INTEGRATIONS.md` F.

---

## P4.5 — Full screen and Tab Tantrum (owner 2026-11-02: "I want both")

P4's local part is done in code (MCP, hooks, git watcher, Project Spaces). Full list of the owner's 33 features with status, key points and the fix for each blocker: [`docs/features/OWNER_FEATURE_LIST_2026-11-02.md`](docs/features/OWNER_FEATURE_LIST_2026-11-02.md).

| # | Item | What you would see | How | Done when |
|---|---|---|---|---|
| FS-1 | **Full-screen compatibility (FR-26)** | Setting "In full screen: Hide · Small in a corner · Stay" (default Small in a corner). The pet, Focus timer pill and Tab Tantrum still work over a full-screen browser, video or editor. | Windows: pet window stays topmost (borderless full screen; exclusive full-screen games cannot be drawn over, said in the setting). macOS: full-screen auxiliary + all Spaces. | Owner checks a full-screen browser and video on Windows and Mac. |
| TT-1 | **Tab Tantrum (FR-08)** | Past your limit (default 15 tabs in the front browser window), the pet throws a small tantrum; click it to see the tabs and close some. Off by default. | **Blocker fixed:** the count comes from the tab strip, which lists every tab's title on Windows (accurate count); only the domain of background tabs is unknown there. macOS reads every tab. No extension. Uses the existing `tracking.sites` permission. | Unit tests for the threshold and cooldown; owner checks the count against a real browser. |

Order: FS-1 → TT-1, each with a preview first. Owner 2026-11-03: after the UI polish (U-3 first).

### Assistant ideas (owner asked 2026-11-03 for more like "which chat needs you"; not built, owner to pick)

| Idea | What you would see | Needs |
|---|---|---|
| A-1 Waiting count on the pet | A small badge "2" when two chats are waiting for you; hover lists them by folder. | Hooks already send it; keep a list until the chat replies (UserPromptSubmit hook clears it). |
| A-2 Chats in Project Activity | A project's Activity shows "Claude Code finished · “Add Tab Tantrum”" for chats in its folder. | Folder → project (built); store hook events like git events. |
| A-3 Long task finished while away | If you were away (idle) when a chat finished, the pet tells you when you come back, once. | Idle detection exists. |
| A-4 Click to go there | Clicking the bubble brings the terminal or VS Code window of that chat to the front. | Window lookup by folder name in the title (Windows UI Automation; macOS AppleScript). Medium. |
| A-5 Daily "with Claude" line | End-of-day recap: chats finished, permissions answered, per project. | A-2 first. |
| A-6 Permission names the tool | "DESKTOP-PET wants to run **Bash**". | The hook message already names the tool. Small. |
| A-7 Long run notice | "DESKTOP-PET has been working 25 min", so you know it is not stuck. | Prompt-submit time per chat (UserPromptSubmit hook). |
| A-8 Different chime per kind | "Needs you" and "done" sound different. | Sound setting per reaction. Small. |

**Owner 2026-11-03: all of A-1..A-8 are in the plan**, listed on the Assistants page under "Coming" (clearly marked as not yet working). Suggested order: A-6, A-1, A-8, A-3, A-7, A-2, A-5, A-4 (A-4 last: finding a window by its title is unreliable).

### More assistants (owner 2026-11-03: Codex, Cursor, OpenCode, ChatGPT, Windsurf, DeepSeek)

| Id | Tool | Connect (MCP) | Pet reactions (done / needs you) | Notes |
|---|---|---|---|---|
| H-1 | Codex (CLI and app) | `~/.codex/config.toml` `[mcp_servers.pluto]` (TOML, new format in setup) | Codex hooks (beta: Stop) or `notify` on agent-turn-complete; never overwrite a `notify` the user already has | |
| H-2 | Cursor | Already connects (`~/.cursor/mcp.json`) | `~/.cursor/hooks.json` `stop` → done | Cursor CLI sends fewer hook events (known Cursor bug). |
| H-3 | OpenCode | `~/.config/opencode/opencode.json` `mcp.pluto` (`type: local`, command array) | A small plugin file on `session.idle` → done | |
| H-4 | Windsurf | `~/.codeium/windsurf/mcp_config.json` (`mcpServers`); newer builds also read `%APPDATA%\devin\mcp_config.json` / `~/.config/devin/` — write the ones that exist | Hooks: to be checked when built | Windsurf's docs moved to Devin; verify paths on the owner's PC. |
| H-5 (dropped from the page, owner 2026-11-03) | ChatGPT (app) | **Not possible locally**: ChatGPT only adds remote HTTPS MCP servers, never a program on your computer. Would need a public tunnel, which breaks "nothing leaves your computer". | — | Shown as a tile that explains this and points to Codex (same account). |
| H-6 (dropped from the page, owner 2026-11-03) | DeepSeek | **A model, not an app that connects**: use it inside Codex, OpenCode or Cursor and Pluto works there. | — | Shown as a tile that explains this. |

Built 2026-11-03 (H-1 Codex, H-2 Cursor hooks, H-3 OpenCode, H-4 Windsurf tools only; preview approved by the owner without the ChatGPT and DeepSeek tiles). Unverified until run on the owner's PC. Windsurf pet reactions: check its hooks when the owner has it installed.

## After MCP: UI polish batch (owner 2026-10-31; **not before P4 is done**)

MCP is the top priority once the open fixes are out. These four come after it, in this order, and each needs a preview approved by the owner before it is built (CLAUDE.md: ask before design choices).

| # | Item | What the owner asked for | Notes |
|---|---|---|---|
| U-1 | **Rich-text note editor** | Tick a checklist box while writing, in the editing view (today boxes can be ticked in Preview only). | Replaces the plain text box with an editor that shows boxes, bold, headings and lists as you type, and still saves Markdown, so existing notes, search and export are unchanged. Needs a library choice (decision) and a migration test over real notes. The biggest of the four. |
| U-2 | **Settings in two tabs** | "Main settings" and "Profile" (grouping, not a new page). | Profile = the role, name, birthday, tour and quiz that sit in Settings and the Character page today. Preview first. |
| U-3 | **Task editor, tidier** | "Optimise the UI". | A calmer layout of the editor that already has one row per property (links, star, repeat, reminder lead and sound, focus length). Preview first, with what is dropped or moved listed before it is touched. |
| U-9 | **Character page, cleaner** | Owner 2026-11-03: "enhance the UI, keep the reactions collapsed under a neatly designed button, keep borders and layouts good." | The moment list (Idle, Working, …) folds behind one button; even borders and spacing across the page. Preview first, after U-3. |
| U-4 | **Diary and Study tabs, richer** | "Enhance". | What "enhance" means is not decided: the owner picks from a list of options (for example: Diary mood and streak view, a weekly look back; Study timetable view, a study-time chart per course, flashcard-style review). Not designed yet. |

| U-5 | **Tiles: free resize (FR-22, #7)** | Owner list 2026-11-02 | Optional; today a row shares its width equally. Preview first. |
| U-6 | **Time tab: calendar grid (FR-20/21, #10)** | Owner list 2026-11-02 | A square per day, darker = more time; commits from the watcher on the same grid. Preview first. |
| U-8 | **Routine tracker (FR-114)** | Owner 2026-11-02: "progress from day to day, how many routines I follow, my performance" | Calendar grid, week vs week, each habit's 30-day rate, "x of the last 7 days" (no guilt streaks). Hovering a day shows its planned and completed habits with the count (owner 2026-11-03). Needs each day's planned habits stored from now on. Preview first. |
| U-7 | **Project templates (FR-113, #31-33)** | Owner list 2026-11-02 | Developer · Student · Research · Freelance · Personal set the first tabs of a Project Space; one page, not five. Preview first. |

**Progress:** U-1 built 2026-11-03 (Unverified). U-2 approved 2026-11-03 (name and pet details move to Profile with a link from Character; nudges stay on Character; Settings opens on Main) — built 2026-11-03 (Unverified in the real window). Rule: a preview, owner approval, then code; one item at a time, tests with each, docs in the same change.

Other pages are fine for now (owner); they get fixed later, as they come up.

---

## P5 — Small features pack (release v0.7.0)

**In plain words:** five self-contained quick wins taken from the old P4 and P5. Each is one to three days, none depends on another, and each can ship on its own as a point release.

| Feature | What you would see | Done when |
|---|---|---|
| **Quick Actions (M4)** | One shortcut opens a command bar: new note or task, search everything, open a saved link. | Works from any app; every action is also reachable without it. |
| **Launch Buddy (FR-72)** | A saved set of apps, links and files opens in one click, from the pet or Quick Actions. | A missing file is reported, never silently skipped. |
| **System resources (FR-73)** | A small CPU, RAM, disk and battery badge, off by default. | No visible slowdown; reads the OS only while shown. |
| **Privacy radar report (M11)** | A per-site evidence page behind the radar flag, exportable. | Builds on the radar already shipped. |
| **Calendar Airmail, first half (FR-74)** | Import an .ics file and get reminders for the events. Google and Outlook connectors are not in this phase (they are not local-first). | An imported event rings like a reminder. |

---

## P6 — Voice (own phase, **second developer**; release v0.8.0)

**In plain words:** hold a key, speak, and it becomes a task, a note or a search. It is its own phase because it needs a speech engine and its own testing, and it is handed to another developer so it runs in parallel with P4.

| Item | Detail |
|---|---|
| Milestone M9 | Push-to-talk → text → one of: add a task, add a note, search. A confirmation chip shows what was understood before it is saved. |
| Privacy (non-negotiable) | The speech engine runs **on your PC**; audio is never sent anywhere and never stored. Off by default. The microphone is opened only while the key is held. |
| Open choice | Which local speech engine (small, permissively licensed, works offline on Windows and macOS). The developer proposes two with a spike (size, accuracy, speed) and the owner picks. |
| **Contract with the rest of Pluto** | Voice only calls commands that already exist (`task_quick_add`, `note_create`, search). It adds one Rust module, one UI folder (`src/features/voice`), one setting key and one shortcut. It does not change existing screens or tables, so it cannot collide with P4 or P5. |
| Handoff rules for the second developer | Read `CLAUDE.md` and `PROJECT_STATUS.md` §9 first; work on a branch and open a pull request, never push to `main`; tests with every change; mark anything that needs a real PC **Unverified**; record choices as one line in `DECISIONS.md`; run `pnpm typecheck && pnpm lint && pnpm test` and the Rust checks before asking for review. |
| Done when | Held-key dictation creates a task and a note on Windows (owner tested) and macOS builds in CI; microphone permission denied is handled with a clear message. |

---

## P7 — Reach: Linux, languages, LAN (release v0.9.0)

| Milestone | What you would see | Honest risk |
|---|---|---|
| **FM-LIN (FR-57) + Wayland (FR-81)** | Pluto installs on Linux (AppImage and .deb), including Wayland. | Always-on-top and transparent windows are weaker on Wayland. Stays Unverified until run on real Linux. |
| **Languages (FR-79)** | A language picker, **Hindi and Telugu first**, then the rest. | Every screen's text moves into translation files; a native reader must check the wording. |
| **LAN mode (FR-78)** | The pet walks between your own PCs on the same network. | Last and off by default; the only item that opens a network door, so it needs its own privacy review first. |

---

## P8 — AI (on hold: you pick the provider)

FR-75 talk to your pet (chat, and voice by reusing P6) · M5 writing and prompt helper · M7 meeting summaries · quiz from notes · FR-12 study companion · FR-16 error translator · FR-80 AI Pet Studio (photo or idea to pet; also needs the personal-character rules decided).
**The decision that unlocks it:** a local model (private, free to you, uses your PC; about a day of spike work first) or your own provider key (better quality, text leaves the PC). "We never pay" is recorded.

## P9 — Online (on hold: backend, privacy statement, certificates)

FM-BE (FR-56) accounts and uploads · gallery and community site (FR-84, Supabase chosen; the gallery may start on GitHub Pages) · FR-97 friends-only study groups · sharing, referrals, leaderboards (FR-04, FR-10, FR-31; optional, off by default) · code signing through SignPath Foundation (free for open source) once the repository is public.
**Removed:** the Plugin SDK (FR-77). Plugins are art packs only (decision 2026-10-22), which need no SDK.

## Blockers — see docs/BLOCKERS_AND_OPTIONS.md

| Open | Blocks | Recommended way out |
|---|---|---|
| Windows test of v2.0.0 | P0 → Complete | Owner runs RELEASE_0.2.0_TEST.md |
| AI runtime | P8 | Local (llama.cpp sidecar + small Apache model, Ollama if present) + BYOK; we never pay; 1-day spike |
| Code signing | installers | **Open source (decided)** → apply to SignPath Foundation once the repo is public |
| Backend | P9 only | Closed for now (owner) |
| Personal-photo characters | FR-80 | "Draw-your-own from parts" first; photos after AI |
| Product name | FR-34 | Owner gives 5-10 names; we check domains/trademarks |
| FR-62 tabs spike | FR-62 | Us, day 1 of build |

Closed 2026-10-22: open source (MIT) · plugins = art packs only · MCP shape approved · gallery on GitHub Pages · Hindi + Telugu first · role profiles (FR-83) · Q1 toast stack · Q2 bubbles above pet stay · Q3 auto-delete Time + completed tasks · Q4 browser tabs on dashboard · Q5 link plan · Q6 meeting tasks on Today · D-SIZE 192×208 (confirmed by OpenPets source) · D-LICENCE CC BY 4.0 · student-first order.

---

## OpenPets parity — every feature they have, where it lands

| OpenPets feature | Pluto ID | Phase |
|---|---|---|
| Sprite packs (V1) | FR-50 | P3 (built, Unverified) |
| Cursor gaze (V2) | FR-59 | P3 |
| Drag/throw, wander, multi-monitor | FR-60 | P3 |
| Import packs, Codex pets, install links | FR-63 | P3 |
| Wardrobe + schedules | FR-64 | P3 |
| Activities | FR-65 | P3 |
| Catalog/gallery | FR-66 | P3 |
| Pet per workspace / agent, multiple pets | FR-67 | P3 |
| Size presets, reaction pace, mapping | FR-68 | P3 |
| Anxiety Aid, Water, Mood, Routines | FR-69 | P2 |
| Simple Timer, Quick Reminders | FR-70 | P2 |
| Virtual Pet, Fortune Cookie, Magic 8-Ball | FR-71 | P3 |
| Launch Buddy | FR-72 | P5 |
| System Resources | FR-73 | P5 |
| Calendar Airmail | FR-74 | P5 (.ics; connectors later) |
| Talk to the pet (AI chat/voice) | FR-75 | P8 (on hold; voice input from P6) |
| Coding-agent MCP + hooks | FR-76 | P4 (after the MCP server) |
| Plugin SDK | FR-77 | Dropped (plugins are art packs only) |
| LAN mode | FR-78 | P7 (last) |
| 8 languages | FR-79 | P7 |
| AI Pet Studio | FR-80 | P8 (on hold) |
| Wayland | FR-81 | P7 |
| Vocabulary drag & drop, Usage Buddy | FR-82 | P2 |
| Spotify Buddy, Higgsfield Watch | — | Not copied (low value) |

**What Pluto has that OpenPets does not:** notes, tasks, meetings, daily progress, app/website time tracking, privacy radar, student pack, Project Spaces, typing-along pet, hand-drawn built-in characters (5 vs their 1), Tauri (lighter than Electron).

---

## Owner requests 2026-10-23
FR-84 community website + upload server (P7, backend reopened for it, **Supabase** chosen 2026-10-23) · FR-85 daily routine (built) · FR-86 private diary with task pick-up (FM-ST) · FR-87 per-event pet reactions with a feature audit (M6) · FR-88 now strip and FR-89 quiet modes (added from research, P2). Pet art spec + standard prompt: `docs/character/PET_ART_SPEC.md`. GTM: `docs/business/GTM_PLAN.csv`.

### Research rules from social research (2026-10-23, `docs/business/SOCIAL_RESEARCH_2026-10-23.md`)
- **No-guilt rule:** the pet never punishes or sulks at a missed day; streaks are forgiving (FR-90, planned: a missed day pauses, doesn't reset; weekly "best run" view).
- **Earned growth:** pet growth from finished focus sessions and routine ticks, paced per user, first milestone within a day; included in export/import (FR-91, planned, M13).
- **Study hours per subject** moves into the student pack (FR-58) as its headline feature.

---

## Companion principles (owner 2026-10-23) — `docs/features/FR-92-97-companion-principles.md`
Rules for every feature: **no-guilt rule** (FR-92, enforced by a test), **attention ladder** (ambient → glance → card → system notification only for user-set reminders), **notification budget** (FR-96: once per kind per day, ≤4/day, ≥1 h apart, quiet hours).
Built this phase (Unverified): FR-90 forgiving routine "N/7", FR-92 copy check, FR-93 pet age + birthdays, FR-94 hello once a day, FR-96 budget.
Planned: FR-91 earned growth + unlocks (M13), FR-95 full backup incl. pets (M0), FR-97 friends-only study groups and recap card (P7, Supabase).
Study hours: **partly solved** (app/site time + categories built; study hours per subject, timetable and sharing planned in FR-58/FR-97).

---

## 2026-10-23 (afternoon)
- Built (Unverified): Import ZIP for pets (owner's Kayadu pack imports), Settings → Pet notifications (budget and quiet hours adjustable).
- Diagnosed, not fixed: pet-visibility bugs B1-B6 and similar S1-S4 — **next to fix after owner review**.
- Planned: FR-98 festival outfits · FR-99 weekly recap · FR-100 study groups · FR-101 leaderboard visibility Off/Friends/Everyone · FR-102 monthly pet drops · FR-103 photo to pet (`docs/features/FR-98-103-growth-plan.md`).
- Student pack preview (study hours per subject, timetable, friends) published for owner review before building FR-58; redesigned 2026-10-23 night, with a now-strip board (FR-88, spec draft `docs/features/FR-88-now-strip.md`, 4 open questions).
- OS parity: `docs/OS_PARITY.md`.

## 2026-10-23 (evening)
- Fixed (Unverified): pet-visibility bugs B1-B6 + S1.
- Built (Unverified): macOS Arc / Firefox / Safari (opt-in) for website time and open tabs (FR-104).
- Planned: FR-105 real pack animations (`docs/character/ANIMATION_PLAN.md`), FR-106 UI redesign pass (audit with screenshots first).
