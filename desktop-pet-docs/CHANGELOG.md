# Changelog

All notable changes. Newest first. Format follows [Keep a Changelog](https://keepachangelog.com). Everything lives on `main`. `v0.1.0` is the first release; entries below are grouped by date. Dates come from Git.


## [Unreleased]

- Added: `scripts/tracking-report.py`, a read-only report of the app sessions Pluto stored for a stretch of a day and the gaps between them, to find where uncounted time went (owner report: 21 of 45 minutes missing).

## [0.5.6] — 2026-10-31 (draft for owner testing; Unverified)

Fixes on top of 0.5.5, which is published and stays as it is.

- Fixed (**Unverified on a real PC**): **the live total could still drop by up to two minutes after you walked away.** The 0.5.4 fix only helped once a once-a-minute look had found you away; before that, the stretch was shown up to the present, so it climbed and then fell back to your last input (the "50 → 47" class). The total now asks the OS for the time of your last input every time it is read and shows the stretch only up to it; that time only moves forward, so the total cannot go down. While you work it is current to the second; if you come back within the five minutes the gap counts and the total jumps up. Two tests (a series of readings across a walk-away, and readings between looks); the series test had been failing on macOS CI intermittently and is now deterministic.

## [0.5.5] — 2026-10-31 (published)

Fixes on top of 0.5.4, which is published and stays as it is.


- Fixed (**confirmed by the owner on a real PC, 2026-10-31**): **a second Pluto blinking above the hover card.** When the pet window grows to make room for the card, Windows can show the window's previous frame (the pet alone) at the top of the grown window for a frame or two, which sits exactly above the card. The pet is now invisible for the moment of the resize (opacity, so the pointer still counts as over it) and comes back after the first painted frame, with a 250 ms failsafe so it can never stay hidden. If the blink is still there, the other explanation to rule out is a second copy of the app running (see the notes in `PROJECT_STATUS.md`).
- Fixed (**not run on a real PC**): **installing Pluto no longer leaves the old Loaf behind.** Pluto and Loaf are different programs to the system, so the old one stayed installed, kept running (a second pet) and kept its login entry; each person had to remove it by hand.
  - **Windows `-setup.exe`:** the installer stops Loaf, runs Loaf's own uninstaller silently (which keeps the data folder) and removes its login entry.
  - **Windows `.msi`:** a Loaf installed from the `.msi` is found by its product code and removed with Windows Installer (progress shown; an all-users install asks Windows for permission, which the person can refuse).
  - **Mac:** there is no installer step, so on the first normal start after the data is copied Pluto asks once: "Move the earlier version to the Bin and stop it starting at login?" (**Move to Bin** / **Keep it**). It stops the old program, removes its login item and moves it to the Bin through Finder (with Put Back), or straight into the Bin folder if Finder refuses. It is never asked at a login start or a second time.
  - The data is copied across by Pluto itself on first start, as in 0.5.4. Windows hook compiles under NSIS 3.09 in a stub; the Mac code type-checks and passes clippy on the Windows target (its call site is Mac-only, so CI is the first real compile); the real installer build is checked by the Release workflow.
- Changed: **the Release workflow** rebuilds an *unpublished* draft when the version file or the workflow changes, and moves the draft to the commit just built, so publishing tags exactly the commit whose installers it holds. A published release is still never rebuilt by a push.
- Fixed: **the End-to-end check** failed at its first step since 0.5.2 because a fresh install now asks "What describes you best?" and starts the tour; the test now skips both.
- Fixed: **checklists in notes.** Root cause found in a real browser run: after pressing Checklist the new `- [ ] ` marker was left *selected*, so the first letter you typed replaced it and you got plain text (the earlier tests clicked into the box first and so missed it). The cursor now goes after the marker. Also: the button works on an empty note; Enter continues the list (and ends it on an empty item); the boxes in Preview are clickable and save the note; note cards show ☐ and ☑ instead of square brackets; the cursor no longer jumps after a toolbar button or Enter when typing fast.
- Fixed: **the Character page left an empty block under the Wardrobe** at the default window size. The card now stretches to its neighbour and shows a live view of the pet in its current look. Both columns end together at widths 1180, 1400 and 1700.
- Docs: the plan for "tell me when it's done" (assistant finished, VS Code commits and pushes, builds, CI) under P4; built-in connectors and the Google limits recorded; the order is local MCP first, network layer afterwards.
- Tests: 11 new front-end tests (481 pass), 2 new in `pluto-core` for finding an earlier Mac install (491), 1 for the Bin move (runs in CI); the checklist test was shown to fail without the fix; the checklist behaviour is covered in the pure functions, the preview boxes and the editor.

## [0.5.4] — 2026-10-31 (draft for owner testing; Unverified)

The first build under the name Pluto, with the time-tracking accuracy fixes below. 0.5.3 stays as published.

- Changed: **the app is now called Pluto: "Small companion. Big universe."** Names, data file, identifier, settings text, docs and the character skill all use it. On first start the data of an earlier build (tasks, notes, diary, time history, installed characters) is copied into the new folder; the old folder is left as it was. Unverified on a real PC.

Time-tracking accuracy audit. Unverified on a real PC; the macOS part is compiled only in CI.

- Fixed: **the dashboard total no longer climbs and then falls back.** The stretch in progress was shown up to the present even after the person had stopped typing, so it grew through the quiet minutes and dropped when the 5-minute idle limit closed it (a reproduced series of 0, 1, 2, 3, 4, 5, then 1 minute). It is now shown only up to the last input.
- Fixed: **time no longer disappears for up to a minute after switching apps.** A finished session waited for its batch write and was in neither the database nor the live stretch. It is now counted while it waits, and counted once when saved.
- Fixed: **films, video calls and presentations with no keyboard or mouse input are no longer cut off after 5 minutes.** While the system is held awake (Windows `ES_DISPLAY_REQUIRED`, macOS `PreventUserIdleDisplaySleep`) the time counts, for at most 2 hours without input. Same rule for website time.
- Fixed: **a missed "app in front" event is corrected within a minute** (Windows asks `GetForegroundWindow` at each look) instead of losing time until the next switch.
- Fixed: **a clock set back** (time sync, wrong CMOS clock, dual boot) kept the stretch frozen at the old time; it now keeps what was earned and continues on the corrected clock.
- Tests: 10 new in `pluto-core` (482 total). Two were shown to fail without the fix.

## [0.5.3] — 2026-10-29 (draft for owner testing; Unverified)

Crash-safe time tracking, faster lists, accessibility fixes, dependency audit. Nothing here has been run on a real PC.

- Fixed: **time tracking no longer loses the stretch in progress if Pluto is killed, crashes or the power goes** (owner 2026-10-29: "no data loss"). Every look (about a minute) the app in front, and every 30 seconds the site in front, is written to a small journal table (`usage_open`, migration 011: an app's display name or a bare host, nothing else); at the next start the leftover row becomes a normal session ending when it was last seen. At most the last minute can be lost (the physical limit: a power cut cannot be saved from), never a whole stretch. It never invents time (ends at the last sighting, not at recovery), never double-counts (a stretch also saved normally is skipped), obeys the same rules as any session (2 s minimum, 12 h cap, not in the future, "do not track" sites refused), and is cleared by every delete, by forgetting a site and by "delete everything"; it is not exported and does not block an import. Waiting sessions are written before each checkpoint, so the journal never describes something that is only in memory. 17 new tests (journal unit tests, simulated crashes in the collector, site tracker, export/import).
- Fixed: **lists with thousands of rows**: Tasks and Notes drew every row at once (measured in a browser with 1,000 of each: Tasks took 1.4 s to appear with a 1.1 s freeze, Notes 1.6 s with a 1.5 s freeze). They now draw 100 rows and add the next 100 as you scroll near the end, with a "Show more" button for keyboards and screen readers; counts still show the true total. First appearance went to 0.37 s (Tasks) and 0.75 s (Notes). Measured in the development build against the demo shell, not on a real PC.
- Fixed: **four accessibility defects found by an automated scan (axe-core) of every page, light and dark**: a list of sites that held buttons instead of list items (Today), the week calendar's grid roles without rows (Tasks), note cards that were an `article` given the button role *and* held buttons inside (controls inside a button cannot be reached by a screen reader; the card is now a plain box with a real "open" button laid over it and the toolbar above), and the opacity slider without a name (Character). After the fixes every page scans clean; a new test keeps these from drifting back. Contrast passed everywhere. A real screen reader (NVDA/Narrator) has still not been run.
- Added: **dependency audit in CI** (`.github/workflows/audit.yml`): `cargo audit` and `pnpm audit --prod` on every lockfile change and weekly; only vulnerabilities fail it.
- Fixed: a wellbeing test failed whenever it ran during the default quiet hours (night), so CI could pass at noon and fail at 5 a.m.; it now sets its own quiet hours.
- Fixed: **Rust dependency advisories**: `zip` 2.6.1 to 9.1.3 (three RUSTSEC advisories on archive extraction; Pluto never extracted archives that way, so it was not exploitable). Six non-vulnerability warnings remain, waiting on Tauri and tokio. Import of a data file is faster (one prepared statement; 5.4 s for 50,000 notes plus 250,000 app sessions in a release build, export 3.1 s).
- Changed: **phase plan** (owner 2026-10-29): MCP is the next milestone (P4 Developer & MCP); Voice is its own phase for a second developer (P6); the small features of the old P4 and P5 are one phase (P5); Linux, languages and LAN are P7; AI is P8 and Online P9 (both on hold); the code Plugin SDK is dropped (plugins are art packs only). See `MASTER_PLAN.md`.
- Added: **diary search and tray lock** (FR-86 finished except mood faces, which are dropped as optional). "Search the diary" finds entries by their words, ignoring case, with a snippet; entries are decrypted one at a time in memory only while the diary is unlocked and nothing is indexed. **Putting the dashboard away locks the diary**: closing it to the tray, the pet's double click and the show/hide shortcut all lock it and the page drops what it showed. Autosave now waits 0.4 s, so very little can be lost when the window is closed. Unverified on a real PC.

## [0.5.2] — 2026-10-28 (draft for owner testing; Unverified)

Owner's 2026-10-28 list (phases 1 to 5, T16). Nothing here has been run on a real PC.

- Added: **two new original characters, Mira and Raja** (owner brief 2026-10-28; not based on any real person). Mira is a cheerful little heroine in a red and gold saree with a braid and gold jhumkas (the owner showed a cartoon girl in a red saree as the style to aim for; it is drawn from scratch, not copied); her special, Petal spin, fires every 5 tasks. Raja is a cool hero in a long dark jacket and sunglasses; his special, Shades on, fires every 2 tasks. Each has all eight poses, the turned views, its own reactions, and a sprite pack (`packs/mira`, `packs/raja`) that passes `pack.py check`. Drawn in code like the other characters, not with the image tool.
- Added: **the student pack: courses, exam countdown, weekly report** (T16, owner 2026-10-28; on for Student and Student who codes, off for the rest, switch in Settings → Your profile). Add courses on the new **Study** page, then pick a course on a task (editor) or a note (toolbar); a small course tag shows on the task row and the note card, and Tasks gets a Course filter. **Exams** (name, date, optional course) show as a countdown strip on Today (Today / Tomorrow / N days). The **weekly report** (Study page, seven days, previous/next week, Copy as text) shows focus time and tasks done per course, plus a "No course" row; focus time counts finished focus sessions started on a task that has a course, minus paused time. Storage: migration 008 (`courses`, `exams`, `task_course`, `note_course`); deleting a course removes its exams and links, never a task or a note. Unverified on a real PC.
- Added: **a Guide in Settings and the credit line.** Settings → Guide has a short, open-on-demand answer per feature (tasks, notes, focus, pet, app and website time, Privacy radar, your data; courses, exams and the weekly report only when the student pack is on). About now says "Built by QUORBIT TECHNOLOGIES". A task now shows the focus time worked on it (finished focus sessions, paused time out) and Notes has a Course filter (student pack). Quick capture is the existing global new-note shortcut (default Ctrl/Cmd+Shift+N, changeable); it works from the tray but is Unverified on a real PC.
- Added: **a private Diary** (FR-86, everyone). The first time you set a password (typed twice; a recovery key is shown once and must be ticked as saved). Entries are encrypted on this computer (Argon2id key, XChaCha20-Poly1305; migration 009) and the key lives in memory only while unlocked; it locks after five idle minutes, with **Lock now**, and when you leave the page. One entry per day, autosaved ("Saved"), previous/next day and a list of earlier entries. **Make task from selection** always works; **Spot things to do** (off by default) lists lines that read like to-dos ("I need to submit the report by Friday") with the date read from the words (today, tomorrow, Friday, next week, 23 Oct) using local rules only. Forgot the password: the **recovery key** shown once when you create the diary sets a new password and loses nothing (migration 010; entries use a random data key stored wrapped by the password and by the recovery key); lose both and the only way back is Erase the diary (asks first). Not built yet: search inside the diary, mood faces, locking when Pluto goes to the tray. The encrypted diary is included in Settings → Data exports. Unverified on a real PC.
- Changed: **one difference by role: the student pack.** Course label, exam countdown and the weekly report are on for Student and Student who codes and off for everyone else; every other feature is on for everyone. Settings → Your profile has a Student pack switch that beats the role default. App and website time stay opt-in for every role. The "what differs" table is gone. Unverified on a real PC.
- Added: **a first-launch tour and a Learn Pluto quiz.** After the welcome, one tap says who you are (Student / Developer / Student who codes / Something else; skippable). A spotlight tour then walks the real screens in that role's order (Today, Tasks, Notes, Projects, Time, **Tracking and privacy with the Privacy radar**, the pet, Character, Settings); Skip or Escape ends it, and it is replayable. On Today a "Learn Pluto" card asks five quick questions per role, each with a short explanation and a button that opens the feature; privacy (off until you switch it on, nothing leaves this computer, the Privacy radar) is in every set. **Settings → Your profile** changes the role, shows what differs by role, and replays the tour or restarts the quiz. The role only changes order and emphasis: it never hides a feature or turns tracking on. Role-dependent feature defaults (student pack, developer reactions) arrive with those features. Unverified on a real PC.

- Fixed (audit, `AUDIT_2026-10-28.md`): **a crashing screen no longer blanks the window.** It shows a calm message with Try again / Reload (nothing is lost); the pet window retries by itself. Also `vite` 7.3.7 clears five dependency advisories (dev machine only).

- Changed: **the character skill is rebuilt.** Give it a name and one picture and it returns one ZIP that imports straight into Pluto (Character → Import). `pack.py prepare` writes the background colour, layout guides and ten finished prompts; `pack.py finish` cuts, aligns and zips, and writes a contact sheet. Research behind it: `docs/character/RESEARCH_PET_PIPELINES.md`. The first real run with the Codex image tool is still to be done by the owner.

- Fixed: **character animations are aligned.** The new checker (`pack.py check`) found our own five characters failing it: waving and jumping frames were cut off at the cell edge, and the walking rows bobbed the feet up and down. The characters are now built through the same tool users' characters go through: one scale per character, feet on one baseline, body centred on one spot in every frame, jump clamped to what fits. Idle and work rows breathe, walking rows rock about their feet. Checked by script on all five (and by eye on the contact sheets); not yet seen playing on a real PC.

- Added: **each character has its own reactions and one special** (`pluto.json`). Moments stay common to all characters; a character picks its own pose for them, and your choice on Character → Reactions still wins. Specials: Pluto mode (bear, every 5 tasks), Zoomies (Mochi, every 5 clicks), Belly slide (Pip, every 3 tasks), Systems online (Bolt, first sight each day), Boo (Ghosty, every 7 clicks). The Character page shows the special and a Watch button. The sheet stays at nine rows, so a special reuses a row's art. Unverified on a real PC.

- Changed: **every delete asks first.** The task-row trash button (it used to become a "Delete?" button for three seconds), label delete, meeting delete and the task editor's delete now use the same small "Delete / Cancel" question as links and notes. Cancel has the focus. Tests added for the task row.

- Added: **stretch and water reminders** (Character → Pet notifications). Each has its own switch and its own gap — a break every 50 minutes, water every 1.5 hours by default. They repeat through the day, so they do **not** use up the daily nudge budget; they do keep quiet hours. When app tracking is on they count your time at the screen, so an hour away from the desk does not earn a break; otherwise they count the clock. The pet has no stretch or drink animation of its own yet, so each uses the nearest pose it has; real ones come with the per-character animations.
- Changed (Character page): the two top panels are the same height, so the page no longer has a tall empty gap beside the preview; the 17 preview poses are a tidy grid instead of a ragged wall; the second size preview (three bears) is gone, since the Size row already says how big the pet is. **Accessories and outfits** are now even tiles with a clear picture above the name, and no name spills out of its tile at 1280, 1024 or 800 px wide. Settings rows keep their words when space is tight (Quiet hours used to squash its own label).

- Fixed: **deleting a note no longer shakes.** The card's buttons were hidden the moment the cursor left the card, which pulled the confirmation away from the button it hangs from, so it jumped to the corner and flickered. The buttons now stay while a confirmation is open (notes, quotes, routine, shortcuts). Reproduced in a browser before and after.
- Added: **a task straight from the hover card.** "+" beside Tasks takes one line and Enter adds it for today; Escape closes it. No editor.
- Changed: **the focus timer under the pet is as wide as the pet**, with the time and pause only. While a session runs the hover card has pause or resume, +5 minutes, stop and edit. The card was also too short for its own buttons; it now fits them.
- Changed: **the task editor opens calm**: title, the one next step, when, priority and Save. Everything else — details, deadline, reminder, project, note, links, focus, other status changes, work updates, history and delete — is under one **Advanced options** fold that shows what it holds. Nothing was removed. The editor is never wider or taller than the window.
- Changed: **the pet's right-click menu** goes straight to any page (Today, Tasks, Notes, Time, Meetings, Projects, Character), makes a task or a note, starts focus, sleeps or wakes the pet, and has Quick settings (track app time, keep on top, hover card, get out of the way in full screen, type along). Shortcuts are shown only where one is really set, and a changed shortcut shows as changed.
- Added: **the pet gets out of the way in full screen** (Character → "Get out of the way in full screen", on by default). While a game, film, presentation or shared screen fills a display, the pet hides and comes back by itself. Windows asks the shell the same question notifications do; macOS looks for an ordinary window covering a whole screen. Neither has run on a real machine.

- Fixed (pet; owner 2026-10-27, "it moves when my cursor comes near"; Unverified on a real PC): the pet jumped on every hover and every leave. Causes found: (1) growing the window was two steps (size, then position), so for a moment the window had the new size at the old place; (2) the page laid itself out for the card only after the window had grown, and on leave dropped the card before the window shrank, so the pet was re-centred in the wrong window for a moment; (3) the gap between pet and card was 8 physical pixels while the page uses 8 CSS pixels, so at 125%/150% scaling the pet was pushed down a few pixels each time; (4) 0.5.1's hover hop on picture pets moved them up 8 px. Now: one `SetWindowPos` call on Windows; the page lays out first (new `pet_plan`), then the window grows; on leave the window shrinks first; the gap follows the screen scale; the hover greeting and the toss are in place (pop, tilt). Tests in `pet.rs` and `PetApp.test.tsx`. macOS still moves the window in two calls (no single call there), so a one-frame flicker may remain on a Mac.

## [0.5.1] — 2026-10-27 (draft for owner testing; Unverified)

Fixes and polish from the owner's 2026-10-27 test of 0.5.0: pet Sleep and drag, wardrobe alignment, confirmations, two tile sizes, evenly organised pages, a better Analytics view, four time-tracking gaps, and livelier picture pets. Nothing here has run on a real PC yet.

- Added (picture pets): a ring, a toss and a catch now each have their own motion (shake, toss, pop) on top of the shared row they play, so they no longer look alike.

Owner's 2026-10-27 list (screenshots of the oversized crown and the bear preview). All Unverified on a real PC; owner tests on Windows, macOS only in CI.

- Fixed (pet): **the Sleep button and other card buttons did nothing** — a press on any card control armed a window drag and the OS swallowed the click; drags now start only from the pet itself. **The pet jumped to another place**: while the card was open the position was not saved, so the next start used a stale spot; the pet's own spot is now always saved (not the grown window's corner), and a reaction no longer resizes the window mid-drag. Tests in `pet.rs` and `PetApp`.
- Fixed: **one bubble when a task is completed** (the pet's reaction carries Undo; the dashboard toast is gone). **The circle on a hover-card task completes it**; the title still opens the Tasks page.
- Fixed (other characters on hover): a picture pet only played its small "waving" row, so hovering looked like nothing. It now also hops once (as the bear raises an arm), a repeated reaction restarts its animation (it did not), and **Sleep now shows**: packs have no sleeping row, so the first idle frame is held, dimmed, with a "z". Tests in `SpritePet.test.tsx` and `PetApp.test.tsx`. Unverified on a real PC.
- Changed (Character): the big preview follows the character in use (not the bear); the page is two columns, evenly spaced by importance (preview + pet settings, characters, wardrobe, companion and reminders, reactions). **Music buttons removed for now** (the setting and command stay, default off; planned for later, see ROADMAP).
- Changed (wardrobe): placement is taken from the idle pose only, so a raised flipper no longer makes a crown too wide; the up/down/left/right/size Fit sliders are gone; one list with an icon beside each accessory (head, face and neck combined). Checked on all five built-in characters in six poses.
- Changed (everywhere): **every delete, remove and ✕ asks first** (one shared confirmation, 19 buttons). **Only two tile sizes** on Today and Time (the old medium is the small one; saved layouts are read as before). Today tiles aligned 7|5 by importance; Time: tracking settings moved from the bottom into a header dialog and rows of equal height; **Task editor**: priority, project and note in a strip under the title, two balanced columns.
- Changed (Time → Analytics): a "What stands out" list (up to four plain sentences), change against the previous period, per-day bars split by category with a legend, busiest hours; for a single day the hourly chart takes the full width.
- Fixed (time tracking; OS parts Unverified):
  - **Idle overcount**: once a look finds you away for a full minute, the live total stops at your last input instead of running on until 5 minutes pass (it was up to about 6 minutes over). Saved sessions were already cut at the last input.
  - **Time in Pluto's own windows is no longer counted** (decision 2026-10-27; one line in `usage.rs` to flip).
  - **Windows Store apps** show by their own name (the shell looks inside `ApplicationFrameHost.exe` for the app's `CoreWindow`); falls back to "Windows App" when it can't.
  - **macOS**: clicking the desktop no longer counts as Finder (Finder with no window on screen reports nothing). Compiled and linted for `aarch64-apple-darwin` here, never run on a Mac.

## [0.5.0] — 2026-10-26 (draft for owner testing; Unverified)

Task editor and Projects redesigned, accessories and outfits for every character, a richer per-app sessions view, resizable Today tiles, highlighted quote, Character → Reactions, hello as a text bubble, Character page preview, Settings without sub-tabs, pet focus timer below the pet with media buttons (Windows and macOS), Time Analytics view, time tracking now counts the app in front, character standard and skill. Nothing here has run on a real PC yet.

- Fixed (2026-10-26, found by CI on the first 0.5.0 build): **the Windows build did not compile** — the new music-key code used a key it never looked up (`src-tauri/src/media.rs`), so the Windows installer, CI and end-to-end jobs all failed while macOS passed. Now fixed, and checked against the Windows target from Linux (clippy with `-D warnings`, all targets) before pushing.

- Added (2026-10-26, owner's follow-up; Unverified on a real PC): **Accessories and outfits** for every character (Character → Accessories and outfits): nine things to wear — party hat, crown, beanie, cap, headphones (head), round glasses, sunglasses (face), bow tie, scarf (neck) — one per place, and six outfits (Cosy, Smart, Study, Cool, Royal, Party). All free and open, nothing earned or locked. The look shows on the pet and the Character preview and moves with the head. It works on the bear and on every picture character (Mochi, Pip, Bolt, Ghosty and imported packs): Pluto looks at each animation frame to find the head and neck, and follows the animation. A party hat is worn on your birthday and the pet's (can be turned off). Saved as `ui.wardrobe` (in the data export). The turned-around views (back-turn emote) of the bear are drawn without accessories. The two "Later" tiles are gone.
- Superseded (2026-10-27): the music buttons option was taken out of the UI (it did not work properly); see Unreleased.
- Changed (2026-10-26): **Time → an app's sessions** is richer: totals (time, sessions, longest, average), the busiest hour in words, a 24-hour "when you use it" chart, a by-day chart over several days, then the session list.

- Changed (2026-10-26, owner's redesign request; OS parts Unverified):
  - **Task editor**: where the task is (Planned → In progress → Completed), the project and the deadline ("Overdue by 2 days", "Due tomorrow") sit at the top; the one next action is the highlighted button. A **Suggestions** strip says the next useful step in kind words ("Planned for today. Start it when you are ready", "The deadline was 2 days ago. Make it due today…") with a one-click button. Settings are two cards, **Schedule** (When, Deadline, Reminder) and **Organise** (Priority, Project, Note); History folds away. An "Unsaved changes" dot shows beside Save.
  - **Projects**: each project in the list shows its progress and an overdue dot; the page shows counts (open, overdue, next deadline, % done), a progress bar and a **Next up** card (in progress first, then starred, then nearest deadline) with Open and Focus; finished tasks fold under "Done (n)".
  - **Today**: the quote is now a highlighted card (accent bar, large text). **Tiles can be resized** (small / medium / large, button beside the drag grip, remembered; Reset layout undoes it).
- Added (2026-10-26, J1–J3):
  - **J1** the Pluto character standard v1 (`docs/character/CHARACTER_STANDARD.md`): the pack format, the nine rows, the pose → row map and every default reaction in one page.
  - **J2** the character-building skill and one prompt (`skills/pluto-character/`): one description → reference sheet → nine row strips (Codex image tool or any tool the user has; Pluto never calls or pays for AI) → `pack.py assemble` writes `pet.json` + `spritesheet.webp` and checks the pack (tested with synthetic strips; no real AI-made character run through it yet).
  - **J3** **Character → Reactions**: each pet reaction (task added, started, done, all done, deleted, reminder, focus done) can be turned off, play another pose, or use your own words with `{title}` / `{left}`. The **daily hello is a text bubble**: "Good morning, <you>! I'm <pet>, your assistant." plus what is overdue, what is waiting today, or the day's quote; **Say hello now** repeats it any time. Long bubbles grow (up to six lines).

- Fixed (2026-10-26, time tracking audit): **the app in front was not counted until you switched away.** Totals only read saved sessions, so a long stretch in one app showed as zero, and the page only refreshed when something was saved. Now the stretch in progress is included in the totals (Time page, Today, pet card) and the pages look again every 30 seconds while open. Idle time is still cut off at your last input once Pluto notices (up to about 6 minutes later), so the number can briefly run ahead and then drop back. Tests added in core and the collector.
- Added (2026-10-26): **macOS media buttons** (play/pause, next, previous) via system media-key events sent by `osascript`; may ask for the Accessibility permission. Unverified (nobody ran it on a Mac). The pet shows the buttons on Windows and macOS.
- Docs (2026-10-26): how often Pluto looks at the computer, per feature (PROJECT_STATUS §4.8).

- Changed (2026-10-26, owner's UI reset batch 2 — F, G, H, I2; OS parts Unverified):
  - **Character page** (F1–F3): stays as it was; choosing another character changes the preview and shows that character's animations. Name, birthday, age in days and the daily-hello tile; accessories, outfits and reactions are shown as "Later".
  - **Settings** (G1, G3): no groups or sub-tabs. Pet settings live only on the Character page; tracking settings moved to the Time page, reminder sound/alerts to Today's agenda. What is left is General, Keyboard shortcuts, Auto-delete, Your data, Advanced and About. Hints are at most 2–3 lines.
  - **Pet** (H1–H4): the focus timer sits below the pet in the pet's own pixel style; hover-card tasks keep their colours and open the Tasks page when clicked; the card's **Focus** button opens the Focus tile on Today; play/pause and next-track buttons beside the timer (Windows media keys only, no browser extension; Unverified).
  - **Time** (I2): two views — **General** (exactly as before) and an **Analytics** dashboard, switched by a button.
- Tests: front-end 280 passed / 5 skipped, Rust 412 core + 29 shell passing.
- Added (2026-10-26): **rename a project** (pencil beside its name); every task and note under it follows. Archived notes are not renamed.


## [0.4.0] — 2026-10-25 (draft for owner testing; Unverified)

The UI reset batch 1 below, the File Explorer, Save and hello fixes, and reminder sounds. Database update 007 (backed up automatically before migrating).

- Changed (2026-10-25, owner's UI reset batch 1; OS parts Unverified):
  - **Today**: four clean tiles, Today, **Focus** (its own tile with − / + length, 15/25/50 and a task to focus on), Daily routine, Time today and Links. **Activity** and **Done this week** removed; roomier spacing in every tile. The Today list is grouped Overdue / Tasks / Reminders and an overdue task says "**N days overdue**". **Quote of the day**, large, beside the greeting; add, edit and delete your own quotes; built-in public-domain quotes can be turned off.
  - **Task editor** rebuilt: title and actions on top; details, links, work updates and history on the left; on the right one card per setting, each with one line saying what it is for (When, Deadline, Reminder, Priority, Project, Note). Nothing hidden. Clicking a task on Today opens the same editor (the small pop-up editor is gone). Duplicate date buttons removed (on a Saturday "Today" and "This weekend" were both lit).
  - **Focus length per task** (− / + in steps of 5, remembered). **Task reminders**: when it starts, "5 min before" with − / + (up to a day), and sound on/off; several per task, listed in the task. Reminder notifications now **play a sound** (Windows toasts were silent because no sound was named).
  - **Tasks** page: a large **Next 7 days** tile under the list; tasks open from it. **Notes**: the week removed, Today and Links wider (link names readable), even spacing in cards, a **formatting toolbar** (bold, italic, heading, numbered list, bullets, checklist, font: Sans / Serif / Mono) and **Own window** to keep writing in a separate window.
  - **Projects** tab: a project's tasks and notes together, numbered, with progress; add tasks and notes into it; notes can belong to a project (migration 007).
  - **Characters**: Bolt, Ghosty, Mochi and Pip ship with Pluto and can be used as the pet (they were preview-only). The preview-only section was removed.
  - **Small windows**: below 1024 px the sidebar shows icons only and page headers wrap.
- Database (2026-10-25): migration **007** — `notes.project`; `reminders.task_id`, `lead_min`, `sound`. Backed up automatically before migrating.

- Fixed (2026-10-25, Unverified on Windows): **File Explorer counted while unused** — Windows draws the desktop, taskbar, tray and Alt+Tab with `explorer.exe`, so they were recorded as File Explorer. Now only real folder windows (`CabinetWClass`) count; the rest records nothing (`pluto_core::usage::is_shell_surface`). macOS has the same effect with Finder when you click the desktop; not changed yet.
- Fixed (2026-10-25): task editor **Save** is never a dead button — with nothing changed it just closes the task (before, it was greyed out and a click did nothing). An empty title says so instead.
- Fixed (2026-10-25): the **daily hello** could show more than once when several checks started together (page re-renders, focus and wake at the same moment). One check runs at a time and reads the saved state.
- Docs (2026-10-25): **UI preview** for the owner's UI reset — Today, Tasks week view, task editor, Notes, note editor with pop-out, Projects, Character, Settings, Time per app, pet states (timer below the pet, hover card, music controls). Preview only; no screen changed.

## [0.3.0] — 2026-10-23 (draft for owner testing; Unverified)

Everything below "Unreleased" up to v2.0.0: notifications above the pet, task links / stars / chosen days / repeating tasks, focus sessions with the timer by the pet, hover-card shortcuts, auto-delete with a task Bin, date presets, editable pet shortcut, Time tile layout, open tabs on the Time page, pet-visibility fixes, macOS Arc/Firefox/Safari, pet library with ZIP import, companion features. Database updates 004–006 (backed up automatically before migrating).

- Added (2026-10-23, Unverified): **Time tile layout** (FR-44): Wide list / Even / Stacked and Short / Medium / Tall, remembered; every choice fills the row (snapped presets, not free dragging). **Open tabs always on the Time page** (FR-62), with a one-click "Turn on app and website time" when tracking is off.

- Added (2026-10-23, Unverified): **date presets** (FR-45) under date fields — Today, Tomorrow, This weekend, Next week, In 3 days — and time presets for reminders — In 1 hour, This evening, Tomorrow 9:00, Monday 9:00 (task deadline and planned day, quick edit on Today, reminders, meeting follow-up). **Pet shortcut is editable and off by default** (FR-48, setting `shortcuts.global_pet`); the pet menu shows it only when set. Note: people who used Ctrl/⌘+Shift+P before need to set it again in Settings.

- Added (2026-10-23, Unverified): **auto-delete** (FR-46) in Settings: app/website time and completed tasks, each Never (default) / 30 / 90 days / 6 months / 1 year; a stricter rule first shows what it would do and asks; runs at start, every 6 h and after wake. Completed tasks go to a new **task Bin** (migration 006) with Restore / Delete for good, emptied after 30 days; time history is deleted. Notes, meetings, reminders and open tasks are never touched.

- Fixed (2026-10-23, Unverified): FR-43 — when the card or bubble fits neither above nor below the pet (short screen), it opens on the side with more room instead of always below and off-screen; same for left/right.

- Added (2026-10-23, Unverified): while the pet is **hidden**, messages show in the dashboard instead (bottom-right, max 3, with Undo); **hover-card shortcuts** — Focus 25 / Stop focus, Add note, Sleep / Wake (a nap that lasts until Wake or a click) — and **tasks highlighted** on the card (tinted rows, starred marked) (FR-111). New shell command `pet_command` (new-note / new-task only).

- Added (2026-10-23, Unverified): **focus sessions** (FR-05): start 15/25/50 min from Today or 25 min from a task; pause, +5 min, stop; saved (migration 005, `pluto_core::focus`), one at a time, a session that ran out while Pluto was closed is finished at the right time, stopped sessions keep their minutes. **Focus timer by the pet** (FR-110): a small timer above or below the pet while a session runs, with pause; the hover card's header shows it too; when focus ends the pet cheers "Nice: 25 min on … Break 5 min?" and a click starts the break. New setting **Card when I hover the pet** (`pet.hover_card`, on): off shows the same facts as a short bubble. Fixed: with the card off, hovering showed no bubble.

- Added (2026-10-23, Unverified): **links on a task** shown as chips next to its title, any number per task, opened only after the safe-link check (FR-106); **stars** on tasks and reminders, starred first on Today and Tasks (FR-107); **chosen days** — a task planned on several specific days shows on Today on each (FR-108); **repeating tasks** (every day, days of the week, every N days, optional end) ticked one day at a time, with the last repeat days shown ticked / not ticked and late ticks allowed, and an evening bubble "Still open today: …" through the nudge budget (Settings → Pet notifications) (FR-109). Core: migration 004 (`task_links`, `task_days`, `task_ticks`, `starred`, `repeat_rule`, `repeat_until`), `pluto_core::task_plans`, event `TaskTicked`. Fixed: the routine reminder appeared twice above the pet.

- Docs (2026-10-23): student-pack preview redesigned (Study with plan-vs-done and local suggestions, Timetable with now line, free slots and clashes, Study group with privacy defaults) and a **now strip** preview (FR-88) added; spec draft `docs/features/FR-88-now-strip.md` with four open questions. No code changed.

- Changed (2026-10-23, Unverified): **notifications only above the pet** (owner; supersedes the FR-41 toast stack). Every message the dashboard used to pop up is now a bubble above the pet with a matching pose (cheer, wave, wait, worried); errors stay 8 s. Actions ride in the bubble — "Moved to Bin · click: Undo", "Reminder: … · click: Done" — and clicking the pet runs them. Removed the toast stack and the `sonner` dependency. New pet-window channel `pet://action`. Fixed: the leftover in-dashboard reminder card.

- Fixed (2026-10-23, Unverified): **pet not coming back** (B1-B6, S1): an OS close no longer turns "Show the pet" off; Show/Hide follows what is on screen; the pet re-applies after missed events, after the PC wakes (once-a-minute wake watcher) and when screens change or the display scale changes; tray **Bring the pet back**; saved spot must have the pet's centre on a screen; window errors are logged; routine reminder and greeting re-check on wake. Added (macOS, Unverified): website time and open tabs for **Arc** (AppleScript, private windows skipped), **Firefox** (its session file — private windows never in it; tabs read-only), **Safari** behind a new opt-in switch `tracking.safari` (Safari can't tell private windows apart); tab listing no longer starts a browser that isn't running.
- Added (2026-10-23, Unverified): **Import ZIP** in the pet library (`pluto_core::pets::install_zip`: pack at the top or in one folder, only pet.json + spritesheet unpacked, unsafe paths/links/oversize refused; the owner's Kayadu pack imports); **Settings → Pet notifications** (nudges a day, time between, quiet hours on/off and times). Docs: pet-visibility bug report (not fixed yet), OS parity table, growth plan FR-98…FR-103 (festival outfits, weekly recap, study groups, leaderboard visibility Off/Friends/Everyone, monthly pet drops, photo-to-pet), student-pack preview published; docs now say the active work is FM-V2 + companion (was M1).
- Added (2026-10-23, Unverified): **notification budget** (FR-96: each kind once a day, ≤4 unasked nudges a day, ≥1 h apart, quiet hours 22:00-08:00; the routine reminder goes through it); **forgiving routine progress** "N/7 this week" replacing the resetting streak (FR-90); **no-guilt copy check** test (FR-92); **About you and your pet** on the Character page — name, birthday (day+month), the pet's birthday = the day you met, its age (FR-93); **hello once a day** above the pet, birthdays first (FR-94). Docs: companion principles, attention ladder, study-hours coverage, earned growth and attraction ideas, backup plan (`docs/features/FR-92-97-companion-principles.md`).
- Added (2026-10-23, Unverified): the routine reminder also appears **above the pet** (dashboard → pet message channel `pet://say`, FR-43/FR-85); tasks converted from a meeting's action item are **planned for today and show on Today with the meeting named** (FR-52). Decision: Supabase for the community backend (FR-84).
- Added (2026-10-23, Unverified): **toast stack** (FR-41: bottom-right, max 3, 5 s / errors 8 s, close button; Task added / saved / done; saving a task returns to where it was opened) and **Daily routine tile** on Today (FR-85: habits reset daily, progress ring, streaks, reminder "You have N daily routine tasks pending" once a day at a chosen time). Docs: pet art spec + prompt, FR-84…FR-89 specs, market research, direction check, GTM sheet, monetization.
- Tests (2026-10-22): desktop pet shows the chosen pack and falls back to the bear; `TESTS_NEW_FEATURES.md` lists every automated test and manual Windows step for FR-63, FR-47, FR-61, FR-42.
- Added (2026-10-22, FR-42, Unverified): a task can **open its linked note** or **make a new note from itself**; a note lists its **Linked tasks**, each opening the task; the **Links card is in Notes** too (V2-08). Core: task filter by `note_id`.
- Removed (2026-10-22, FR-47): the Log detail and Log files rows in Settings (logging itself stays on). Added (FR-61): rename a link and change its address in place from the Links card (pencil button; invalid address refused; Esc cancels). Unverified on Windows.
- Added (2026-10-22, Unverified): **Pet library** (FR-63, first slice) — Character page lists Codex/OpenPets pets found in `~/.codex/pets` and lets you import a pet folder; preview plays the pack; "Use" makes it the desktop pet, with reactions mapped to the OpenPets rows (`pluto_core::pets` checker, `pets_*` commands, `pet.pack` setting, `SpritePet`). Also scans `~/.petdex/pets`. ZIP import not yet. Licence: MIT (`LICENSE`); art CC BY 4.0. Docs: owner answers on blockers, light local-AI options, name suggestions.
- Removed (2026-10-22): unused components `separator.tsx`, `tabs.tsx`, `charts/Ring.tsx`; committed pack PNG previews. Docs: superseded files moved to `docs/archive/`, documentation map, blockers guide, FR-83 role profiles; planning closed.
- Docs (2026-10-22): all OpenPets features planned (FR-59…FR-82) with specs in `docs/features/FR-openpets-parity.md`; MASTER_PLAN updated with a parity table; stale FR-41/43/49 specs marked superseded.
- Docs (2026-10-22): `MASTER_PLAN.md` (phases, milestones, features with done-when), OpenPets source research, V2-16 rename links logged. Changed: pack `pet.json` holds only the OpenPets fields; extras in `pluto.json` (Unverified).
- Changed (2026-10-22, Unverified): packs now ship `spritesheet.webp` (the Codex/OpenPets standard) and `pet.json` points at it; OpenPets format research recorded; owner answers Q1, Q4, Q5; AI provider on hold.
- Added (2026-10-22, Unverified): drawn sprite poses `jump`, `sad` and `review` for Pluto, Mochi, Pip, Bolt and Ghosty (clipboard, tear, sad brows); the jumping, failed and review rows now use them, running-left is mirrored and re-lit; packs regenerated. Docs: owner answers Q2, Q3, Q6 and auto-chosen D-SIZE, D-LICENCE, AI provider.
- Added (2026-10-22, Unverified): sprite-pack layout (`spritePack.ts`, tests), an opt-in pack exporter and `scripts/svg-to-png.mjs`, and generated packs for Pluto, Mochi, Pip, Bolt, Ghosty under `packs/` (8x9 atlas of 192x208 cells; rows with no drawn art are marked `derived`). Not used by the app yet.
- Docs (2026-10-22): V2 issue log (`docs/V2_ISSUES.md`), specs FR-41..FR-58 (`docs/features/FR-v2-features.md`), owner decisions recorded, student-first delivery order approved in ROADMAP.md; no code changed.
- Docs (2026-10-22): OpenPets competitor audit and project state report with a proposed student-first order; no code changed.
- Added (2026-10-22, Unverified on a real PC): bear three-quarter, back and look-back views (`BearViews.tsx`, drawn, not mirrored), `playEmote` sequence runner with cancel and reduced-motion handling, and a "Play back-turn shake" preview on the Character page. Tests added. Owner decisions on emotes recorded; milestone rules planned in EM-06; Rive trial recorded as blocked.
- Added (2026-10-22, Unverified on a real PC): drawn three-quarter, back and look-back views for the four built-in characters Mochi, Pip, Bolt and Ghosty (`CharacterViews.tsx`), each with a "Play back-turn shake" preview on the Character page; `playEmote` now works for any character. Tests added (`CharacterViews.test.tsx`). Personal-photo characters get no back-turn shake.
- Docs (2026-10-22): Emote and Reactions System specified (FR-40, `docs/character/EMOTE_FEATURE_SPECS.md`): registry, state machine, Emotes menu, eight emotes, fallbacks, accessibility. Feasibility added to the character research (§14): the current bear has no back or three-quarter view, so `back_turn_shake` stays unavailable until art exists. Owner decisions recorded (limited release OK, Peekoo reference, full-image motion later, no GPU). No code changed.

- Docs (2026-10-19): owner's `v2.0.0` release recorded; feature document extended with FR-37 (keyboard-shortcut master switch, off by default; currently shortcuts are on by default) and FR-38 (Meetings redesign, deferred). Branch cleanup: `main` is the only branch to keep. Code signing on hold. No code changed.

- Docs: added `FEATURE_ROADMAP.md` (audit of the code and tests, full requested-feature inventory FR-01…FR-36, milestones FM-0…FM-12, test matrix, release gates) and `docs/features/FR-requested-features.md` (one 13-point spec per feature). No code changed; no feature was built. Corrected stale test counts in PROJECT_STATUS (376 Rust, 111 frontend).

- Added: **Privacy radar** panel on Time › Sites (U16 option d, no request tracking): which visited sites are known ad/tracking companies, time on them, and sites by category. Sites carry an `is_tracker` flag (new field on `DomainUsage`) and show a "Known tracker" tag in the list. Wording says "not flagged", never "clean". **Unverified** with real browsing.
- Fixed: the empty Sites message told Mac users to browse in Firefox, which Mac does not record; it now lists the browsers each OS can read.
- Docs: Windows/macOS parity audit (PROJECT_STATUS §4.8).

## [0.2.0] — 2026-10-18 (Phase 2 test build; unsigned, nothing here is verified on a real PC)

Phase 2 (M3) is feature-complete as far as it can be without a real OS: app and website time, open tabs (no extension), macOS collector, and a known-tracker check for the sites you visit. Every OS-facing part is **Unverified**; the release exists so the owner can test it. See `desktop-pet-docs/RELEASE_0.2.0_TEST.md`.

- CI (R11): **confirmed fixed** — the Windows End-to-end run on `ecfb4e8` finished green, so the debug-flag forwarding was the cause.
- Added: `is_known_tracker` in the core, a fixed list of advertising and tracking domains (DECISIONS U16 option d: the address bar shows the visited site, never the requests it makes, so this flags visited sites only). `false` means "not on the list", never "clean". The report UI is M11.
- Version bumped 0.1.3 → 0.2.0 (owner decision: stay on 0.1.3 until Phase 2 is done).

- CI (R11): root cause found in wry's source. It always sets WebView2's browser arguments, which overrides the `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` variable msedgedriver uses for `--remote-debugging-port`. Pluto now appends that variable to its window arguments on Windows (no effect when unset). **Unverified** until the Windows e2e job runs.
- CI (R11): the first full run after the process-tree fix (881b532) fails the same way. The driver log shows the WebView2 arguments are set by chromedriver itself, and no leftover process exists after the job. Process-tree theory ruled out for now.
- Docs: assistant notifications now use a pet bubble as the primary channel; quiet mode shows bubbles for assistant events; U17 answered (auto-edit settings with backup); U20 partly answered; U23 added.

- Docs: plan for AI assistant completion notifications (Claude Code hooks first): architecture, nine features with acceptance criteria, privacy rules, platform matrix, and open questions U17–U22. No code yet.

- CI (R11, Windows end-to-end): the probe shows WebView2 starts but the debugging flag never reaches it even when set by hand. Likeliest cause: the earlier smoke-test step killed only `pluto.exe`, leaving the WebView2 browser process running on the same profile folder; later launches join that process and ignore their flags. The smoke test (and the probe) now stop the whole process tree, and a step clears any leftovers before the probe and the end-to-end run. **Unconfirmed** until the next Windows run.

- Changed: the Apps / Websites lists on Today are clearer: a category-coloured chip with the first letter, bolder times, a total per column, softer bars and a fade at the bottom instead of a scrollbar with arrows. The empty Websites text no longer mentions a browser extension (there isn't one); it explains website tracking and offers the switch.

- Fixed (CI): a frontend test ("Yesterday: … still open" on Today) failed on the macOS runner because the line took 1.3 s to appear and Testing Library waits 1 s by default. Raised that wait to 5 s for every test (`src/test-setup.ts`).
- CI (R11, Windows end-to-end): the verbose driver log shows the real failure: Pluto launches, but WebView2 never opens the debugging port the driver asks for, and no `DevToolsActivePort` file is written anywhere. The Defender exclusion from earlier did not help and is kept only because it is harmless. Added a 40-second probe step that starts Pluto with the debug flag itself and reports whether WebView2 starts and whether the flag reaches it, to pick the fix.

- Fixed (CI): the Windows end-to-end job has failed every run with "session not created: DevToolsActivePort file doesn't exist" since F1-27 (R11). The driver's own log showed Pluto launching three times, each attempt about a minute apart, with the matching Microsoft Edge Driver version already correctly detected — ruling out a version mismatch. The remaining explanation is Windows Defender's real-time scan of the freshly-built debug `.exe` taking longer than chromedriver/msedgedriver's internal wait for its debug port, which only has to happen once per CI run but blocks every test. Excluded the build output from that scan; also made the smoke-test step wait for the app to fully exit (WebView2 subprocess tree included) before the next step runs, so a slow teardown can't bleed into the end-to-end run. **Not yet confirmed green** — the next CI run on this branch is the test.

- Fixed: dragging the pet by pressing on the bear itself could fail; a press anywhere in the pet window now arms the drag, not only the bear's own small hit area. Clicking (as opposed to dragging) is unchanged — it still only opens/hides Pluto from the bear itself, not from the card beside it. **Unverified** on a real PC (the earlier "line 13" fix only covered the card-open case; this widens it to the whole window).

- Added: **Open tabs** on the Time page (Sites view) — every open tab, read live, no browser extension (owner decision 2026-10-13: Pluto asks for the same permission already granted to read browser time and does it all itself). Close a tab from the list. Never stored. macOS (Chrome-family browsers) shows every tab's domain; Windows shows titles for every tab but a domain only for the one showing, since a background tab's page isn't rendered for UI Automation to read. Dropped from the roadmap: the Chrome/Edge extension and native-messaging bridge, no longer needed for this. **Unverified** on a real PC.

- Docs: milestone roadmap redesigned around the owner's 2026-10-13 core-features list. New milestones M4 Universal Quick Actions, M5 Context-aware writing & prompt assistant, M7 Meeting-to-action (AI), M8 Focus & digital wellbeing, M11 Privacy-radar report. Renumbered: old M4 Desktop companion → M6, old M5 Developer → M12, old M6 MCP → M10, old M6b CI status → M10b, old M7 Voice → M9, old M8 Character → M13. No code changed. Four open questions for the owner in `DECISIONS.md` (U12–U15): AI provider for M5, whether M12 Developer reactions is still wanted, confirming Voice-before-MCP (changes part of locked ADR-015), and whether the Privacy-radar report should ship with M3 instead of M11.

- Added (macOS parity): **app tracking on Mac** (the app in front, once a second; idle from the system; no permission) and **website tracking on Mac** for Chrome, Edge, Brave and Vivaldi via AppleScript (macOS asks once per browser; incognito windows skipped). Safari, Firefox and Arc are not counted on Mac: Safari can't say whether a window is private; the other two can't be asked. More Mac app names recognised (Word, Zoom, Finder…). **Unverified**: built and compiled for macOS, never run on a Mac.

- Added: **Track websites (domain only)** in Settings › Privacy and tracking (off by default, needs app tracking). On Windows, Pluto reads the address bar of the browser in front every 2 s and keeps only the site's name (github.com); paths, searches, browser pages and files are dropped. Private/incognito windows are skipped. Time shows on the Time page per site. No extension needed. **Unverified** on a real PC; macOS not yet.

- Added: the pet keeps waiting, laptop open, while a text box is focused in the app you're using, and puts the laptop away 1.5 s after you leave it (at most 5 min). Windows: text-caret check, no permission. macOS: needs Accessibility; without it, the old 20 s wait. Only "is a text box focused" is read, never its contents. **Unverified** on a real PC.

- Added: **Type along with me** (Settings on the Character page, off by default). When you type in any app, the bear takes a laptop out of its pocket and types too; when you stop it looks up at you and waits, then puts the laptop away after 20 s. Only key presses are counted, never which keys; nothing is saved or sent. Windows: keyboard hook; macOS: system key counter (asks for Input Monitoring). **Unverified** on a real PC.
- Changed: the laptop is now graphite, seen from behind (glowing teal logo, screen light on the face) with the paws reaching over the lid; the bear got the same 3D lighting as the new characters. All four new characters have the typing and waiting poses; Ghosty redrawn (gumdrop shape, curling tail, soft inner glow, bigger eyes).

- Added (preview): four new characters (Mochi the cat, Pip the penguin, Bolt the robot, Ghosty the ghost), drawn with 3D lighting shown on the Character page, each with idle / typing / cheer / sleep poses. Not selectable yet.
- Added: the bear's "typing" pose (opens a laptop and taps along). Not yet triggered by real typing.

### 2026-10-12 (M2: end-to-end tests, F1-27)
- Added: **end-to-end tests** on the real app (`pnpm e2e`): a fresh install shows the welcome screen; add a task; write a note; log a meeting and convert its action item to a task; restart and check everything is still there. Runs on Windows in CI (*End-to-end* workflow) through WebDriver; macOS gets a launch smoke test (`pnpm e2e:smoke`), because Apple has no WebDriver for the app's webview.
- Added: `PLUTO_DATA_DIR` environment variable: keeps Pluto's database and logs in that folder (the tests use a fresh temporary one, never real data).

### 2026-10-12 (M2: Today, shortcuts, settings)
- Added: **"Yesterday: X of Y done · N still open"** under the greeting on Today; a click opens Tasks on yesterday's unfinished tasks.
- Added: change the global shortcuts for Open/hide Pluto and New note in Settings › Keyboard shortcuts (press the keys, Esc cancels, clashes refused, Reset). They apply at once.
- Added: Settings › Your data shows where the database is, with Open folder. Settings › Advanced: log detail (Low/Normal/Debug, applies at once), Open logs folder, Reset settings. About lists the open-source projects Pluto uses.
- Fixed: **the app never wrote a log file or crash report** — the logger existed but was never started. Now it starts first thing.
- Fixed: Character › "Always on top" had no effect on the pet window.

### 2026-10-12 (M2: meetings F1-17…19; shortcut removed)
- Added: **Meetings** page (sidebar, `Ctrl+5`; `Ctrl+M` starts one). List newest first with participant and date filters. The editor saves itself: title, time, participants (suggested from earlier meetings), Markdown notes, decisions and action items (add, edit, remove, reorder), follow-up date. **Convert to task** makes a task (project = meeting, due = follow-up, assignee in the description) and the item shows that task's status live. Deleting a meeting keeps its tasks.
- Added: "Log a meeting" on the welcome screen.
- Removed: the global shortcut `Ctrl+Shift+T` (owner). The in-app `Ctrl+T` stays.
- Fixed: a due reminder showed two toasts inside Pluto; now one, with Done and Snooze.
- Tests: fixed a test race (Delete all fired before the page listened for events).

### 2026-10-12 (M2: first run, F1-26)
- Added: **welcome screen** on a fresh Pluto (and after Delete all): hello from the bear, "Add your first task" or "Write a note", and three choices — show the pet (on), track app time (off), open at login (off). Shown once; never to someone who already has notes or tasks.

### 2026-10-12 (owner's test of 0.1.3; no version change: next release after Phase 2)
- Fixed: reminders can be edited (text, time) and snoozed (10 min, 1 hour, tomorrow 9 AM) from Today and the Notes strip. A new time makes the reminder ring again.
- Fixed: the pet can be dragged while its card is open. The window is dragged as it is (shrinking it first lost the grab), the card hides during the drag, and the pet's new spot is saved.
- Changed: reminder alerts no longer rely only on the system notification: failures are logged, Pluto flashes in the taskbar, the pet rings for 15 s, and an in-app alert offers Done and Snooze. New Settings › Notifications with "Send a test notification" and "Open notification settings".

### 2026-10-11 (0.1.3 — owner's test of 0.1.2)
- Fixed: the pet "always slept". It slept by the clock (23:00–06:00), which is when the owner works. It now sleeps only after 15 minutes with nothing happening (no hover, no click, no event from Pluto, no tracked app time) and wakes at once.
- Removed: the overdue reaction (owner's call). The worried pose stays for later use.
- Changed: version **0.1.3**.

### 2026-10-11 (0.1.2 — owner's test of 0.1.1)
- Fixed: scrollbars in the pet window. The hover card was taller than the space reserved for it (291 px vs 262), so the window scrolled. The card now has its measured size and the pet window never scrolls.
- Fixed: scrollbars everywhere are hidden until the pointer is over the area that scrolls.
- Fixed: Today overview tiles. The second row (Links, Activity, Done this week) was as tall as the first and "Done this week" overflowed sideways. Rows are now 15rem; Today and Total time span two rows.
- Changed: the bear is redrawn "soft 3D": form shading, warm rim light, contact shadows, blurred ground shadow, squash-and-stretch.
- Added: **pet reactions** with a 3-second speech bubble. Task added → catches a card; task done → jumps ("Done! 2 left today"); last task done → party with confetti; task started → works on a laptop (and keeps working while any task is in progress); task overdue → worried with a sweat drop; reminder due → rings a bell; task deleted → tosses a paper ball. One table (`src/pet/reactions.ts`) holds them all; adding one is one line.
- Added: Character page previews every pose.
- Changed: version **0.1.2**.

### 2026-10-11 (0.1.1 — fixes from the owner's first test)
- Added: **desktop pet** (F1-22). An animated bear in its own transparent, always-on-top window, bottom-right by default. Hover shows today's card: total time, top 3 apps, top 2 tasks, next reminder, done/open counts. Click opens Pluto, double-click hides it, right-click opens a menu (open/hide Pluto, new note, new task, app tracking on/off, settings, hide pet, quit). Drag to move; the spot is remembered. Also in the tray menu. **Unverified** on a real desktop.
- Added: global shortcuts `Ctrl+Shift+L` show/hide Pluto, `Ctrl+Shift+N` new note, `Ctrl+Shift+T` new task, `Ctrl+Shift+P` show/hide pet (`Cmd` on macOS).
- Added: Settings › Desktop pet (show, size, opacity) and Settings › Keyboard shortcuts.
- Added: delete for **any** task: a trash button on Tasks and Today rows (click twice to confirm) and in task detail. Unfinished tasks are cancelled first.
- Changed: the main window opens at 1180×760 instead of full screen and remembers its size and position.
- Changed: calmer colours: clearer card edges, stronger secondary text, darker dark-mode background.
- Changed: version **0.1.1**.

### 2026-10-11 (release automation)
- First release build ran green: release `v0.1.0` has the Windows `.exe` and `.msi` and an Apple Silicon `.dmg` attached. It is shown as **published** (13:10 UTC); the workflow itself only makes drafts. Not yet tested by a person.
- Changed: version bumped to **0.1.0** (package, Tauri, Cargo workspace); Settings › About now shows the real version.
- Added: the release workflow starts by itself when the version in `src-tauri/tauri.conf.json` changes on `main` (also on a `v*` tag push or by hand). It builds the Windows and macOS installers and creates a **draft GitHub Release** `v<version>` with them attached; it does nothing if that release already exists. Publishing the draft (one click) creates the tag. Reason: this session cannot push tags or start workflows.

### 2026-10-11 (M1 build-out)
- Merged: PR #1 into `main` (`3cdaa9e`).
- Fixed: CI failed before 08:30 UTC because the frontend demo data depended on the time of day; fixed with a regression test (`3ed177f`). Also fixed a race that made the demo shell create two copies of itself.
- Added: **Autostart** (F0-09): login item with `--hidden`, quiet start in the tray, reconcile with the system at startup.
- Added: **Tasks page** with Today, Upcoming, Pending, All, Completed, filters and search; **task detail** with status buttons, defer, project, linked note, history, **work updates** (new core code, 5-minute delete window), delete for finished tasks. New commands: `task_get`, `task_history`, `task_defer`, `task_delete`, `work_updates_list`, `work_update_add`, `work_update_delete`; `TaskEdit` now carries the whole task.
- Added: **Markdown preview** in the note editor; **Manage labels** (rename, delete); editor shortcuts `Mod+D`, `Mod+E`, `Mod+Shift+A`, `Mod+L`; app shortcuts `Mod+1…4`, `Mod+,`, `Mod+T`.
- Added: **Daily log** list on the Time page (last 14 days, change vs the day before, copy as Markdown).
- Added: **Export, import, delete all data** (F0-11): core module `data.rs` with 9 tests; Settings › Your data; the file dialogs are opened by Rust.
- Added: Release build workflow and installer config; coverage floors in CI.
- Changed: the calendar on Notes shows the next 7 days; PRD v1.5 (autosave 500 ms, Bin instead of confirm-delete, history on the Time page, no Progress card); ADR-001 (RAM) renamed ADR-020; removed the unused `TodayCard`.
- Docs: `PROJECT_STATUS.md`, `ROADMAP.md`, `DECISIONS.md` brought up to date.

### 2026-10-11 (audit)
- Docs: audit of the whole project. Added `PROJECT_STATUS.md`, `DECISIONS.md`, this file; rewrote `ROADMAP.md` around milestones M0–M8 with M1 (notes + daily work) as the first release; added `CLAUDE.md` with the session protocol; fixed stale status lines in the README files.

### 2026-10-05
- Added: drag-and-drop to reorder Today overview tiles, with keyboard support, saved order and "Reset layout" (`86b18f0`).
- Added: edit a task from Today: title, priority, deadline, reminder. New `task_update` command and `TaskEdit` type (`4bacfbb`).
- Added: browsers list their sites with time under the browser in the total-time tile (`4bacfbb`).

### 2026-10-04
- Changed: Today overview lists every app and website under the total time; the stat strip and the category legend are removed (`183934f`).
- Added: large "Total time today" tile, Apps and Sites lists, a separate Links card; removed the Progress tile and "Coming up" (`7f9deed`).
- Added: Notes quick-capture bar ("Take a note…") and a header row on the list layout (`7f9deed`).
- Added: opt-in app and site time tracking (Windows collector, usage tables, migration 003), link opening, generated types (`72d06f1`).
- Added: Time page filters (period, category, apps/sites), shortcuts, Notes top tiles (`21c9391`).
- Added: week calendar on Notes; Today and Overview merged into "Today overview" with an Activity feed (`919004f`, `8586a34`).
- Changed: Reminders merged into Today; Bin reached from the sidebar (`b30444e`, `91cbf78`).
- Added: notes search, Bin (soft delete, restore, purge, 30-day janitor), reminders with a scheduler and OS notifications (`b5428ab`, `a2cd81a`).
- Added: Notes screen on shadcn-style components and Tailwind v4, then a professional neutral theme with search, Bin, reminders and a full sidebar (`ed39f08`, `81e0824`).
- Added: static HTML design prototype with the Pluto bear (`9b1b573`).
- Added: F0-08 tray menu registry, close-hides, quit flow, single-instance plugin; settings persisted (`d8493a8`, `308d046`).
- Added: F0-07 settings schema, validation, service, Tauri IPC commands, frontend types and client (`fde3b47`, `dbb0e02`, `68ac7ec`, `410d672`).
- Fixed: frontend lint, Rust formatting (`83f893d`, `0f02047`).

### 2026-10-03
- Added: F1-14 task views and F1-15 daily log (build, freeze, reconcile, freezer) (`91c2acf`, `29b2d5c`).
- Added: CP3 tasks core: model, state machine, history, defer, delete rule (`5a2326b`).
- Added: CP2 notes core: notes, labels, pin, archive, delete with undo (`7e3a0dc`).
- Added: F0-06 injectable clock and midnight-rollover scheduler (`65b6ff8`).
- Added: F0-05 database writer thread and read pool; F0-04 database open, migrations, integrity check (`3616b80`, `51b57d8`).
- Added: F0-03 event bus; F0-13 error model, rotating logs, panic hook (`d6c7694`, `f9b39af`).
- Added: F0-02 CI matrix and V-2 RAM measurement; F0-01 Tauri v2 + React/TS/Vite scaffold (`76532b9`, `e579860`).
- Added: `ROADMAP.md`; CP1 feature specs (`6f4dc06`, `20bd4d1`).
- Changed: global search removed from v1 (ADR-017); phase order Developer → MCP → Voice (ADR-015); CI status moved to Phase 5.1 (ADR-016); D0–D7 locked (`20bd4d1`, `eb8926a`, `c931107`, `7648b89`).
- Fixed: `pluto-core` did not compile as a plain library (`7b19c2d`).
- Docs: project documentation added (`d90d7ae`, the only commit on `main`).
