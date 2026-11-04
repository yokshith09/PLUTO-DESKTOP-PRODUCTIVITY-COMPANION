//! Bring a chat's window forward (A-4, owner 2026-11-04: "click the notification and it takes me
//! there").
//!
//! The hook (`Pluto --react`) is started by the assistant, so its parents are the assistant, the
//! shell, and the terminal or editor the chat runs in. The hook walks up those parents and keeps the
//! nearest one that owns a window you can see. Pluto stores that handle with the waiting chat and,
//! when you click its bubble or its row on the pet, asks the OS to bring that window to the front.
//! This is more reliable than matching window titles, but it only reaches the **window**: one tab of
//! a shared terminal, or one chat inside an editor, cannot be picked from outside.
//!
//! The handle is the platform's: Windows, the top-level window (`HWND`); macOS, the app's process id.
//! Unverified on a real PC; the walk itself is tested below.

/// The nearest ancestor of `start` (not `start` itself) that has a window, by climbing `parent`.
/// Stops at the top, at a loop, or after 32 steps, so a odd process tree can never hang the hook.
#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]
pub fn nearest<P, W>(start: u32, parent: P, window: W) -> Option<i64>
where
    P: Fn(u32) -> Option<u32>,
    W: Fn(u32) -> Option<i64>,
{
    let mut seen = vec![start];
    let mut pid = start;
    for _ in 0..32 {
        pid = parent(pid)?;
        if pid <= 1 || seen.contains(&pid) {
            return None;
        }
        seen.push(pid);
        if let Some(w) = window(pid) {
            return Some(w);
        }
    }
    None
}

/// The window of the terminal or editor this process runs in, if it can be found.
pub fn my_window() -> Option<i64> {
    os::my_window()
}

/// Brings that window to the front; false when it is gone or the OS refused.
pub fn bring_forward(window: i64) -> bool {
    os::bring_forward(window)
}

#[cfg(windows)]
mod os {
    use std::collections::HashMap;
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, INVALID_HANDLE_VALUE, LPARAM};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYEVENTF_KEYUP, VK_MENU};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowLongW, GetWindowTextLengthW, GetWindowThreadProcessId,
        IsIconic, IsWindow, IsWindowVisible, SetForegroundWindow, ShowWindow, GWL_EXSTYLE,
        GW_OWNER, SW_RESTORE, WS_EX_TOOLWINDOW,
    };

    /// Every process and its parent, from one snapshot.
    fn parents() -> HashMap<u32, u32> {
        let mut map = HashMap::new();
        // SAFETY: a snapshot handle is closed below; the entry struct is sized before use.
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE {
                return map;
            }
            let mut e: PROCESSENTRY32W = std::mem::zeroed();
            e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut ok = Process32FirstW(snap, &mut e) != 0;
            while ok {
                map.insert(e.th32ProcessID, e.th32ParentProcessID);
                ok = Process32NextW(snap, &mut e) != 0;
            }
            CloseHandle(snap);
        }
        map
    }

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> i32 {
        // SAFETY: `lparam` is the `Vec` passed to EnumWindows below, alive for the whole call.
        let out = unsafe { &mut *(lparam as *mut Vec<(u32, isize)>) };
        // Only a window you can see, that is not a tool window or owned by another one, with a title.
        let tool = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32 & WS_EX_TOOLWINDOW != 0;
        if unsafe { IsWindowVisible(hwnd) } != 0
            && !tool
            && unsafe { GetWindow(hwnd, GW_OWNER) }.is_null()
            && unsafe { GetWindowTextLengthW(hwnd) } > 0
        {
            let mut pid = 0u32;
            unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
            out.push((pid, hwnd as isize));
        }
        1
    }

    fn windows() -> Vec<(u32, isize)> {
        let mut out: Vec<(u32, isize)> = Vec::new();
        // SAFETY: the callback only runs during this call and `out` outlives it.
        unsafe { EnumWindows(Some(collect), &mut out as *mut _ as LPARAM) };
        out
    }

    pub fn my_window() -> Option<i64> {
        let parent = parents();
        let wins = windows();
        super::nearest(
            std::process::id(),
            |p| parent.get(&p).copied(),
            |p| {
                wins.iter()
                    .find(|(owner, _)| *owner == p)
                    .map(|(_, h)| *h as i64)
            },
        )
    }

    pub fn bring_forward(window: i64) -> bool {
        let hwnd = window as isize as HWND;
        // SAFETY: plain window calls on a handle the OS validates (IsWindow) first.
        unsafe {
            if IsWindow(hwnd) == 0 {
                return false;
            }
            if IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            }
            if SetForegroundWindow(hwnd) != 0 {
                return true;
            }
            // Windows only lets the program in front take the front; a tap on Alt is the usual
            // way past that for a program you have just clicked.
            keybd_event(VK_MENU as u8, 0, 0, 0);
            keybd_event(VK_MENU as u8, 0, KEYEVENTF_KEYUP, 0);
            SetForegroundWindow(hwnd) != 0
        }
    }
}

