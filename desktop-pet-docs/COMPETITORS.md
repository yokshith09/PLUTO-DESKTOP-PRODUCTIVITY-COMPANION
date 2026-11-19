# Competitor analysis: Arrowslit and NotchPixel

Written 2026-11-18 from public pages only (README, ROADMAP, ARCHITECTURE of Arrowslit; the notchpixel.com home page). No source code was read and neither app was run, so "works well" is not claimed for either. Numbers are as published on the day.

## 1. Both products in one line

| | Arrowslit | NotchPixel | Pluto (us) |
|---|---|---|---|
| What it is | A utility that lives in the MacBook notch | A "Dynamic Island" / notch for Windows 10 and 11 | A desktop pet plus productivity app (tasks, notes, diary, meetings, projects, study) |
| Platform | macOS 14+ only | Windows 10 (2004+) and 11 only; Mac version "in development, no date" | Windows (tested), macOS (CI only) |
| Price | Free, GPL-3.0 | $9.99 once, Microsoft Store, 7-day trial | Free so far |
| Distribution | Unsigned DMG, Homebrew cask | Microsoft Store only | GitHub releases (drafts for owner testing) |
| Stack | Swift, SwiftUI, AppKit | Not published | Tauri v2, Rust core, React/TypeScript |
| Privacy line | No accounts, zero telemetry | No account, "nothing goes to us" | Local-first, no accounts |
| Size and traction | 1 developer, 276 commits, 44 releases since about 29 Oct, 2 stars | 21 five-star Store reviews, nominated for a web design award, partner programme (40% to creators) | One owner plus agents |

## 2. Arrowslit

**Idea.** The notch is dead space; give it a job. Hidden at rest, expands on hover or a shortcut, tucks back when nothing needs you. Principles stated in its docs: local first, quiet (idle CPU near zero, sensors only sample while visible), small surface ("one notch, one workbench, no infinite widget grid"), failure tolerant, testable core.

**Features (13 tools).**
- **AI agents:** live token and dollar spend for Claude, Codex, OpenCode and Copilot; **approvals from the notch** (Allow, Deny, Ask in CLI) through six hook adapters and an OpenCode plugin.
- **Time:** timer with a sliding minute ruler and haptics, Pomodoro, stopwatch, calendar with a 5-minute meeting heads-up and Join buttons (Meet, Zoom, Teams, Webex), Apple Reminders.
- **Desk:** clipboard history (20 items, RAM only, password managers skipped, search and pins), file tray with AirDrop, scratchpad with rich text and to-dos.
- **System and presence:** CPU, memory, disk, network; camera mirror; keep-awake; call and microphone detection with mute and hang-up; download progress; charging, low battery, headphones, volume and brightness HUDs; optional lock-screen notch.
- **Media and extras:** now playing with optional lyrics, football scores with goal alerts, multi-display support.

**How it is built.** AppKit shell with SwiftUI content; a single "what is showing" resolver so window size and visible surface cannot disagree; an alert queue (one at a time, expiry, urgency); a separate media helper process; agent approvals over a `0600` Unix socket with peer-UID and code-hash checks, failing open to the assistant's own prompt; signed in-place updates (Ed25519 manifest, size cap, SHA-256, code-signature check). There is a separate security review document for the approval path.

**Direction (its roadmap).** Phase 1 daily-driver polish (global hotkey, timer sound and repeat, notes export, accessibility, per-feature toggles); Phase 4 platform: a small widget or extension API for community modules, themes, localization, a notarized build, a docs site. Release cadence is very fast.

**Strengths.** Native macOS feel, real-time assistant telemetry and approvals, mature update and signing design, strong written architecture and security docs, ships constantly.
**Weaknesses.** macOS and notch-style only; not notarized (first launch needs a workaround); single maintainer; almost no users yet; nothing for study, tasks, long notes or planning beyond a scratchpad and Reminders.

## 3. NotchPixel

**Idea.** "The Dynamic Island for your PC." One island at the top edge that opens when you rest the pointer on it, as a floating island or a notch shape. Sold as a bundle: its site compares it to about $144 of separate Windows apps and prices itself at $9.99 once.

