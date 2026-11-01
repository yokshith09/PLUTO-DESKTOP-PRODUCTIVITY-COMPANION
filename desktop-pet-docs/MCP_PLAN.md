# MCP plan — Pluto talks to your AI assistants (P4)

*Written 2026-11-01 at the owner's request: "document what to build and what is what, everything, all features we talked about, no code yet". Nothing in this file is built. Confidence tags: [Certain] checked in a source or in our code, [Likely] strong inference, [Guessing] needs checking. Decisions already made by the owner are marked **(owner)** with the date; everything else is a proposal and is listed again in §15 for the owner to confirm.*

---

## 1. In plain words

**MCP** (Model Context Protocol) is the standard way AI assistants (Claude Code, Claude Desktop, Cursor, Codex, ChatGPT desktop and others) use tools on your computer. With it:

- **The pet reacts to your assistants:** "Claude finished", "Claude needs you", "build failed", "pushed", shown by the pet over whatever app you are in.
- **An assistant can read your Pluto:** "what are my tasks today?", "summarise my notes on X", "how long was I in VS Code this week?". Everything except the diary.
- **An assistant can change your Pluto:** "add a task to review PR 12 tomorrow", "mark the report done", "turn these meeting notes into tasks". With safeguards: deletes go to the Bin, it can never empty the Bin, each assistant has an off switch, and there is a list of everything it changed.

All of it is **local**: the assistant must be running on the same PC, Pluto must be running, and nothing is sent over the network by Pluto. **Off by default.**

What it is **not**: Pluto does not run an AI model, does not call any AI service and does not need an API key. The assistant you already use is the brain; Pluto is the tools and the pet.

---

## 2. Boundaries (non-negotiable for every step)

