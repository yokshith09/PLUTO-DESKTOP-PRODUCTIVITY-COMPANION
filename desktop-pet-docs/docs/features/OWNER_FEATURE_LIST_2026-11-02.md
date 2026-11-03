# Owner's feature list (2026-11-02): status, key points, blockers and fixes

The owner sent a 33-item feature list (titled "LOAF"; the app is named Pluto everywhere, and a rename is an open decision, D-NAME below). Each item is mapped to the plan here. Status is from the code on `main` at 589797e. "Built" always means **Unverified on a real PC**, never Complete.

Totals: 5 built · 7 partly built · 18 in the plan, not built · 3 new (added here as FR-113).
Owner decisions on 2026-11-02: **#11 Full-screen compatibility and Tab Tantrum: build both** (now FR-08 and FR-26, phase P4.5, before P5).

## 1. Platform, usage and growth

| # | Feature | Plan item | Status | Key points | Blocker → fix |
|---|---|---|---|---|---|
| 1 | Product analytics backend | FR-32 | Not built | Installs, active users, feature use; a dashboard for the owner | **Conflicts with the local-first rule** (DECISIONS: sending usage data out breaks it). Fix: owner changes the rule to "opt-in, anonymous, off by default" (D-TELEMETRY). Then: downloads from GitHub release counts (no app change needed, available today); in-app counts only after opt-in, through the P9 backend. |
| 2 | Feature announcements | FR-35 | Not built | "What's new" after an update; read from the bundled CHANGELOG, so no network | None. Can be built now: show the new version's CHANGELOG section once after an update. |
| 3 | Automatic updates | FR-36 | Not built | Check, download and install with rollback | Signing certificates (on hold). Fix: Tauri's updater has its own signing key (free, separate from Windows/Apple certificates), so check-and-install can be built now; SmartScreen/Gatekeeper warnings stay until the owner buys certificates. Needs the opt-in network layer to check GitHub. |
| 4 | Referrals and rewards | FR-04 | Not built | Code per user; unlock after 3 active installs | Backend (P9). Fix: Supabase is already chosen; needs accounts first. Must not count fake installs (FR-33 abuse prevention). |
| 5 | Graceful shutdown | FR-27 | Partly | Database closes on exit (`RunEvent::ExitRequested`) | Missing: the OS "shutting down" signal. Fix: Windows `WM_QUERYENDSESSION`/`WM_ENDSESSION`, macOS `NSWorkspaceWillPowerOffNotification`: end the tracking span and focus session, flush, exit. Small; no decision needed. |

## 2. Desktop experience and time tracking

| # | Feature | Plan item | Status | Key points | Blocker → fix |
|---|---|---|---|---|---|
| 6 | Websites vs apps separated | FR-24 | Built | Time page has Apps and Websites sections | None; owner test. |
| 7 | Resizable tiles | FR-22 | Partly | Normal / full width; a row shares its width equally (2026-11-02) | Free resizing not built. Fix: optional; decide in UI polish (U-5). |
| 8 | Reorderable tiles | FR-22 | Built | Drag by the grip; order saved | None. |
| 9 | Minimise/resize keeps the layout | FR-23 | Built | Rows keep order; only widths change | None; owner test. |
| 10 | Time tab improvements | FR-20, FR-21, FR-25 | Partly | General and Analytics views exist | Missing: a commit-style calendar grid (a square per day, darker = more time). Fix: add to U-6 (Time tab) with a preview; git commits from the watcher can feed it. |
| 11 | Full-screen compatibility | FR-26 | **Owner: build** | Pet, Tab Tantrum, Project Spaces and Focus stay usable in full screen | Was: the pet hides in full screen on purpose. Fix (no decision left): a setting "In full screen: Hide · Small in a corner · Stay" (default Small in a corner). Windows: keep the pet window topmost (works over borderless full screen; true exclusive full-screen games cannot be drawn over, stated plainly). macOS: `fullScreenAuxiliary` + all Spaces so the pet shows over full-screen apps. Focus shows as a small timer pill on the pet. |

