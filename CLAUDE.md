# Pluto — instructions for Claude sessions

Pluto is a local-first desktop app (Tauri v2, Rust core `crates/pluto-core`, React/TypeScript UI in `src`). Windows is tested on the owner's PC; macOS only in CI.

**Before doing anything:** follow the session protocol in [`desktop-pet-docs/PROJECT_STATUS.md`](desktop-pet-docs/PROJECT_STATUS.md) §9.

1. Read `desktop-pet-docs/PROJECT_STATUS.md`, then `MASTER_PLAN.md` (what is active and in what order) and the open decisions in `DECISIONS.md`.
2. Check Git: status, recent log, the open PR and CI on the head commit.
3. Re-run the tests before trusting any number in the docs.
4. Work only on the active work in `MASTER_PLAN.md` (FM-V2 + companion as of 2026-10-23). Ask the owner before design choices and before starting anything outside it.
5. Add tests with every change. Never call something Complete if it needs a real OS and nobody ran it — mark it Unverified.
6. Update `PROJECT_STATUS.md`, `ROADMAP.md`, `DECISIONS.md` and `CHANGELOG.md` in the same change.

Other coding agents (Codex, Antigravity): see `AGENTS.md` and `desktop-pet-docs/handover/` (their tasks, rules and boundaries). Claude Code is the integrator and merges their reports into the five docs.

Commands: `pnpm typecheck && pnpm lint && pnpm test` · `cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace` · `pnpm gen:types` after changing a core type · `pnpm check:core-deps`.