| # | Boundary | Where it comes from |
|---|---|---|
| B1 | **No network port is ever opened.** The assistant talks to a bridge over stdio; the bridge talks to Pluto over a named pipe (Windows) or a Unix socket (macOS), with a per-run token. | Approved shape 2026-10-22 (owner); bridge option 1 2026-10-31 (owner) |
| B2 | **No network code in P4's local part.** CI reactions, calendar feeds and connectors wait for the separate network layer. | Owner 2026-10-31 ("local first"); E1 |
| B3 | **The diary is never readable or writable** through MCP, not even its existence, dates or count. | Owner 2026-10-31 |
| B4 | **Deletes go to the Bin.** An assistant can never empty the Bin, purge an item, delete all data, import or export data, or delete tracked time. | Owner 2026-10-31 (E2 safeguards) |
| B5 | **An assistant can never change its own permissions** or any MCP or privacy setting (the master switch, an assistant's switch, what is excluded, tracking on/off). Otherwise every safeguard is one tool call away from being turned off. | Claude's addition to E2, for the owner to confirm (§15 Q1) |
| B6 | **Off by default.** One master switch on the MCP page. Switching it off closes the pipe at once. | FR-54, approved shape |
| B7 | **Rate limit: 10 calls per minute per tool per assistant** to start; extra calls are refused with a clear error, not queued. | Owner 2026-10-31 |
| B8 | **`pluto-core` stays free of Tauri and network crates** (`pnpm check:core-deps`). The protocol, tools and rules live in `pluto-core`; the pipe and the bridge live in the shell. | Build principles |
| B9 | **Window titles are never stored or returned.** Time data is program names and website domains only, as today. | ADR-019 |
| B10 | **Releases only on the owner's word.** No version bump, draft or tag without an explicit request. | Owner 2026-11-01 |
| B11 | **Anything that needs a real OS is Unverified** until the owner has run it (Windows on the owner's PC; macOS in CI only). | CLAUDE.md |

---

## 3. The pieces and how they connect

```
 AI assistant (Claude Code, Cursor, ...)
      │  starts, as a child process, with stdin/stdout piped:
      ▼
 Pluto.exe --mcp-bridge --assistant <id>          ← same program file as the app (owner option 1)
      │  reads the token file, connects to the pipe, forwards each JSON-RPC line both ways
      ▼
 \\.\pipe\pluto-mcp-<user>   (Windows)   or   <data folder>/mcp.sock  (macOS)
      │  first line must be the token and the assistant id; anything else is dropped
      ▼
 Running Pluto: shell `mcp_pipe` (accepts, checks the token, one task per connection)
      │  hands each message to
      ▼
 pluto-core `mcp`: protocol  →  policy (switches, diary, Bin, limits, focus)  →  tools  →  existing services
      │                                                                     │
      │                                                                     └→ change list + request log (database)
      └→ pet events (react, say) through the existing event bus, shown by the pet window
```

The same pipe also serves two command-line flags used by hooks and builds (P4.2, P4.3b):

- `Pluto.exe --react <reaction>` (for example `agent_done`): sends one reaction and exits within a fraction of a second, **always with exit code 0**, so it can never break the assistant that called it.
- `Pluto.exe --run -- <command>`: runs your command, passes its output through untouched, reacts to its exit code and returns the same exit code.

### 3.1 The bridge (`--mcp-bridge`)

- **Handled in `main` before Tauri starts.** [Certain] Today `main` calls `pluto_lib::run()` at once, and the single-instance plugin hands any second launch to the running copy and exits. The bridge flags must be read first and must never start a window, the tray or tracking.
- **The console problem.** [Certain] The release build is a Windows "windowed" program (`windows_subsystem = "windows"`), so it has no console. [Likely] A windowed program still gets the stdin and stdout pipes its parent gives it, which is all MCP over stdio needs, and no black window flashes. **This must be proven by a first spike** on Windows CI and on the owner's PC with a real assistant. If it fails, the fallback is a tiny console helper shipped inside the installer (`pluto-mcp.exe`), which changes the owner's option 1, so it would come back to the owner first.
- **When Pluto is not running:** the bridge still answers discovery and the tools list, so the assistant shows Pluto's tools, and every tool call returns the plain error "Pluto is not running. Open Pluto and try again." It does not start Pluto itself (proposal, §15 Q3).
- **Version:** the bridge and the app are the same file, so they can never be out of step (the reason for option 1).
- **Paths:** the generated config names the installed program: `C:\Users\<you>\AppData\Local\Pluto\Pluto.exe` (Windows, per-user install) or `/Applications/Pluto.app/Contents/MacOS/Pluto` (macOS). Pluto writes the exact path for you on the MCP page; nobody types it. [Likely] the per-user path; it is read from the running program at the time, not guessed.

### 3.2 The pipe and the token

- **Windows:** a named pipe whose name includes the user, created with an access list that allows **only the current user**. **macOS:** a Unix socket in Pluto's data folder, permissions `0600` (owner only), folder `0700`.
- **Per-run token:** 32 random bytes made when Pluto starts (or when the switch is turned on), written to `mcp-token` in the data folder, readable by the user only, deleted when Pluto quits or the switch goes off. The bridge reads it and sends it as the first line. A wrong or missing token closes the connection, and the request log records the refusal.
- **What this protects against, plainly:** other user accounts on the PC; websites (no port, so a web page cannot reach it); and stale connections after Pluto restarts (new token each run). **What it does not protect against:** a program already running as you, which can read your files anyway. [Certain] This is true of every local tool and is the same level as Pluto's database file itself.
- **Several assistants at once:** yes, one connection each, handled in parallel; the database calls are already serialised by the services.

### 3.3 Knowing which assistant is calling

The assistant's own name in the protocol (`clientInfo`) is whatever it says, so it is shown but not trusted. Instead:

- Each assistant is **added on the MCP page** ("Add assistant → Claude Code"). Pluto gives it an id and generates its config line with `--assistant <id>`.
- The pipe accepts only ids that exist and are switched on. An unknown id is refused and shown on the MCP page as "An unknown assistant tried to connect" with a button to add it.
- Per assistant: on/off, last seen, what it may do (§6), its own change list and log.

---

## 4. Protocol

- **Versions** [Certain, checked 2026-11-01]: the current MCP specification is **2026-07-28**, which removed the start-up handshake (`initialize`) and sessions; every request carries its version in `_meta`, and servers **must** answer `server/discover`. The previous version, **2025-11-25**, still uses `initialize`. Assistants on the market will speak either for a while [Likely], so Pluto supports **both**: `server/discover` and per-request version for 2026-07-28; `initialize` / `notifications/initialized` for 2025-11-25 (and 2025-06-18 if a tested assistant needs it). An unsupported version gets the specification's `UnsupportedProtocolVersionError`.
- **Methods Pluto implements:** `server/discover`, `initialize` (older clients), `tools/list`, `tools/call`. That is all Pluto needs. No resources, prompts, sampling, roots, logging or tasks extension in P4 (they add surface without a use here).
- **Tools list:** deterministic order; `ttlMs` and `cacheScope: "private"` on the result (required in 2026-07-28); the list only contains tools the calling assistant is allowed to use, so a read-only assistant never even sees write tools.
- **Tool results:** a short human-readable text plus `structuredContent` (JSON matching an `outputSchema`), so assistants can both show and use the result. Every result carries `resultType: "complete"` for 2026-07-28 clients.
- **Errors:** a tool that is refused (diary, rate limit, switched off, Pluto not running, not found, invalid input) returns a tool result with `isError: true` and one plain sentence saying why and what to do. Protocol errors (bad JSON, unknown method) use the JSON-RPC codes.
- **Limits:** one message at most 1 MB; lists return at most 50 items with a `cursor` for the next page; note bodies in lists are cut to 300 characters (`note_get` gives the full text).
- **Implementation choice (§15 Q2):** a small hand-written JSON-RPC layer in `pluto-core` (Claude's recommendation: four methods, no new dependency, every byte tested, easy to follow the 2026 change) versus the official Rust SDK `rmcp` (less code, but a large new dependency whose support for 2026-07-28 must be checked) [Guessing on its current version support].

---

## 5. Tools (the full catalogue)

Names are plain and grouped; the assistant shows them under "pluto". Each maps to a service that already exists and is already tested (the right-hand column), so MCP adds rules and shapes, not new business logic.

### 5.1 Pet (P4.1a)

| Tool | What it does | Built on |
|---|---|---|
| `status` | What Pluto is doing now: the focus session (kind, time left), the app in front, today's counts (tasks done, open, overdue), whether the pet is visible or asleep. No titles, no note text. | `focus_current`, `tracking_status`, `daily_log_get` |
| `react` | Play a named reaction (§8), for example `agent_done`. Unknown names are refused with the list of valid ones. | pet event bus (`pet-say`) |
| `say` | A bubble with up to 140 characters of plain text, optional pose. During a focus session it shows as the bubble or as a silent badge, by the setting (owner 2026-10-31). | pet event bus |

### 5.2 Read (P4.1b): everything except the diary (owner 2026-10-31)

| Tool | What it returns | Built on |
|---|---|---|
| `tasks_list` | Tasks with filters: status, due range, project, course, label, starred, text; paged. | `tasks_query` |
| `task_get` | One task with next step, links, plan days, history. | `task_get`, `task_history` |
| `notes_search` | Notes matching text, label, project, course; pinned and archived flags; body cut to 300 characters. | `notes_list`, `notes_search` |
| `note_get` | One note in full (Markdown). | `note_get` |
| `reminders_list` | Reminders, done or not, in a date range. | `reminders_list` |
| `meetings_list`, `meeting_get` | Meetings with notes, participants and action items. | `meetings_list`, `meeting_get` |
| `projects_list` | Projects with counts of open tasks and notes. | tasks and notes by project |
| `labels_list` | Labels. | `labels_list` |
| `courses_list`, `exams_list` | Student pack: courses and upcoming exams (only when the student pack is on). | `courses_list`, `exams_from` |
| `today` | Today at a glance: what the Today page shows (due, overdue, starred, reminders, focus minutes). | `daily_log_get` |
| `time_summary` | Time per app and per website domain for a day or a range; totals only, no window titles (B9). | `usage_summary` |
| `focus_history` | Focus sessions and minutes, per task if linked. | `focus_task_total`, daily log |
| `weekly_report` | The student weekly report (student pack only). | `weekly_report` |
| `links_list` | Saved links. | links |
| `bin_list` | What is in the Bin (so an assistant can restore what it deleted). | `bin_list`, `tasks_binned` |

**Not readable:** the diary (B3); settings that hold paths or privacy rules beyond what `status` says; the change list of *other* assistants (each sees only its own).

### 5.3 Write (P4.1c): full write except the diary, with the safeguards (owner 2026-10-31)

| Tool | What it does | Built on |
|---|---|---|
| `task_create` | New task: title, next step, due date, priority, project, course, labels, links, star. Quick-add text also accepted ("Review PR tomorrow !high"). | `task_quick_add`, `task_update` |
| `task_update` | Change any field of a task. | `task_update`, `task_set_links`, `task_star`, `task_set_plan` |
| `task_set_status` | Start, pause, complete, reopen; for a repeating task, tick today. | `task_transition`, `task_tick` |
| `task_defer` | Move to another day. | `task_defer` |
| `task_delete` | **To the Bin**, restorable. | `task_delete` |
| `note_create`, `note_update` | Create or edit a note (Markdown), its labels, project, course, pin, archive. | `note_create`, `note_update`, `note_set_pinned`, `note_set_archived` |
| `note_delete` | **To the Bin**. | `note_delete` |
| `reminder_create`, `reminder_update`, `reminder_set_done`, `reminder_delete` | Reminders, including lead time and sound. Delete: proposal, to the Bin like tasks (§15 Q4; today reminders delete directly). | reminders |
| `meeting_create`, `meeting_update`, `action_item_to_task` | Meetings and turning action items into tasks. Meeting delete: to the Bin (same question as reminders). | meetings |
| `label_create`, `label_rename` | Labels (no label delete: it touches many items; proposal). | labels |
| `focus_start`, `focus_stop` | Start or stop a focus session (proposal, §15 Q5: starting a session from an assistant could surprise you). | `focus_start`, `focus_stop` |
| `restore` | Put back an item from the Bin. | `note_restore`, `task_restore` |

**Never available (B3, B4, B5):** diary anything; `bin_empty`, `note_purge`, `data_delete_all`, `data_export`, `data_import`, `usage_delete`, `retention_apply`; any settings change; importing or removing character packs; `open_url` (an assistant tricked by a web page could open links on your PC); closing browser tabs.

### 5.4 Size and safety of inputs

- Titles at most 300 characters, note bodies at most 100,000, the same limits the app already enforces; anything larger is refused, not cut.
- Dates as `YYYY-MM-DD` or ISO times, interpreted in your time zone.
- Text from an assistant is stored as plain text or Markdown, never as HTML; it is shown the same way as text you typed.

---

## 6. Safeguards in detail

| Safeguard | How it works |
|---|---|
| **Master switch** | MCP page, off by default. Off = pipe closed, token deleted, bridge calls answer "Pluto's MCP is off". |
| **Per-assistant switch and level** | Each assistant: **Pet only** (status, react, say), **Read** (plus §5.2), or **Read and write** (plus §5.3). The owner chose full read and write; proposal: a new assistant starts at **Read and write** as decided, and the level is there to lower it (§15 Q6). |
| **Bin rules** | Every delete by an assistant goes to the Bin; restore works as usual. An assistant can restore but never purge or empty. |
| **"Changed by assistants" list** | Every successful write is recorded: when, which assistant, which tool, what item (kind, id, title), and a short "before → after" of the fields it changed. Shown on the MCP page with filters, and an **Undo** per change where possible (edits put back the earlier fields; creates go to the Bin; deletes are restored). Kept 90 days (proposal). |
| **Mark on the item** | Proposal: a task or note an assistant created or last changed shows a small "by Claude Code" tag in its editor, so you see it where you work (§15 Q7). |
| **Rate limit** | 10 calls per minute per tool per assistant (owner). Refused calls are logged once per minute, not each time. |
| **During focus** | `say` shows its bubble or a silent badge (owner, setting); `react` follows the same setting; nothing waits for the session to end (owner). |
| **Request log** | Every call: time, assistant, tool, outcome (ok, refused, error), duration. **Not the arguments' text** (so note content does not end up in a second place). Kept 30 days, "Clear log" button. |
| **Prompt injection, said plainly** | An assistant that also reads web pages can be tricked by a page into reading your Pluto and passing it on, or into changing things. Pluto cannot see the assistant's intentions. The defences are the level per assistant, the change list with Undo, the Bin rules and B5. The owner accepted this risk on 2026-10-31. |

---

## 7. Assistant hooks (P4.2): "tell me when it's done"

- **Claude Code** [Certain, checked 2026-11-01]: hooks are commands in its settings file that run on events. **`Stop`** fires when Claude finishes responding, **`Notification`** when it needs your attention, **`StopFailure`** when a turn ends on an error [Likely, listed by a third-party guide; to be confirmed in the official reference before building]. Pluto generates the block:
  - `Stop` → `Pluto.exe --react agent_done`
  - `Notification` → `Pluto.exe --react agent_needs_you`
  - `StopFailure` → `Pluto.exe --react agent_error`
  - Pluto shows the block with **Copy**, and explains which file it goes in (user settings, so it works in every project). Pluto does not edit the assistant's files itself (proposal, §15 Q8).
- **Why hooks and not the MCP tools for this:** hooks fire every time; an MCP `react` call only happens if the model decides to call it. MCP `react`/`say` remain the route for assistants without hooks.
- **Other assistants** (Cursor, Codex, others): each one only after its hook system is checked against its own current documentation [Guessing which have hooks today]. Claude Code first, end to end.
- **`Stop` fires after every reply, not only at the end of a task** [Certain, Claude Code docs]. So `agent_done` has a cooldown (proposal: not more than once per 30 seconds per assistant) and shows only if you are not looking at that assistant: if the assistant's own window is in front, the pet stays quiet (it knows the app in front from tracking). The "is it in front" check needs tracking on; without it the pet always reacts.

---

## 8. Reactions (shared by MCP, hooks, git and builds)

| Reaction | Default pose and line | Raised by |
|---|---|---|
| `agent_done` | cheer, "Claude is done" (assistant's name) | hook `Stop`, MCP `react` |
| `agent_needs_you` | wave, "Claude needs you" | hook `Notification` |
| `agent_error` | worried, "Claude hit an error" | hook `StopFailure` |
| `git_commit` | nod, "Committed in <folder>" | git watcher (P4.3a) |
| `git_push` | jump, "Pushed <folder>" | git watcher |
| `build_ok` | cheer, "Build passed" | `--run` (P4.3b) |
| `build_failed` | worried, "Build failed" | `--run` |
| `ci_green`, `ci_red` | later, after the network layer | CI (later) |

Each appears in the Character page's Reactions list like every existing reaction: switch it off, pick another pose, write your own words. Assistant-raised reactions use the assistant's display name from the MCP page, never text the assistant sent (so a page cannot make the pet say something through `react`; `say` is the only free-text tool and it is labelled with the assistant's name).

---

## 9. Developer reactions (P4.3), recap from `MASTER_PLAN.md`

- **P4.3a git watcher:** you pick repository folders (none by default). Pluto watches only `.git/refs` and `.git/HEAD`: a moved branch ref = `git_commit`, a moved `refs/remotes/origin/<branch>` = `git_push` (a push that succeeded; a failed push changes nothing and cannot be seen). Never reads source files or commit messages. New dependency: a file-watcher crate (checked with `cargo audit`).
- **P4.3b `--run`:** `Pluto.exe --run -- npm run build`; exit 0 = `build_ok`, otherwise `build_failed`; same output and same exit code as without Pluto. Works in any terminal and in VS Code tasks.
- **Later (network layer):** CI results after a seen push, with a read-only GitHub token in the OS credential store; one-minute polling until checks finish, never idle polling.

---

## 10. Screens (each needs a preview the owner approves first)

**MCP page** (sidebar item comes back; it was hidden until it exists):
1. Master switch and one line on what it does and does not do.
2. **Assistants:** "Add assistant" (Claude Code, Claude Desktop, Cursor, Other) → name → level → generated config with Copy and where to paste it; per assistant: on/off, level, last seen, "Test" (makes the pet wave through that assistant's route).
3. **Connected now:** which assistants have an open connection.
4. **Changed by assistants:** the list with filters and Undo.
5. **Request log:** last 30 days, Clear.
6. **Hooks:** the generated block for each assistant that has hooks.
7. **Developer:** repository folders for the git watcher; the `--run` line to copy.

**Elsewhere:**
- Character → Reactions: the new reactions in the list.
- Settings → Notifications: "Assistant messages during focus: bubble / silent badge" (owner).
- Task and note editors: the "by <assistant>" tag (if Q7 is yes).
- The pet's right-click menu: "Assistants: on/off" for a quick stop (proposal).

---

## 11. Data

**Migration 012** (the schema is at version 11 today):

| Table | Columns (plain) |
|---|---|
| `mcp_assistants` | id, display name, kind (claude-code, cursor, …), level (pet, read, write), enabled, created at, last seen |
| `mcp_changes` | id, at, assistant id, tool, item kind, item id, item title at the time, before (JSON of changed fields), after (JSON), undone at |
| `mcp_log` | at, assistant id (or "unknown"), tool, outcome, duration ms |
| `git_watch` (P4.3a) | folder path, enabled, added at |

**Settings keys:** `mcp.enabled` (false), `mcp.focus_say` ("bubble" | "badge"), `mcp.agent_done_cooldown_s` (30).

**Export and import:** assistants and the change list are included in Pluto's export; the token never is. Delete all removes them. The diary rules do not change.

---

## 12. Where the code goes

| Part | Place | Notes |
|---|---|---|
| Protocol, tool registry, schemas | `crates/pluto-core/src/mcp/` (`protocol.rs`, `tools.rs`, `policy.rs`, `changes.rs`) | Pure Rust, no Tauri, no network; tested with the in-memory database |
| Pipe server | `src-tauri/src/mcp_pipe.rs` | Windows named pipe with a user-only access list; Unix socket on macOS |
| Bridge and CLI flags | `src-tauri/src/bridge.rs`, called from `main` before Tauri | `--mcp-bridge`, `--react`, `--run` |
| Git watcher | `src-tauri/src/git_watch.rs` | P4.3a |
| UI | `src/features/mcp/` | MCP page, assistant dialog, change list |
| Types | `pnpm gen:types` after the core types | as today |

---

## 13. Tests (every step ships with its tests)

- **Protocol:** both versions (2026-07-28 discover and per-request `_meta`; 2025-11-25 `initialize`), unsupported version, bad JSON, unknown method, message too large, deterministic tool order, `resultType`, `ttlMs`.
- **Policy:** diary never reachable (every tool, every argument); level hides tools; switched-off and unknown assistants refused; rate limit at the 11th call in a minute; deletes land in the Bin; Bin cannot be emptied; no settings tool exists; B5.
- **Each tool:** against the in-memory database, including paging and the 300-character cut.
- **Change list:** every write records one change; Undo restores the earlier fields; Undo of a create bins it.
- **Pipe and token (shell):** wrong token refused, missing token refused, new token after restart, user-only access (Windows CI test that a pipe opened with the wrong rights fails) [Likely testable in CI].
- **Bridge end to end (CI, Windows and macOS):** start a test Pluto service, run the real `--mcp-bridge` binary with piped stdio, list tools, call `react`, read the pet event. This is also the spike for §3.1.
- **Real assistant (owner, Windows):** Claude Code with the generated config: tools listed, "add a task" works, the change list shows it, Undo works, the `Stop` hook makes the pet cheer. Until the owner has run it: **Unverified**.
- **MCP Inspector** (the official test tool) run against the bridge before the owner's test [Likely available as `npx @modelcontextprotocol/inspector`; it runs on our machine only, not shipped].

---

## 14. Build order

| Step | Contents | Done when |
|---|---|---|
| **P4.1a** Spike + pet tools | Prove stdio works from the windowed `Pluto.exe` (§3.1); pipe + token; bridge; protocol (both versions); `status`, `react`, `say`; master switch; minimal MCP page (switch, add assistant, config, connected now, log) | Inspector and Claude Code list three tools and the pet reacts; wrong token refused; switch off closes the pipe |
| **P4.1b** Read tools | §5.2 with paging; diary refusal tests | Claude Code answers "what's due today" from Pluto |
| **P4.1c** Write tools + safeguards | §5.3, levels, Bin rules, change list with Undo, migration 012 | "Add a task", "mark it done", "delete it" work and all three show in the list and can be undone |
| **P4.2** Hooks | `--react`, generated hook block, cooldown and "you are looking at it" rule, reactions in the Character page | The pet cheers when Claude Code finishes while you are in another app |
| **P4.3a / P4.3b** Git and builds | Git watcher, `--run` | Reactions fire on a test repository and a failing build |
| **P4.4** Project Spaces | Mostly built already (Projects tab, 2026-10-25); what is left is MCP access to projects (in 5.2/5.3) and the per-project pet (FR-67) | Re-scoped with the owner when P4.3 is done |
| *Network layer* | One opt-in HTTP client, Connections page | Then CI reactions, calendar feed, connectors (`RESEARCH_INTEGRATIONS.md` F) |

Each step can be released on its own when the owner says. P4 as a whole was planned as **v0.6.0**.

---

## 15. Questions for the owner (Claude's recommendation first)

| # | Question | Recommendation |
|---|---|---|
| Q1 | B5: assistants can never change settings, including their own permissions. | **Yes.** Otherwise one tool call can switch every safeguard off. |
| Q2 | Write the protocol layer ourselves or use the official `rmcp` crate? | **Ourselves.** Four methods, both versions, no big dependency; revisit if MCP needs more later. |
| Q3 | When Pluto is not running, should the bridge start it? | **No:** answer "Pluto is not running". Starting a GUI app from an assistant's background process surprises people. |
| Q4 | Reminder and meeting deletes by an assistant: to the Bin (needs Bin support for them) or refused? | **Refuse for now** (they have no Bin today); add Bin support later if you want it. |
| Q5 | May an assistant start or stop a focus session? | **Stop: no. Start: yes**, it is easy to stop yourself. |
| Q6 | A new assistant's level: Read and write (as decided) or Read first? | **Read and write as you decided**, with the level visible on the card so it is one click to lower. |
| Q7 | Show "by <assistant>" on items it created or changed? | **Yes**, small, in the editor only. |
| Q8 | Should Pluto write the hook block into Claude Code's settings file for you? | **No, Copy only.** Editing another app's files is easy to get wrong and hard to undo. |
| Q9 | Count time in Pluto's own dashboard? (from the tracking fix) | **No**, as today. |

---

## 16. Risks

| Risk | What we do |
|---|---|
| The windowed `Pluto.exe` cannot use piped stdio on some Windows setups | Spike first (P4.1a); fallback console helper, owner decides |
| Assistants change their protocol version or hook names | Support two protocol versions; check each assistant's current docs before generating its config; the generated text is versioned in one place |
| Prompt injection through an assistant that browses | Levels, change list with Undo, Bin rules, B5, no `open_url` |
| A stuck or flooding assistant | Rate limit, 1 MB message cap, one task per connection, the master switch |
| Data loss from a wrong edit | Undo in the change list; deletes only to the Bin |
| Antivirus flags a program that opens a named pipe and is started by another program | Unsigned builds already warn; code signing (on hold) is the real fix; noted for the owner |

---

## 17. Before a release for other people: remove the testing code (owner 2026-11-01)

The owner asked that once the fixes are confirmed, all testing code is removed and only production code stays. To remove, **after the owner confirms a full day where Pluto's total matches the clock**:

| What | Where | Why it exists |
|---|---|---|
| The tracking trace (`trace` module, `trace::line`, `trace::idle`, `set_folder`, the 2 MB file) | `src-tauri/src/tracking.rs`, `src-tauri/src/lib.rs` | Finding the missing time (0.5.7) |
| The trace's file in the data folder | `tracking-trace.txt` (deleted by the first build without the trace) | same |
| The trace section of the report script, and the script itself unless the owner wants to keep it as a tool (it is not shipped in the installer) | `scripts/tracking-report.py` | same |
| The card drawn inside the pet window (only used by the browser preview and tests now) | `src/pet/PetApp.tsx` (`cardWindow=false` path), its tests | Kept while the card window is Unverified, as a fallback |
| The opacity hide while the pet window grows, if the card window removes the need (still used for the bubble and the timer; check first) | `src/pet/PetApp.tsx` | 0.5.5 blink fix |
| Old-name (Loaf) migration code | `src-tauri/src/earlier_app.rs`, `crates/pluto-core/src/legacy_data.rs` | Keep until every tester is past 0.5.x; then remove |
| Comments that tell the history of a fix instead of what the code does | throughout | Shortened in the same pass |

Each removal is its own commit with the tests updated, and the clean-up is listed in the CHANGELOG.