## 3. Project Spaces and student productivity

| # | Feature | Plan item | Status | Key points | Blocker → fix |
|---|---|---|---|---|---|
| 12 | Project Spaces | FR-06/FR-53 | Built | Cards, project screen, folder, links and files, activity | None; owner test. |
| 13 | Project organiser (students) | FR-11 | Partly | Projects + courses and exams | Fix: a "Student" project template (FR-113) with assignment deadlines and a course link. |
| 14 | Study companion | FR-12 | Partly | Study page, Learn quiz | AI parts wait for P8 (D-AI). Without AI now: revision questions from your own note headings and checklists. |
| 15 | Secure credentials | FR-13 | Not built | Names, where used, rotation date; the secret stays in Windows Credential Manager / macOS Keychain, shown only after you confirm | Storage-policy decision (D-CRED). Fix recommended: references only plus OS keychain (`keyring` crate); Pluto never writes secrets to its own database or logs; clipboard cleared after 30 s. |
| 16 | Project setup assistant | FR-14 | Not built | Setup steps, required software, env-var **names**, run commands per project | None. Fix: a "Setup" tab in Project Spaces; run commands copy, never run by themselves. |
| 17 | Project-aware pet | FR-67, FR-03 | Not built | Pet knows the open project; shortcuts and reminders for it | Characters (P3) for a different pet per project. Fix: the context part (pet's menu shows the current project's links, Next up and "Open folder") needs no characters and can come first. |
| 18 | Group project tracker | FR-10, FR-97 | Not built | Shared tasks, roles, progress | Backend (P9). Interim without a server: export/import a project as a file to share. |
| 19 | Leaderboards | FR-101 | Not built | Contribution ranks | Backend (P9). Owner rule kept: friends only, opt-in, weekly reset, no public global board. |

## 4. Focus, learning and student utilities

| # | Feature | Plan item | Status | Key points | Blocker → fix |
|---|---|---|---|---|---|
| 20 | Focus sessions (Pomodoro) | FR-05 | Built | Timer, length, task link | None; owner test. |
| 21 | Prompt improvement | M5 / FR-07 | Not built | Better prompts using project context | AI provider (D-AI). Fix without a provider: MCP prompts already let Claude/Cursor do it with Pluto's context (built). |
| 22 | Presentation practice | FR-15 | Not built | Timer, practice log, likely questions | Voice (P6) for listening. Fix: timer + practice log + slide timing can come first without voice. |
| 23 | Coding error translator | FR-16 | Not built | Plain-language error, cause, fix, how to verify | AI (D-AI). Interim: through a connected assistant (MCP), already possible. |

## 5. Desktop utilities

| # | Feature | Plan item | Status | Key points | Blocker → fix |
|---|---|---|---|---|---|
| 24 | QR code scanner | FR-17 | Not built | Image, screen capture, webcam; preview link before opening | Camera/screen permission policy. Fix: start with an image file and a screen region (no camera); camera later, asked each time. |
| 25 | Notification triage | FR-18 | Not built | Group other apps' notifications by importance, snooze | OS access differs: Windows has a notification listener API (needs the user's permission); macOS has no public API. Fix: Windows first, macOS stated as not possible. |
| 26 | One-click workspace launcher | FR-72 (P5) | Not built | Apps, folders, sites, terminals together | None. Fix: "Open everything" on a Project Space (its folder and links), then saved launch sets. |

## 6. AI