**Features.**
- **Look:** liquid glass, Black, Graphite and soft themes, 21 languages.
- **Media:** now playing from any app that reports to Windows (Spotify, browsers, VLC and others), lyrics.
- **Phone link:** **PC Deck** (phone as trackpad, music remote and app launcher through the phone's browser, off by default, each phone allowed by hand); **files to phone** by scanning a code on the same Wi-Fi.
- **Windows replacement pieces:** an optional bottom notch that replaces the taskbar (Start, apps, tray, quick settings, clock); quick controls (volume, brightness, Wi-Fi, Bluetooth, night light, focus, power mode); notifications list.
- **Desk:** clipboard history (text, links, pictures, files; pins), file shelf (drag in and out), web drawer (pinned site opens under the island, even over games), launcher.
- **Games and streaming:** game strip over borderless fullscreen games (FPS, CPU, GPU, RAM, temperatures), one mute key (Ctrl+Alt+M) with call timer, Twitch and YouTube chat drawer, OBS REC pill.
- **Time and widgets:** reminders with snooze, repeat and Done in the island; widgets (clock, world clock, weather, to-do, photos, batteries, timer, PC stats) that can pin to the desktop.
- **AI agents:** shows what Claude Code, Codex, Antigravity, Hermes and your own agents are doing and when each needs you.

**Direction.** Its public vote list: **NotchPixel for Mac**, **every display** (one island per monitor), **calendar in the island** with a Join button. It is growing by adding more "jobs" for the strip, by a creator partner programme, and by Store reviews and SEO guides (for example a 20-app comparison page).

**Strengths.** The only polished Windows notch with a clear bundle price story; broad feature list; Microsoft Store distribution (trust, updates, refunds handled); phone link without a phone app; marketing machine.
**Weaknesses.** Paid; Windows only today; closed source; a feature list this wide means each part is likely shallow; the agent feature is a status display (no per-tool permissions that we can see); nothing for study, long-form notes, diary or projects.

## 4. Where Pluto sits

**Where they lead us.**
- A single glanceable surface at the screen edge, and the polish and animation that goes with it.
- Live system and media integrations (now playing, clipboard history, file shelf, game strip, quick controls).
- Distribution: Store listing (NotchPixel), signed in-place updates and Homebrew (Arrowslit).
- Marketing: demo films, guides, comparison pages, a partner programme.
- Arrowslit only: approving an assistant's command from the screen edge, and spend telemetry.

**Where we lead them.**
- Study and productivity depth: tasks, notes, diary, meetings, projects, and the Study pack (course page with topics and short notes, timetable with CSV and Excel import, exams, class reminders).
- A character, not a strip: the pet reacts to assistants, focus, tab overload and reminders.
- Assistant control that is finer than theirs: per-tool and per-reaction switches per assistant, sounds per moment, click to go to the assistant's window, and a copy-paste command for any app.
- Windows is our tested platform and macOS is planned; Arrowslit has no Windows build, NotchPixel has no Mac build yet.
- Free and local.

**Overlap to watch.** All three show what a coding assistant is doing and when it needs you. Arrowslit and NotchPixel both do it from the screen edge; Pluto does it with the pet and the Assistants page. The next feature in this space that users will compare is **approving or denying an assistant's command from the screen** (Arrowslit has it).

## 5. What to take from them (ideas only, nothing decided)

1. **Signed in-place updates** with a verified manifest (Arrowslit): reduces the friction of every release.
2. **A store listing** (NotchPixel uses Microsoft Store): trust, updates and refunds for free; worth costing for Pluto's Windows users.
3. **Approve from the screen** for assistants (Arrowslit): a real security boundary; needs its own design and review before any code.
4. **A one-minute demo film and a plain feature page**: both competitors lead with video; Pluto has none.
5. **Calendar join button a minute before a meeting** (both): Pluto has meetings and reminders; a pre-meeting pet bubble with a Join link would be a small, visible win.
6. **Per-monitor behaviour** (both are heading there): check how the pet behaves on several displays.
7. **Not to copy:** a long tail of unrelated widgets (game FPS strip, stream chat, taskbar replacement). Both tools win on breadth; Pluto's edge is depth for students and developers, and Arrowslit's own docs warn against "an infinite widget grid".

## 6. Risks and caveats

- NotchPixel's claims (reviews, comparison prices, award nomination) are marketing copy and were not verified. The price table is theirs.
- Neither app's quality was tested. This is a product and direction comparison, not a quality ranking.
- Arrowslit's pace (44 releases in about three weeks) shows what a single focused scope can ship; Pluto's wider scope is slower by nature.

## 7. What Pluto should take, and how to change it (2026-11-19)

Built from sections 2 to 6 and from what Pluto already has (pet with reactions, tasks, notes, meetings, reminders, focus timer, time tracking, MCP server with 20 tools, assistant hooks, switches per tool and per reaction, sounds, click-to-window, Study pack, system radar). Nothing here is decided; each item needs the owner's go-ahead and a preview (CLAUDE.md).

**Take, adapted (best fit first)**

| # | Idea | From | How Pluto does it differently | Fits the plan |
|---|---|---|---|---|
| 1 | **Calendar integration with a Join button** a few minutes before a meeting | both | The pet says "Standup in 5 min" with a Join link (Meet, Zoom, Teams). Start with a calendar's secret iCal link (read-only, no login); add the calendars already on the PC later; full sign-in only if the owner wants two-way. | P5 (owner: integration, not import) |
| 2 | **Quick Actions bar** (global shortcut) | Arrowslit roadmap | One shortcut opens a command bar: add a task or note, search, open a project, start focus, launch a saved set. Pluto's edge: it searches your own tasks, notes and courses. | P5 |
| 3 | **Approve an assistant's command from the screen** | Arrowslit | Pluto already asks on the pet for MCP settings. Extend to "Allow / Deny / Ask in the terminal" on the pet for tool permission requests, failing open to the assistant's own prompt. Needs its own security design first (local socket, user-only permissions, peer check). | New; after P5 |
| 4 | **Assistant spend** (tokens, dollars per day) | Arrowslit | A small Assistants tile: today's and this week's spend per assistant, read from the tools' own local logs, no network. Pluto's angle: tie it to the project, not just the tool. | New; small |
| 5 | **Launch Buddy** (open a saved set in one click) | both (launcher) | Already in P5. Add "Study set" and "Work set" templates, and start the focus timer with it. | P5 |
| 6 | **Clipboard history, short and private** | both | 20 items, memory only, skips password managers, pin an item into a note or task. Keep it off by default. | New; after P5 |
| 7 | **Call and meeting mode** | both | When a call starts, the pet goes quiet (no sounds, no bubbles) and a small timer shows. Pluto already knows quiet hours and focus; this adds the call signal. | New; small |
| 8 | **System resources badge** | both | Already in P5. Keep off by default and only sample while shown (Arrowslit's rule). | P5 |
| 9 | **Keep-awake toggle** | Arrowslit | One switch on the pet card, with a timer and an automatic off. Useful during long builds and downloads. | New; small |
| 10 | **Signed in-place updates** | Arrowslit | Check a signed manifest and offer "Update ready". Removes the manual download for every release. Needs a signing key the owner holds. | Release work; before wide release |
| 11 | **Microsoft Store listing** | NotchPixel | Trust, updates and refunds for Windows users. Cost it before deciding. | Release work |
| 12 | **A 60-second demo film and a plain feature page** | both | Both competitors lead with video; Pluto has none. Needs the owner's screen recording; no code. | Marketing |

**Adapt, do not copy**

- **Now playing, lyrics, phone as a trackpad, taskbar replacement, game FPS strip, stream chat:** all are breadth features that do not serve a student or developer. Pluto's own version of "now playing" would be a focus music tile at most, and only if users ask.
- **A notch or island at the screen edge:** Pluto's identity is the character, not a strip. If wanted, make the pet card dock to the top edge as an option; do not build a second surface.
- **Many monitors:** both competitors are heading there. First step is a check that the pet and the card behave on a second display; build the full feature only if the check fails.
- **A module or widget API:** Arrowslit plans one. Pluto's MCP server already lets other tools act on Pluto; keep that as the extension point.

**Where Pluto should not compete.** Breadth of utilities. Arrowslit's own docs warn against "an infinite widget grid", and NotchPixel's price story is its bundle. Pluto wins on depth for students and developers: the Study pack, projects, assistant control and a character people like.

**Suggested order after the 0.6.0 PC test.** (1) Calendar integration with Join, because both competitors lead with it and Pluto already has meetings. (2) Quick Actions plus Launch Buddy. (3) Assistant spend and the on-screen approval design. (4) Call mode, keep-awake and the resources badge. (5) Signed updates, then the demo film, before any wider release.

## 8. NotchPixel feature by feature (re-read from notchpixel.com on 2026-11-19; page only, the app was not run)

NotchPixel is one strip at the top of a Windows screen (a floating island, or a notch that hangs from the edge). Rest the pointer on it and it opens into a card. It is sold as a bundle: it lists eight Windows apps (about $144 in the first year) and says it replaces them for $9.99 once.

| Group | Feature | What it does exactly | Pluto |
|---|---|---|---|
| Look | Liquid glass, themes | The island blurs what is behind it live; or Black, Graphite, soft themes. 21 languages. | Pluto has five colours and light/dark; languages are P7 |
| Media | Now playing | Shows artwork, play, skip and scrub for anything that reports to Windows (Spotify, browsers, VLC...), with lyrics. | Not planned |
| Phone | PC Deck | Your phone's browser becomes a trackpad, music remote, app launcher and game/slide buttons. Off by default; each phone is allowed by hand; same Wi-Fi; certificate warning the first time. | Not planned |
| Phone | Files to phone | "Send to phone" shows a code; the phone scans it and opens a page served by the PC on the same Wi-Fi, valid only while the code is on screen. | Not planned |
| Windows | Taskbar replacement | A notch along the bottom with Start, pinned and open apps, tray icons, quick settings and the clock. Off returns Windows' taskbar. | Skip |
| Windows | Quick controls | Volume, brightness, Wi-Fi, Bluetooth, night light, focus and power mode. | Skip |
| Windows | Notifications | A moment in the island, then one local list. | Pluto has its own notification budget and quiet hours |
| Desk | Clipboard history | Text, links, pictures and files in tabs; pins. Stays on the PC. | Idea 6 in section 7 |
| Desk | File shelf | Drop files on the island, then drag them out into any app. | Maybe later |
| Desk | Web drawer | A pinned site opens in a rounded drawer under the island, even over a game. | Skip |
| Desk | Launcher | Opens apps and sets from the island. | Launch Buddy (in the plan) |
| Games | Game strip | In a borderless fullscreen game the island shrinks to a strip with FPS, CPU, GPU, RAM, temperatures. Exclusive fullscreen cannot be drawn over. | Skip (Pluto only needs to stay out of the way: FS-1) |
| Calls | One mute key | Ctrl+Alt+M mutes the microphone in every app at once, with a call timer. | Call mode (idea 7) is the quiet half only |
| Streaming | Stream chat, OBS pill | Twitch/YouTube chat in a drawer; a REC pill with time. | Skip |
| Time | Reminders | Quick set, snooze and Done in the island, repeats. Also a focus timer. | Pluto already has more (tasks, repeats, Bin, pet) |
| Time | Widgets | Clock, world clock, weather, to-do, photos, batteries, timer, PC stats; any can pin to the desktop. | Skip, except PC stats (in P5) |
| Agents | AI agents | Shows what Claude Code, Codex, Antigravity, Hermes and your own agents are doing and when each needs you. A status display; no per-tool permissions are shown. | Pluto does this with the pet and per-tool/per-reaction switches; section 7 adds on-pet approval |
| Roadmap | Public vote list | NotchPixel for Mac (80 votes), every display (80), calendar in the island with a Join button (75). | Calendar integration is in P5 |

**Reading it.** About two thirds of the list is Windows utility breadth (taskbar, quick controls, game strip, stream tools, phone link, widgets). That is where the $144 story comes from and where Pluto should not follow. The parts that fit Pluto are the ones also on its own plan: calendar with Join, a command surface, clipboard history, call awareness, and showing what assistants are doing. Their agent feature is the weakest part of their product and the one where Pluto is already ahead.

