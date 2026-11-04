# Pluto — instructions for coding agents other than Claude Code (Codex, Antigravity, others)

Pluto is a local-first desktop app (Tauri v2, Rust core `crates/pluto-core`, shell `src-tauri`, React/TypeScript UI `src`). The owner tests on Windows; macOS only in CI.

**You were handed a specific task. Do only that task.** Everything you need is in `desktop-pet-docs/handover/`:

1. Read `desktop-pet-docs/handover/README.md` (rules, boundaries, workflow, definition of done). It is binding.
2. Read your task's brief (`A-3.md`, `A-7.md`, `A-2.md` or `A-5.md`). Anything the brief does not list is out of scope.
3. Also read `CLAUDE.md` (the owner's protocol) and the section of `desktop-pet-docs/MASTER_PLAN.md` named "Assistant ideas".

Hard rules in one place: work on your own branch (never `main`); open a **draft** pull request and never merge it; never release, tag or change the version (stays 0.5.9); the name stays Pluto; no new dependency, setting, database migration or screen that the brief does not name; add tests with every change; mark anything that needs a real OS and was not run on it as **Unverified**. If the brief leaves a design choice open, stop that task and write the question in the pull request. Do not guess and do not wait for an answer: the owner is away.
