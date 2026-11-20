//! Open tabs, read on request — no browser extension (owner decision 2026-10-13: "we will allow
//! users to give permissions to our pet and it does it all").
//!
//! This reuses the same permission as `tracking.sites` (both switches on): if the person hasn't
//! allowed Pluto to read their browser for site *time*, it won't read their open tabs either. The
//! list is never stored — it's read fresh each time the panel opens, like a task switcher, not
//! usage data.
//!
//! * **Windows**: UI Automation on the browser window in front, or, when something else is in
//!   front (Pluto's own window when you look at the Open tabs panel, the pet), on the top-most
//!   visible browser window (owner 2026-11-20: the panel was empty because Pluto itself was in
//!   front, and Tab Tantrum only reacted while the browser was). Every tab's title comes
//!   from the tab strip, which is always rendered. The domain is only readable for the tab that
//!   is actually showing — a background tab's page isn't rendered, so there is nothing for UI
//!   Automation to read from it. Closing a tab invokes its own "Close" button in the tab strip
//!   (Chromium exposes one per tab for accessibility tools), found fresh each time — nothing is
//!   cached across calls.
//! * **macOS**: AppleScript, for the same Chrome-family browsers as `sites.rs`. Unlike Windows,
//!   the browser's own scripting dictionary lists every tab's URL directly, across every window,
//!   without switching to any of them — so every tab gets a domain, not just the active one.
//!   Incognito windows are skipped entirely, same rule as `sites.rs`. Safari and Firefox aren't
//!   scriptable this way and are skipped, same as `sites.rs`.
//! * Elsewhere: an empty list.
//!
//! Unverified on a real Windows or Mac PC.

use std::sync::Arc;

use pluto_core::error::Result;
use pluto_core::settings_service::SettingsService;
use pluto_core::sites::OpenTab;
use serde_json::Value;
use tauri::State;

/// Both switches on, the same gate `sites.rs` uses for the time it records.
async fn allowed(settings: &SettingsService) -> bool {
    let all = settings.get_all().await.unwrap_or_default();
    let on = |k: &str| all.get(k).and_then(Value::as_bool) == Some(true);
    on("tracking.apps") && on("tracking.sites")
}

/// Every open tab in the browser Pluto can currently read. Empty, not an error, while the
/// switches are off or on a platform with no reader.
#[tauri::command]
pub async fn pet_open_tabs(settings: State<'_, Arc<SettingsService>>) -> Result<Vec<OpenTab>> {
    if !allowed(&settings).await {
        return Ok(vec![]);
    }
    Ok(tauri::async_runtime::spawn_blocking(os::list)
        .await
        .unwrap_or_default())
}

/// The most tabs any one browser window has right now (the front window on Windows; on macOS, the
/// fullest window), or `None` when nothing can be read: the switches are off, no supported browser
/// is open, or it is not the window in front. Used by Tab Tantrum; the list itself is not kept.
pub async fn busiest_window(settings: &SettingsService) -> Option<u32> {
    if !allowed(settings).await {
        return None;
    }
    let tabs = tauri::async_runtime::spawn_blocking(os::list).await.ok()?;
    let mut per: std::collections::BTreeMap<(String, u32), u32> = std::collections::BTreeMap::new();
    for t in &tabs {
        *per.entry((t.browser.clone(), t.window_index)).or_default() += 1;
    }
    per.values().copied().max()
}

/// A plain-text account of what Pluto sees in the browser (Windows), to paste into a bug report:
/// tab counts, positions and which controls were counted. No page addresses. Empty switches give a
/// short note.
#[tauri::command]
pub async fn pet_tabs_report(settings: State<'_, Arc<SettingsService>>) -> Result<String> {
    if !allowed(&settings).await {
        return Ok("Turn on app and website time first.".to_owned());
    }
    Ok(tauri::async_runtime::spawn_blocking(os::report)
        .await
        .unwrap_or_default())
}

/// Close one tab. `false` if it couldn't be found or closed (it may have changed since the list
/// was read) or the switches are off; never an error for that — the panel just re-reads the list.
#[tauri::command]
pub async fn pet_close_tab(
    browser: String,
    window_index: u32,
    tab_index: u32,
    settings: State<'_, Arc<SettingsService>>,
) -> Result<bool> {
    if !allowed(&settings).await {
        return Ok(false);
    }
    Ok(
        tauri::async_runtime::spawn_blocking(move || os::close(&browser, window_index, tab_index))
            .await
            .unwrap_or(false),
    )
}

