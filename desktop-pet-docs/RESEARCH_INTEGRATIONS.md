# Research notes: integrations, MCP and developer events

*Recorded 2026-10-31 at the owner's request, for the owner's own review. Nothing here is built. Confidence tags: [Certain] checked in a source, [Likely] strong inference, [Memory] from memory, check first.*

## A. Will the pet show that Claude finished, a build ended, or a push succeeded?
Planned in P4 (not built). Mechanisms, in the order they would be built:
1. **Coding-assistant link (P4 step 2).** Claude Code can run a command on events such as "finished" and "needs your input" ("hooks"). A hook calls Pluto's `react` or `say` tool through the bridge. The pet is a separate always-on-top window, so it shows over WhatsApp or any other app, except while another app is full screen and `pet.hide_fullscreen` is on. [Likely]
2. **Git events (P4 step 3).** Pluto watches the git state of folders you pick (never source): a commit moves the branch ref, a successful push moves `refs/remotes/origin/<branch>`. This works for VS Code, a terminal or any other tool, with nothing to install in VS Code. [Likely]
3. **Build finished or failed.** Git cannot see it. Options: a one-line wrapper (`npm run build && pluto react success || pluto react fail`), a VS Code task that calls the same command, or a small VS Code extension later. [Likely]
4. **CI red or green.** Needs a GitHub token you add yourself; off without it.
Open questions: which assistants first, whether reactions may interrupt a focus session, rate limits (the five MCP design questions).

## B. People who don't install AI apps
Pluto works fully on its own; MCP is optional. For mail and calendar without an AI app, in build order:
1. Local `.ics` import (P5): free, no sign-in.
2. Calendar feed URL: Google Calendar gives each calendar a private iCal address; free, no OAuth, small opt-in fetch. [Likely] Updates can lag.
3. Gmail over IMAP with an app password: free, no Google review, no weekly expiry. [Likely]
4. Direct connectors with sign-in: on-hold P9.

## C. Case 1: an AI app connected to Gmail, Drive, Granola, Wispr Flow
- Automation is partial. MCP is request-driven; nothing updates unless an AI app runs a model that calls tools. A scheduled task in the AI app can do "every morning read my calendar and add tasks".
- Active only while that AI app and Pluto are both running on the PC. [Certain] A cloud-scheduled agent cannot reach Pluto: the bridge is local.
- Writing into Pluto needs a `task_create` tool. P4 has only `status`, `react`, `say`. **Decision needed from the owner.**

## D. Case 2: tokens, costs, open source
- Access tokens are short; a refresh token renews them silently. [Certain] Google ends refresh tokens after 7 days for apps in "Testing" status, forcing weekly sign-in. Publishing the app removes that; for personal use it shows an "unverified app" warning (clickable); unverified apps are capped at 100 users.
- [Likely] A purely local app avoids the paid security audit (which applies to apps that store or send data on a server). Gmail read access still needs Google verification for public release.
- Costs: Google Calendar/Gmail/Drive APIs free (effort is verification, Gmail hardest); Microsoft 365 [Memory] free API, company accounts need admin approval; Notion, Todoist, GitHub [Memory] free API with rate limits, user supplies the token; Granola free plan limited to the last 30 days, Business about $14 per user per month; Wispr Flow pricing unknown, cloud-based; Apple Calendar on macOS free and local.
- Open source: community MCP servers for Gmail/Calendar/Drive (own Google credentials, review before use); open protocols (IMAP, CalDAV, iCal) with free Rust libraries; n8n and Activepieces self-hosted; `whisper.cpp` (MIT, on-device) for the voice phase instead of a cloud service.

## E. Open decisions this raises
1. ~~Is an opt-in network fetch (calendar feed URL) acceptable in the local-first rule?~~ **Decided 2026-10-31 (owner): yes, in future, after the local MCP server.**
2. ~~Should the MCP server be allowed to create tasks and notes (writes)?~~ **Decided 2026-10-31 (owner): full read and write except the diary** (see `DECISIONS.md` 2026-10-31 late).
3. ~~Order: calendar feed before or after the MCP server?~~ **Decided 2026-10-31 (owner): the local MCP server first, the network layer afterwards.** Decisions 1 and 2 were settled the same day.

## F. Built-in connectors and the network layer (recorded 2026-10-31; built after the local MCP server)

The owner asked whether connections can be built into Pluto itself ("hard coded"), and asked for these notes to be kept. **Order: local MCP first (P4), then one network layer that these connectors use.** Nothing here is built.

**What "built in" can and cannot mean** [Likely]
- The list of services and their web addresses can be fixed in the program.
- A **secret cannot** be: anything inside a program you distribute can be read out of it. So no private key, client secret or token is ever shipped in Pluto.
- What is allowed: the public identifier of Pluto's own registration with a service (a "client ID"), sign-in that proves itself per sign-in instead of with a secret (OAuth with PKCE), and keys or tokens the person pastes in, stored in the operating system's credential store.

**Built-in connectors (sign in, Pluto fetches)**
- Google Calendar, Gmail, Drive: sign-in with PKCE; Pluto stores only the refresh token in the credential store. The first in line would be Calendar, read-only.
- Microsoft 365 and others: same pattern, one connector at a time, each off until the person connects it.
- Needs: the single opt-in network client, a "Connections" page showing what is connected, what Pluto may read and a Disconnect button that also deletes the stored token.

**For Google specifically**
- While the registered app is in "Testing", Google ends the refresh token after 7 days, so the person would have to sign in again every week. Moving to "In production" removes that; an app that is not verified shows a warning screen and is limited to 100 users. [Certain]
- Calendar read access is the lightest to verify; Gmail read access is a restricted scope and needs Google's verification, plus a security assessment if mail is stored or sent to a server (Pluto's would be local only). [Likely]
- Until verified, the practical route for a personal build is the private calendar address (no sign-in at all) or Gmail over IMAP with an app password.

**Other connections, no sign-in service needed**
- Calendar feed URL (iCal), CalDAV, IMAP: open protocols with free libraries.
- Keys the person pastes: GitHub (CI reactions), Notion, Todoist.
- Everything else reaches Pluto through MCP from an AI app the person already runs.

**Rules for the network layer when it is built**
- Off by default, per connection; works without any of them.
- One HTTP client in one module; `pluto-core` stays free of network code (checked by `pnpm check:core-deps`).
- Every request is logged on the Connections page (what, to whom, when); no data is sent anywhere except the chosen service.
- Tokens only in the operating system's credential store.