| # | Feature | Plan item | Status | Key points | Blocker → fix |
|---|---|---|---|---|---|
| 27 | Local AI (Ollama) | FR-28 (P8) | Not built | Private, offline | D-AI. Recommended: Ollama if installed, else a small bundled model; 1-day spike first. |
| 28 | Cloud AI fallback | FR-29 | Not built | Bigger model when needed | D-AI and the owner rule "we never pay": bring-your-own-key only, opt-in, the text that leaves is shown first. |
| 29 | Computer-use assistant | FR-30 | Not built | Multi-step actions with approval | Safety design (D-COMPUTER). Fix: reuse the MCP "Allow on the pet" pattern; every action confirmed; read-only first. Last in the AI phase. |

## 7. Ecosystem (new: FR-113 project templates)

| # | Feature | Plan item | Status | Key points | Blocker → fix |
|---|---|---|---|---|---|
| 30 | Developer workspaces | FR-06 + P4 | Partly | Folder, commits and pushes, assistants | Missing: env-var references (FR-13/14), build status (needs a build hook), CI (network layer). |
| 31 | Research workspaces | **FR-113 (new)** | Not built | Papers (PDF links), citations, experiments, datasets | None. A template of Project Spaces: tabs Papers, Experiments, Data; citation copy (BibTeX) from the paper's link. |
| 32 | Freelancer workspaces | **FR-113 (new)** | Not built | Clients, contacts, deadlines, invoices due | None for the local part; client credentials go through FR-13. |
| 33 | Personal workspaces | **FR-113 (new)** | Not built | Home, documents, accounts, renewals | None. |

**FR-113 Project templates (new, 2026-11-02).** One Project Spaces page, with a template chosen when a project is made: Developer · Student · Research · Freelance · Personal. A template only sets which tabs and fields show first; any project can use any tab. This avoids five copies of the same page. Needs a preview before code.

## Added 2026-11-02 (owner)

**FR-114 Routine tracker (new).** Day-to-day progress of the daily routine: how many routines you follow, how many you did each day, and how you are doing over time.
- What exists: the Daily routine tile keeps 60 days of which habits were ticked (`ui.routine.history`) and shows "x/7" per habit.
- Missing data (fix): the history does not record which habits you had on each day. Add `history[day] = { planned: ids + titles, done: ids }` from the next rollover; older days show only what was done, marked as such.
- **Hover (owner 2026-11-03):** each day's square, on hover or keyboard focus, shows that day's planned habits with a tick or not for each, and the count ("4 of 6 done").
- Screen (preview first): a Routine page or a tab on the tile's expand: a calendar grid (square per day, darker = more done), this week vs last week, each habit's 30-day rate, best and current run (shown as "5 of the last 7 days", not a guilt streak, FR-90), and the days you missed with no red alarms. Keep 365 days instead of 60.
- Plan: U-8 in the UI polish batch, after U-6 (same calendar grid component).

## Open decisions (owner)

| ID | Decision | Unblocks | Recommendation |
|---|---|---|---|
| D-NAME | **Decided: stays Pluto** | — | — |
| D-TELEMETRY | **Decided: build usage counts; data may be sent** (owner overrides the local-first rule) | #1 | Kept advice: say so in the installer and Settings, send counts and feature names only (never titles, notes, sites or paths), and give an off switch. Indian DPDP Act and EU GDPR users need a notice; without one, antivirus and reviewers flag "phones home". |
| D-AI | **Decided: later**, when P8 starts | #14, #21, #23, #27, #28 | — |
| D-CRED | **Decided: users keep their own keys in a file on their PC.** Pluto publishes the file format; the user saves the file locally and links its path in the project. | #15, #16, #30, #32 | Format: `.env`-style `NAME=value` lines plus `# rotate: 2027-01-01` comments. Pluto reads names and dates, shows values masked, reveals one only on click and confirm, never copies values into its database or logs. Warns if the file is inside a git folder without a `.gitignore` entry, or in a synced folder (OneDrive, iCloud, Dropbox). |
| D-COMPUTER | **Decided: last** (end of P8) | #29 | — |
| Certificates | **Decided: on hold** | Warning-free #3 | Updater can still use Tauri's own free signing key |
