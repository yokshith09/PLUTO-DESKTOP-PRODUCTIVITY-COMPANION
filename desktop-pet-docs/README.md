# Pluto

**Small companion. Big universe.**

A lightweight, local-first desktop companion for Windows and macOS: notes, tasks, meetings and an automatic daily work log, with a desktop pet that lives alongside your work.

**Where things stand:** [`PROJECT_STATUS.md`](PROJECT_STATUS.md) (evidence, defects, next actions) · [`ROADMAP.md`](ROADMAP.md) (milestones) · [`DECISIONS.md`](DECISIONS.md) · [`CHANGELOG.md`](CHANGELOG.md). Start with the status file.

**Status:** 🔒 **D0–D7 locked** (2026-10-03). The app is built and running in CI on Windows and macOS: core logic, notes, tasks, reminders, time tracking and the dashboard exist. **Active work (2026-10-23): FM-V2 fix pack + companion features, per [`MASTER_PLAN.md`](MASTER_PLAN.md).** M1-M3 are code-complete; the owner reports they work in v2.0.0 (written test results still pending). See [`PROJECT_STATUS.md`](PROJECT_STATUS.md) for what works, what is unverified and what is missing.

## Non-negotiables
Event-driven (no polling) · Idle CPU <1% · RAM <100 MB · Local-first SQLite · Pet present from v1 · Windows + macOS parity

## Documentation map (read top to bottom)

```
desktop-pet-docs/
├── MASTER_PLAN.md            ← START HERE: phases, milestones, every feature with "done when"
├── MCP_PLAN.md               ← P4 in full: MCP server, tools, safeguards, hooks, tests, open questions
├── PROJECT_STATUS.md         ← what is built, tested, unverified (evidence)
├── DECISIONS.md              ← every owner decision, dated
├── CHANGELOG.md              ← what changed
├── ROADMAP.md                ← milestone table M0-M13 (detail behind MASTER_PLAN)
├── FEATURE_ROADMAP.md        ← every FR-xx in one table, tests, release gates
├── RELEASE_0.2.0_TEST.md     ← owner's Windows test checklist (v2.0.0)
├── TESTS_NEW_FEATURES.md     ← tests for everything built after v2.0.0 (automated + manual)
└── docs/
    ├── BLOCKERS_AND_OPTIONS.md   ← every blocker, options, recommendation
    ├── BUG_REPORT_2026-10-23_pet_visibility.md ← pet not coming back: causes + fixes
    ├── OS_PARITY.md              ← what works on Windows / macOS / Linux
    ├── V2_ISSUES.md              ← owner's V2 bug list → features
    ├── features/                 ← full specs (13 sections each)
    │   ├── F0-*                  foundation (built)
    │   ├── FR-requested-features.md   FR-01…FR-38
    │   ├── FR-v2-features.md          FR-41…FR-58
    │   ├── FR-openpets-parity.md      FR-59…FR-82
    │   ├── FR-83-role-profiles.md     role-based defaults
    │   ├── FR-84-87-owner-requests.md community server, routine, diary, reactions
    │   ├── FR-88-now-strip.md         now strip spec draft + student-pack preview notes
    │   ├── FR-92-97-companion-principles.md  no-guilt, attention ladder, budget, birthdays, backup
    │   ├── FR-106-110-task-upgrades.md task links, stars, days, repeat, focus timer
    │   └── FR-98-103-growth-plan.md   festival outfits, recap, groups, leaderboard, drops, photo-to-pet
    ├── character/                ← character, emote, Studio, art spec, animation plan
    ├── competitors/              ← OpenPets research
    ├── business/                 ← market + social research, direction, GTM sheet, money
    ├── 00-product … 06-plan/     ← locked founding documents (product, principles, PRD, TRD, design, schema, plan)
    ├── learning/                 ← notes
    └── archive/                  ← superseded, kept for history
```

## Founding documents (locked)

