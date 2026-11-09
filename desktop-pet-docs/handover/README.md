# Handover to other coding agents

**Current round (2026-11-09), for any agent (Kimi, Codex, others):** tasks [K-1 Timetable](K-1.md), [K-2 Exams, notes, tasks](K-2.md), [K-3 Class reminders](K-3.md) — in this order, one agent — and [K-4 Deterministic tests](K-4.md), independent, can run in parallel on another agent. Branch names `<agent>/<id>` (for example `kimi/k-1`). The rules below apply unchanged; where they say "Codex or Antigravity" read "any agent". Rule 9 (do not edit the Assistants page) still applies. Rule 4: K-1 is allowed exactly one migration (013) and one dependency (`calamine`); K-1 and K-2 may add the prefs keys their briefs name.

**Not handed over this round:** Course page (waits for an outside design: `../design/COURSE_PAGE_BRIEF.md`), routine tracker redesign (no look chosen), A-8 sounds (design choice), FS-1 / TT-1 (preview first), Windsurf reactions (owner's PC), Friends (P9, on hold), the release.

---

# Handover to Codex and Antigravity (2026-11-04)

The owner is away for a while and asked that part of the remaining work be built by other agents. This file is the contract. Claude Code (the session that wrote it) stays the integrator: it reviews, merges and does the docs merge. **Nobody releases.**

## Who builds what

| Agent | Tasks, in this order | Why this split |
|---|---|---|
| **Codex** | [A-3](A-3.md) "Finished while you were away", then [A-7](A-7.md) "Still working" | Both are Rust-first (pure logic in the core, a small shell loop), tests are mostly unit tests, almost no UI. |
| **Antigravity** | [A-2](A-2.md) "Chats in Project Activity", then [A-5](A-5.md) "Your day with assistants" | A-2 stores chat events and shows them in an existing list; A-5 reads those events for one evening line. A-5 needs A-2, so one agent does both, in order. |

The two agents work in parallel on separate branches. They touch different files (see each brief's **Boundaries**). The only shared file is the `Host` trait in `crates/pluto-core/src/mcp/mod.rs`: each adds its own method with a different name (A-3 `finished`, A-7 `working`, A-2 `chat_event`) in a separate block. If a rebase conflicts there, keep both.

## Not handed over (and why)

| Item | Why not |
|---|---|
| FS-1 full-screen compatibility, TT-1 Tab Tantrum | They need a **preview approved by the owner** first (CLAUDE.md: ask before design choices) and they are OS-heavy. |
| A-8 different sound per reaction | Needs a design choice: which sounds, bundled files or generated tones, where the setting lives. Owner to decide. |
| Study screens (timetable import, course page, weekly report, Friends tab) | ON HOLD: the owner did not like the screens. |
| Windsurf pet reactions | The hook format has to be checked on the owner's PC. |
| v0.6.0 release | Only on the owner's word; the owner presses "Run workflow". |
| U-6 commit dots, U-7 Exams/Questions/Hours tabs | Left out on purpose; need stored data or new screens. |

## Rules for every task

1. **Branch and PR.** Branch `codex/<id>` or `antigravity/<id>` (for example `codex/a-3`), created from the latest `main`. Push only that branch. Open a **draft** pull request titled `<ID>: <name>`. Never merge it, never push to `main`, never force-push `main`, never rewrite someone else's branch.
2. **No release.** No version bump (stays 0.5.9), no tag, no workflow dispatch, no changes to `.github/workflows`, `tauri.conf.json`, `Cargo.toml` package version, or `package.json` version. The product name stays **Pluto**.
3. **Scope.** Do exactly what the brief lists. The brief's **Must not** list is a hard limit. No refactors, renames, formatting sweeps or "while I am here" fixes in files you do not need.
4. **No new dependencies** (Cargo or npm), **no new settings keys, no database migrations, no new screens or pages, no new Tauri permissions/capabilities**, unless the brief names them. Store small state in existing preferences (`prefs`) as the brief says.
5. **Privacy and local-first.** No network calls, no telemetry. Never read or send notes, diary text, task text or a chat transcript beyond what the existing hook code already reads. Assistant chats are shown only by assistant name, folder name and the first-request text the hook already provides. The diary is never touched.
6. **Look and wording.** Reuse existing components and tokens (Tailwind classes, `Button`, the Periwinkle theme variables). Do not hard-code colours. Words are short and kind; no guilt wording (see `src/lib/noGuilt.test.ts`). If a brief gives the exact text, use it exactly.
7. **Tests with every change.** Unit tests for pure logic, component tests for UI you touch. Existing tests must keep passing. A change with no test is not done.
8. **Unverified.** Anything that needs a real OS or a real assistant (Windows, macOS, Claude Code hooks) and that you could not run there is **Unverified** in every doc line and in the PR. Never write "works" for it.
9. **Assistants page.** Do not edit `src/features/assistants/AssistantsPage.tsx` or its test: the "Coming" list (`SOON`) and the per-assistant reaction chips (`PET_REACTS`) are shared by every task, so Claude Code updates them once when merging. Say in your report which `SOON` item your task completes (A-3 "Finished while you were away", A-7 "Still working", A-2 "Chats in your projects", A-5 "Your day with assistants") and what chip to add.
10. **Docs.** Do **not** edit `CHANGELOG.md`, `PROJECT_STATUS.md`, `ROADMAP.md`, `DECISIONS.md` or `MASTER_PLAN.md` (two agents editing the same lines would conflict every time). Instead create `desktop-pet-docs/handover/reports/<ID>.md` with: what you built (plain words, for a non-programmer), the exact CHANGELOG line to add, the exact PROJECT_STATUS / ROADMAP / DECISIONS lines to add, test counts before and after, what is Unverified, what you left out and why. Claude Code copies these into the five docs when it merges. You may edit your own brief if you find it wrong, and say so in the report.
11. **Stuck or unsure.** If something in the brief is impossible, contradictory or leaves a design choice open: stop that task, write the question at the top of the PR description and in the report under "Questions for the owner", and go on to your next task. Do not guess. Do not wait.
12. **Commits.** Small commits starting with the id (`A-3: pure away tracker with tests`). Do not add co-author trailers naming a person.

## Commands (all must pass before the PR is marked ready)

```
pnpm typecheck && pnpm lint && pnpm test
cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
cargo clippy --workspace --all-targets --target x86_64-pc-windows-gnu -- -D warnings
pnpm check:core-deps
pnpm gen:types        # only if you changed a core type that is exported to TypeScript; commit the result
```

`pnpm check:core-deps` enforces that `crates/pluto-core` never depends on Tauri. Pure logic goes in the core; anything that touches the OS, windows or Tauri goes in `src-tauri`. One Rust test, `usage_collector::tests::a_film_or_a_call_with_no_input_keeps_counting`, is timing-sensitive and can fail when the machine is busy; run it alone before calling it broken, and report it rather than editing it.

## Definition of done (per task)

- Every item under **Acceptance** in the brief is true and covered by a test where possible.
- All commands above pass.
- Nothing under **Must not** was done.
- The report file exists and is honest about what is Unverified and what was left out.
- The draft PR description says: what changed, how to try it by hand on Windows, what is Unverified.

## How the pieces fit (read once)

- A hook (`Pluto --react <reaction> --assistant <id>`) runs inside the assistant. It sends one line to the running Pluto over a private pipe: `PLUTO1R <token> <id> <reaction> [place] [w=<window>]`. Code: `crates/pluto-core/src/mcp/link.rs`, `hookctx.rs`; shell side `src-tauri/src/mcp.rs`.
- Reactions are listed in `REACTIONS` in `crates/pluto-core/src/mcp/mod.rs`: `agent_done`, `agent_needs_you`, `agent_permission`, `agent_resumed` (silent: you replied), `agent_error`, `git_*`, `build_*`. `PlutoMcp::react_once_at` handles each hook and calls the `Host` trait, which the shell implements as `ShellHost` in `src-tauri/src/mcp.rs`.
- The "place" text is `folder · “first request”` where the folder is only the **last part** of the chat's path (`DESKTOP-PET`), never the whole path.
- Chats waiting for you are kept by `WaitList` (`mcp/waiting.rs`, A-1). A chat is one assistant in one folder.
- A bubble on the pet is an emitted `pet://say` event (`show_on_pet`). `Guard` holds messages while a focus session runs. The pet window is separate from the dashboard (`src/pet/`).
- Preferences are key/value JSON in the local database, read and written with `SettingsService::get_pref` / `set_pref` (shell) and `ipc.prefsGet` / `ipc.prefsSet` (UI).
- Windows idle time: `crate::tracking::win::idle_ms()`; macOS: `crate::tracking::mac::idle_ms()` (check the exact paths in `src-tauri/src/tracking.rs`).