#[cfg(windows)]
mod os {
    use pluto_core::sites::{domain_from_address, OpenTab};
    use pluto_core::usage::{display_name, is_browser};
    use windows::core::{BOOL, BSTR};
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Variant::VARIANT;
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationInvokePattern,
        IUIAutomationSelectionItemPattern, TreeScope_Children, TreeScope_Descendants,
        UIA_ButtonControlTypeId, UIA_ControlTypePropertyId, UIA_InvokePatternId,
        UIA_NamePropertyId, UIA_SelectionItemPatternId, UIA_TabItemControlTypeId,
        UIA_ValuePatternId,
    };
    use windows::Win32::UI::Accessibility::{IUIAutomationValuePattern, UIA_EditControlTypeId};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, IsIconic, IsWindowVisible,
    };

    /// A fresh, one-off UI Automation client. Never shared across calls: each call is its own
    /// COM thread by way of `spawn_blocking`.
    fn client() -> Option<IUIAutomation> {
        // SAFETY: plain COM initialisation, scoped to this blocking task's own thread.
        if unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_err() {
            return None;
        }
        // SAFETY: creating the in-process UI Automation client, as documented.
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }.ok()
    }

    fn find_all(
        uia: &IUIAutomation,
        root: &IUIAutomationElement,
        control: i32,
    ) -> Vec<IUIAutomationElement> {
        // SAFETY: COM calls on this thread with valid arguments.
        unsafe {
            let Ok(kind) =
                uia.CreatePropertyCondition(UIA_ControlTypePropertyId, &VARIANT::from(control))
            else {
                return vec![];
            };
            let Ok(found) = root.FindAll(TreeScope_Descendants, &kind) else {
                return vec![];
            };
            let len = found.Length().unwrap_or(0);
            (0..len).filter_map(|i| found.GetElement(i).ok()).collect()
        }
    }

    fn find_child(
        uia: &IUIAutomation,
        root: &IUIAutomationElement,
        control: i32,
        name: Option<&str>,
    ) -> Option<IUIAutomationElement> {
        // SAFETY: COM calls on this thread with valid arguments.
        unsafe {
            let kind = uia
                .CreatePropertyCondition(UIA_ControlTypePropertyId, &VARIANT::from(control))
                .ok()?;
            let condition = match name {
                Some(n) => {
                    let named = uia
                        .CreatePropertyCondition(UIA_NamePropertyId, &VARIANT::from(BSTR::from(n)))
                        .ok()?;
                    uia.CreateAndCondition(&kind, &named).ok()?
                }
                None => kind,
            };
            root.FindFirst(TreeScope_Children, &condition).ok()
        }
    }

    fn tab_is_selected(tab: &IUIAutomationElement) -> bool {
        // SAFETY: COM call on this thread.
        unsafe {
            tab.GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(UIA_SelectionItemPatternId)
                .and_then(|p| p.CurrentIsSelected())
                .is_ok_and(|b| b.as_bool())
        }
    }

    fn active_tab_domain(bar: &IUIAutomationElement) -> Option<String> {
        // SAFETY: COM call on this thread; the value pattern of an edit box is its text.
        let text = unsafe {
            bar.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
                .and_then(|p| p.CurrentValue())
        };
        domain_from_address(&text.ok()?.to_string())
    }

    /// The browser window in front, and the UI Automation root for it. `None` if nothing
    /// trackable is in front.
    fn foreground_browser(uia: &IUIAutomation) -> Option<(IUIAutomationElement, String)> {
        // SAFETY: plain FFI call.
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_invalid() {
            return None;
        }
        let exe = crate::tracking::win::executable_name(hwnd.0)?;
        if !is_browser(&exe) {
            return None;
        }
        // SAFETY: COM call on this thread with a handle from the OS.
        let root = unsafe { uia.ElementFromHandle(hwnd) }.ok()?;
        Some((root, display_name(&exe)))
    }

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        // SAFETY: `lparam` is the `Vec` passed to EnumWindows below, alive for the whole call.
        let out = unsafe { &mut *(lparam.0 as *mut Vec<HWND>) };
        // SAFETY: plain window calls on a handle the OS just gave us.
        if unsafe { IsWindowVisible(hwnd) }.as_bool() && !unsafe { IsIconic(hwnd) }.as_bool() {
            out.push(hwnd);
        }
        true.into()
    }

    /// Every visible, not minimised top-level window, top of the stack first.
    fn visible_windows() -> Vec<HWND> {
        let mut out: Vec<HWND> = Vec::new();
        // SAFETY: the callback only runs during this call and `out` outlives it.
        let _ = unsafe { EnumWindows(Some(collect), LPARAM(&mut out as *mut Vec<HWND> as isize)) };
        out
    }

    /// The tabs of one window as people see them: a hidden copy of the tab strip (off-screen) and
    /// two controls drawn at the same place with the same name count once. (Owner 2026-11-20:
    /// 3 to 4 open tabs were counted as 6 to 8.) Used by `list` and `close`, so an index means
    /// the same tab in both.
    fn tab_items(uia: &IUIAutomation, root: &IUIAutomationElement) -> Vec<IUIAutomationElement> {
        let mut seen: Vec<(String, i32, i32, i32, i32)> = Vec::new();
        find_all(uia, root, UIA_TabItemControlTypeId.0)
            .into_iter()
            .filter(|tab| {
                // SAFETY: COM calls on this thread.
                if unsafe { tab.CurrentIsOffscreen() }.is_ok_and(|b| b.as_bool()) {
                    return false;
                }
                let name = unsafe { tab.CurrentName() }
                    .map(|n| n.to_string())
                    .unwrap_or_default();
                let r = unsafe { tab.CurrentBoundingRectangle() }.unwrap_or_default();
                let key = (name, r.left, r.top, r.right, r.bottom);
                if seen.contains(&key) {
                    return false;
                }
                seen.push(key);
                true
            })
            .collect()
    }

    /// The browser window to read: the one in front, else the top-most visible browser window that
    /// has a tab strip (a browser's own pop-ups and tooltips do not).
    fn browser_window(uia: &IUIAutomation) -> Option<(IUIAutomationElement, String)> {
        if let Some(front) = foreground_browser(uia) {
            return Some(front);
        }
        for hwnd in visible_windows() {
            let Some(exe) = crate::tracking::win::executable_name(hwnd.0) else {
                continue;
            };
            if !is_browser(&exe) {
                continue;
            }
            // SAFETY: COM call on this thread with a handle from the OS.
            let Ok(root) = (unsafe { uia.ElementFromHandle(hwnd) }) else {
                continue;
            };
            if tab_items(uia, &root).is_empty() {
                continue;
            }
            return Some((root, display_name(&exe)));
        }
        None
    }

    pub fn list() -> Vec<OpenTab> {
        let Some(uia) = client() else { return vec![] };
        let Some((root, browser)) = browser_window(&uia) else {
            return vec![];
        };
        let bar = find_child(&uia, &root, UIA_EditControlTypeId.0, None);
        tab_items(&uia, &root)
            .into_iter()
            .enumerate()
            .map(|(i, tab)| {
                let active = tab_is_selected(&tab);
                // SAFETY: COM call on this thread.
                let title = unsafe { tab.CurrentName() }
                    .ok()
                    .map(|n| n.to_string())
                    .filter(|s| !s.is_empty());
                let domain = (active && bar.is_some())
                    .then(|| active_tab_domain(bar.as_ref().unwrap()))
                    .flatten();
                OpenTab {
                    browser: browser.clone(),
                    window_index: 0, // v1: one window, the one in front or the top-most
                    tab_index: u32::try_from(i).unwrap_or(u32::MAX),
                    title,
                    domain,
                    active,
                }
            })
            .collect()
    }

    pub fn close(_browser: &str, window_index: u32, tab_index: u32) -> bool {
        if window_index != 0 {
            return false; // v1 only ever lists window 0
        }
        let Some(uia) = client() else { return false };
        let Some((root, _)) = browser_window(&uia) else {
            return false;
        };
        let Some(tab) = tab_items(&uia, &root).into_iter().nth(tab_index as usize) else {
            return false;
        };
        let Some(close_button) = find_child(&uia, &tab, UIA_ButtonControlTypeId.0, None) else {
            return false;
        };
        // SAFETY: COM call on this thread.
        unsafe {
            close_button
                .GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId)
                .and_then(|p| p.Invoke())
                .is_ok()
        }
    }

    /// What Pluto sees, for a bug report: every window of a browser, and for each tab-like control
    /// where it is, whether it is hidden, what it sits in, and whether it was counted. Titles are
    /// shortened to 24 characters; no addresses.
    pub fn report() -> String {
        let Some(uia) = client() else {
            return "Could not start UI Automation.".to_owned();
        };
        let mut out = String::new();
        // SAFETY: plain FFI call.
        let front = unsafe { GetForegroundWindow() };
        for hwnd in visible_windows() {
            let Some(exe) = crate::tracking::win::executable_name(hwnd.0) else {
                continue;
            };
            if !is_browser(&exe) {
                continue;
            }
            // SAFETY: COM call on this thread with a handle from the OS.
            let Ok(root) = (unsafe { uia.ElementFromHandle(hwnd) }) else {
                continue;
            };
            let raw = find_all(&uia, &root, UIA_TabItemControlTypeId.0);
            let kept = tab_items(&uia, &root).len();
            out.push_str(&format!(
                "{exe}{}: {} tab-like controls, {kept} counted\n",
                if hwnd == front { " (in front)" } else { "" },
                raw.len()
            ));
            // SAFETY: COM calls on this thread.
            let walker = unsafe { uia.ControlViewWalker() }.ok();
            for (i, tab) in raw.iter().enumerate() {
                let name = unsafe { tab.CurrentName() }
                    .map(|n| n.to_string())
                    .unwrap_or_default();
                let short: String = name.chars().take(24).collect();
                let r = unsafe { tab.CurrentBoundingRectangle() }.unwrap_or_default();
                let off = unsafe { tab.CurrentIsOffscreen() }.is_ok_and(|b| b.as_bool());
                let parent = walker
                    .as_ref()
                    .and_then(|w| unsafe { w.GetParentElement(tab) }.ok())
                    .map(|p| {
                        let n = unsafe { p.CurrentName() }
                            .map(|n| n.to_string())
                            .unwrap_or_default();
                        let t = unsafe { p.CurrentControlType() }.map(|t| t.0).unwrap_or(0);
                        format!("{t}:{}", n.chars().take(16).collect::<String>())
                    })
                    .unwrap_or_default();
                out.push_str(&format!(
                    "  {i:>2} \"{short}\" x{}-{} y{}-{} offscreen={off} selected={} parent={parent}\n",
                    r.left,
                    r.right,
                    r.top,
                    r.bottom,
                    tab_is_selected(tab)
                ));
            }
        }
        if out.is_empty() {
            out.push_str("No visible browser window found.");
        }
        out
    }
}

