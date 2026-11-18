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