#[cfg(target_os = "macos")]
mod os {
    use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};

    /// The parent of `pid`, from `ps` (always present on macOS).
    fn parent(pid: u32) -> Option<u32> {
        let out = std::process::Command::new("ps")
            .args(["-o", "ppid=", "-p", &pid.to_string()])
            .output()
            .ok()?;
        String::from_utf8_lossy(&out.stdout).trim().parse().ok()
    }

    /// The process id of an app that has windows (a terminal, an editor); shells and helpers are
    /// not apps, so macOS knows nothing of them.
    fn app(pid: u32) -> Option<i64> {
        NSRunningApplication::runningApplicationWithProcessIdentifier(pid as i32)
            .map(|_| i64::from(pid))
    }

    pub fn my_window() -> Option<i64> {
        super::nearest(std::process::id(), parent, app)
    }

    #[allow(deprecated)]
    pub fn bring_forward(window: i64) -> bool {
        let Ok(pid) = i32::try_from(window) else {
            return false;
        };
        NSRunningApplication::runningApplicationWithProcessIdentifier(pid).is_some_and(|a| {
            a.activateWithOptions(
                NSApplicationActivationOptions::ActivateAllWindows
                    | NSApplicationActivationOptions::ActivateIgnoringOtherApps,
            )
        })
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod os {
    pub fn my_window() -> Option<i64> {
        None
    }
    pub fn bring_forward(_window: i64) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::nearest;
    use std::collections::HashMap;

    fn tree() -> HashMap<u32, u32> {
        // hook 10 ← shell 9 ← claude 8 ← pwsh 7 ← terminal 6 ← explorer 5
        HashMap::from([(10, 9), (9, 8), (8, 7), (7, 6), (6, 5), (5, 4)])
    }

    #[test]
    fn the_nearest_parent_with_a_window_wins() {
        let t = tree();
        let wins = HashMap::from([(6u32, 600i64), (5, 500)]);
        assert_eq!(
            nearest(10, |p| t.get(&p).copied(), |p| wins.get(&p).copied()),
            Some(600)
        );
    }

    #[test]
    fn the_process_itself_is_not_its_own_window() {
        let t = tree();
        let wins = HashMap::from([(10u32, 1000i64)]);
        assert_eq!(
            nearest(10, |p| t.get(&p).copied(), |p| wins.get(&p).copied()),
            None
        );
    }

    #[test]
    fn no_window_anywhere_is_none_and_a_loop_ends() {
        let t = tree();
        assert_eq!(nearest(10, |p| t.get(&p).copied(), |_| None), None);
        // 1 → 2 → 1: never hangs.
        assert_eq!(
            nearest(1, |p| Some(if p == 1 { 2 } else { 1 }), |_| None),
            None
        );
        // The top of the tree (pid 0 or 1) is not a window either.
        assert_eq!(nearest(3, |_| Some(1), |_| Some(1)), None);
    }

    #[test]
    fn a_very_long_chain_stops() {
        assert_eq!(nearest(1000, |p| Some(p + 1), |_| None), None);
    }
}