| ID | Document | Path | Status |
|----|----------|------|--------|
| D0 | Product Document | [`docs/00-product/product-document.md`](docs/00-product/product-document.md) | 🔒 Locked · amended D0-A1 |
| D1 | Build Principles (00–11) | [`docs/01-build-principles/`](docs/01-build-principles/README.md) | 🔒 9 locked · ⏸ 3 on hold |
| D2 | PRD | [`docs/02-prd/PRD.md`](docs/02-prd/PRD.md) | 🔒 Locked 2026-10-03 |
| D3 | TRD | [`docs/03-trd/TRD.md`](docs/03-trd/TRD.md) | 🔒 Locked 2026-10-03 |
| D4 | App Flow | [`docs/04-design/app-flow.md`](docs/04-design/app-flow.md) | 🔒 Locked 2026-10-03 |
| D5 | UI/UX Design Brief | [`docs/04-design/ui-ux-brief.md`](docs/04-design/ui-ux-brief.md) | 🔒 Locked 2026-10-03 |
| D6 | Backend Schema + migration 001 | [`docs/05-backend/`](docs/05-backend/backend-schema.md) | 🔒 Locked 2026-10-03 |
| D7 | Implementation Plan | [`docs/06-plan/implementation-plan.md`](docs/06-plan/implementation-plan.md) | 🔒 Locked 2026-10-03 |
| — | Feature roadmap (requested-feature inventory, test matrix, release gates) | [`FEATURE_ROADMAP.md`](FEATURE_ROADMAP.md) | Proposal, awaiting owner review |

## Decision log
| Date | Decision |
|------|----------|
| 2026-10-03 | PRD §9 decisions **D-1 … D-10 approved**; D2–D7 locked |
| 2026-10-03 | **ADR-014** accepted, then **superseded by ADR-017** — global search removed (no FTS5, overlay, or V-4) |
| 2026-10-03 | **ADR-018** — V-2 (RAM) measured early on CI runners in F0-02 |
| 2026-10-03 | **D0-A2 / ADR-015** — owner set phase order: Pet 3 → Developer 4 → MCP 5 (+ client scaffold, OAuth) → Voice 6 → Characters 7 |
| 2026-10-03 | **D0-A3 / ADR-016** — CI status built after MCP as Phase 5.1; Phase 4 is local git/build only and offline |
| 2026-10-03 | **D6-A1** — four schema corrections (migration transaction ownership, no `DELETED` task event, Unicode label folding, ADR-014 reference) |

A full account of the consistency review that preceded the lock is in
[`docs/01-build-principles/README.md`](docs/01-build-principles/README.md#cross-document-consistency-review-2026-10-03).

## Open before CP1 starts
Nothing blocking. The first unresolved questions are the Phase 0 verification
tasks **V-1 … V-5** (`docs/01-build-principles/07-architecture-decisions.md`),
measured in `F0-01` and `F0-12`. **V-2 (total RAM <100 MB)** is the one that can
force a new ADR before CP2.

## Milestones
`D0–D7 docs` → **CP1** Foundation + verification → CP2 Notes → CP3 Tasks + Daily Log → CP4 Meetings, Pet, Today → **CP5 v1.0.0** → M3 Capture/privacy → M4 Quick Actions → M5 Writing assistant → M6 Pet (cont.) → M7 Meeting-to-action → M8 Focus & wellbeing → M9 Voice → M10 MCP → M11 Privacy-radar report → M12 Developer → M13 Characters

Full detail and current status: [`ROADMAP.md`](ROADMAP.md) (redesigned 2026-10-13 around the owner's new feature list; this is just the one-line chain).

## Repository layout
```
docs/
├── 00-product/         D0 product document
├── 01-build-principles/ D1 build principles (00–11 + index)
├── 02-prd/             D2 product requirements
├── 03-trd/             D3 technical requirements
├── 04-design/          D4 app flow, D5 UI/UX brief
├── 05-backend/         D6 schema + migrations/
└── 06-plan/            D7 implementation plan
```
Application code (`src-tauri/`, `src/`) arrives with CP1.