#[cfg(target_os = "macos")]
mod os {
    use std::process::Command;

    use pluto_core::sites::{domain_from_address, OpenTab};
    use pluto_core::usage::display_name;

    /// Same browsers as `sites.rs`: their scripting dictionary can list every tab directly.
    const ASKABLE: &[&str] = &[
        "Google Chrome",
        "Microsoft Edge",
        "Brave Browser",
        "Vivaldi",
    ];

    fn run(script: &str) -> Option<String> {
        let out = Command::new("/usr/bin/osascript")
            .args(["-e", script])
            .output()
            .ok()?;
        out.status
            .success()
            .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
    }

    /// Tab-separated: `window<TAB>tab<TAB>active<TAB>url<TAB>title`, one line per tab, skipping
    /// private windows entirely.
    fn list_script(app: &str) -> String {
        format!(
            r#"tell application "{app}"
  set out to ""
  set wIndex to 0
  repeat with w in windows
    set wIndex to wIndex + 1
    if (mode of w) is "normal" then
      set activeIndex to active tab index of w
      set tIndex to 0
      repeat with t in tabs of w
        set tIndex to tIndex + 1
        set isActive to (tIndex = activeIndex) as string
        set out to out & wIndex & "\t" & tIndex & "\t" & isActive & "\t" & (URL of t) & "\t" & (title of t) & "\n"
      end repeat
    end if
  end repeat
  return out
end tell"#
        )
    }

    /// Arc: like Chrome, but private windows are marked `incognito` and the active tab is found
    /// by id. Safari: no way to tell private windows, so only with `tracking.safari` on.
    fn other_script(app: &str) -> Option<String> {
        match app {
            "Arc" => Some(r#"tell application "Arc"
  set out to ""
  set wIndex to 0
  repeat with w in windows
    set wIndex to wIndex + 1
    if (incognito of w) is false then
      set activeId to id of active tab of w
      set tIndex to 0
      repeat with t in tabs of w
        set tIndex to tIndex + 1
        set isActive to ((id of t) = activeId) as string
        set out to out & wIndex & "\t" & tIndex & "\t" & isActive & "\t" & (URL of t) & "\t" & (title of t) & "\n"
      end repeat
    end if
  end repeat
  return out
end tell"#.to_owned()),
            "Safari" if crate::sites::safari_on() => Some(r#"tell application "Safari"
  set out to ""
  set wIndex to 0
  repeat with w in windows
    set wIndex to wIndex + 1
    try
      set activeTab to current tab of w
      set tIndex to 0
      repeat with t in tabs of w
        set tIndex to tIndex + 1
        set isActive to (t = activeTab) as string
        set out to out & wIndex & "\t" & tIndex & "\t" & isActive & "\t" & (URL of t) & "\t" & (name of t) & "\n"
      end repeat
    end try
  end repeat
  return out
end tell"#.to_owned()),
            _ => None,
        }
    }

    fn parse_lines(app: &str, out: &str, tabs: &mut Vec<OpenTab>) {
        for line in out.lines() {
            let mut f = line.splitn(5, '\t');
            let (Some(w), Some(t), Some(active), Some(url), title) =
                (f.next(), f.next(), f.next(), f.next(), f.next())
            else {
                continue;
            };
            let (Ok(window_index), Ok(tab_index)) = (w.parse::<u32>(), t.parse::<u32>()) else {
                continue;
            };
            tabs.push(OpenTab {
                browser: display_name(app),
                window_index: window_index.saturating_sub(1),
                tab_index: tab_index.saturating_sub(1),
                title: title.map(str::to_owned).filter(|s| !s.is_empty()),
                domain: domain_from_address(url),
                active: active == "true",
            });
        }
    }

    /// Firefox: from its own session file (private windows are never in it). Read-only:
    /// Firefox can't be asked to close a tab.
    fn firefox_tabs(tabs: &mut Vec<OpenTab>) {
        let Some(home) = std::env::var_os("HOME") else {
            return;
        };
        let profiles =
            std::path::Path::new(&home).join("Library/Application Support/Firefox/Profiles");
        if let Some(found) = pluto_core::firefox::newest_session_file(&profiles)
            .and_then(|f| pluto_core::firefox::read_session(&f).ok())
            .and_then(|json| pluto_core::firefox::open_tabs(&json, "Firefox").ok())
        {
            tabs.extend(found);
        }
    }

    /// `tell application` starts a browser that isn't running; ask first so listing tabs never
    /// opens one (the app name comes from a fixed list, so it is safe in the script).
    fn is_running(app: &str) -> bool {
        run(&format!("application \"{app}\" is running")).is_some_and(|o| o.trim() == "true")
    }

    pub fn list() -> Vec<OpenTab> {
        let mut tabs = vec![];
        for app in ["Arc", "Safari"] {
            if !is_running(app) {
                continue;
            }
            if let Some(out) = other_script(app).and_then(|s| run(&s)) {
                parse_lines(app, &out, &mut tabs);
            }
        }
        firefox_tabs(&mut tabs);
        for app in ASKABLE {
            if !is_running(app) {
                continue;
            }
            let Some(out) = run(&list_script(app)) else {
                continue;
            };
            for line in out.lines() {
                let mut f = line.splitn(5, '\t');
                let (Some(w), Some(t), Some(active), Some(url), title) =
                    (f.next(), f.next(), f.next(), f.next(), f.next())
                else {
                    continue;
                };
                let (Ok(window_index), Ok(tab_index)) = (w.parse::<u32>(), t.parse::<u32>()) else {
                    continue;
                };
                tabs.push(OpenTab {
                    browser: display_name(app),
                    window_index: window_index.saturating_sub(1),
                    tab_index: tab_index.saturating_sub(1),
                    title: title.map(str::to_owned).filter(|s| !s.is_empty()),
                    domain: domain_from_address(url),
                    active: active == "true",
                });
            }
        }
        tabs
    }

    /// macOS lists every window directly, so the counts are plain; say how many per browser.
    pub fn report() -> String {
        let mut per: std::collections::BTreeMap<(String, u32), usize> = Default::default();
        for t in list() {
            *per.entry((t.browser, t.window_index)).or_default() += 1;
        }
        if per.is_empty() {
            return "No browser tabs found.".to_owned();
        }
        per.iter()
            .map(|((b, w), n)| format!("{b} window {w}: {n} tabs\n"))
            .collect()
    }

    pub fn close(browser: &str, window_index: u32, tab_index: u32) -> bool {
        let closable = ASKABLE.iter().chain(["Arc", "Safari"].iter());
        let Some(app) = closable.into_iter().find(|a| display_name(a) == browser) else {
            return false; // Firefox: read-only
        };
        let script = format!(
            r#"tell application "{app}" to close tab {t} of window {w}"#,
            w = window_index + 1,
            t = tab_index + 1,
        );
        run(&script).is_some()
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod os {
    use pluto_core::sites::OpenTab;

    pub fn list() -> Vec<OpenTab> {
        vec![]
    }

    pub fn close(_browser: &str, _window_index: u32, _tab_index: u32) -> bool {
        false
    }

    pub fn report() -> String {
        "Not available on this system.".to_owned()
    }
}
