//! Launch Buddy, launch sets (P5 item 2, FR-72 b): a saved set of apps, files, folders and web
//! links that opens in one click ("Physics": the PDF, the course site, the notes folder). A set
//! can also start a focus session.
//!
//! Stored as one preference ([`LAUNCH_PREF`]) that the UI writes. The shell runs a set **by its
//! id, reading the stored set itself**, so only items the person saved can ever be opened
//! (T-72-01). This module is the pure part: reading the preference and deciding, item by item,
//! what the shell does. A missing file is named in the report, never silently skipped.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

pub const LAUNCH_PREF: &str = "launch.sets";
/// More than this in one set is refused: one click shouldn't open a flood of windows.
pub const MAX_ITEMS: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchSet {
    pub id: String,
    pub name: String,
    pub items: Vec<LaunchItem>,
    /// Start a focus session of this many minutes after opening (1 to 240).
    pub focus_minutes: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchItem {
    pub label: String,
    pub target: String,
}

/// The sets in the stored preference (`{ "sets": [...] }`); anything malformed is skipped.
pub fn parse(stored: Option<&Value>) -> Vec<LaunchSet> {
    let Some(list) = stored.and_then(|v| v.get("sets")).and_then(Value::as_array) else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|s| {
            let id = s.get("id")?.as_str()?.trim();
            let name = s.get("name")?.as_str()?.trim();
            if id.is_empty() || name.is_empty() {
                return None;
            }
            let items = s
                .get("items")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|i| {
                            let target = i.get("target")?.as_str()?.trim();
                            if target.is_empty() {
                                return None;
                            }
                            let label = i
                                .get("label")
                                .and_then(Value::as_str)
                                .map(str::trim)
                                .filter(|l| !l.is_empty())
                                .map_or_else(|| short_name(target), str::to_owned);
                            Some(LaunchItem {
                                label,
                                target: target.to_owned(),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            let focus_minutes = s
                .get("focus_minutes")
                .and_then(Value::as_u64)
                .filter(|m| (1..=240).contains(m))
                .map(|m| m as u32);
            Some(LaunchSet {
                id: id.to_owned(),
                name: name.to_owned(),
                items,
                focus_minutes,
            })
        })
        .collect()
}

/// What happens to one item.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Step {
    /// A web or mail link, opened in the default browser or mail app.
    Web(String),
    /// A file, folder or app, opened as a double-click would.
    Open(PathBuf),
    /// A script or installer: shown in its folder, never run (a set opens things, it doesn't
    /// run code the person didn't double-click).
    Reveal(PathBuf),
    /// The file or folder isn't there any more.
    Missing(PathBuf),
    /// Not a web link and not a full path (e.g. `ftp://…`, a relative path): refused.
    Refused(String),
}

/// Apps (`.exe`, `.app`, shortcuts) can be in a set, since that is what a set is for; scripts and
/// installers are only shown in their folder. Extensions compared without case.
const NEVER_RUN: &[&str] = &[
    "msi", "bat", "cmd", "com", "scr", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh",
    "hta", "cpl", "reg", "jar", "sh", "command", "pkg", "dmg", "py", "pyw",
];

/// The step for one item. `exists` asks the file system (a parameter, so this stays testable).
pub fn step(target: &str, exists: impl Fn(&Path) -> bool) -> Step {
    let t = target.trim();
    let lower = t.to_ascii_lowercase();
    if lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")
    {
        return Step::Web(t.to_owned());
    }
    let path = PathBuf::from(t);
    if !is_full_path(t) {
        return Step::Refused(t.to_owned());
    }
    if !exists(&path) {
        return Step::Missing(path);
    }
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase());
    match ext.as_deref() {
        Some(e) if NEVER_RUN.contains(&e) => Step::Reveal(path),
        _ => Step::Open(path),
    }
}

/// A full path on Windows (`C:\…`, `\\server\share`) or macOS/Linux (`/…`); no `..` parts.
fn is_full_path(t: &str) -> bool {
    let b = t.as_bytes();
    let drive = b.len() >= 3
        && b[0].is_ascii_alphabetic()
        && b[1] == b':'
        && (b[2] == b'\\' || b[2] == b'/');
    let unc = t.starts_with("\\\\");
    let unix = t.starts_with('/');
    (drive || unc || unix) && !t.split(['/', '\\']).any(|part| part == "..")
}

/// "C:\Notes\Physics.pdf" → "Physics.pdf"; "https://moodle.uni.edu/course/12" → "moodle.uni.edu".
pub fn short_name(target: &str) -> String {
    let t = target.trim();
    if let Some(rest) = t.split_once("://").map(|(_, r)| r) {
        return rest
            .split(['/', '?', '#'])
            .next()
            .unwrap_or(rest)
            .to_owned();
    }
    if let Some(addr) = t.strip_prefix("mailto:") {
        return addr.to_owned();
    }
    t.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(t)
        .to_owned()
}

/// What happened, for the message the person sees.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct LaunchReport {
    /// Labels opened.
    pub opened: Vec<String>,
    /// Labels shown in their folder instead of run.
    pub shown: Vec<String>,
    /// Labels not found (moved, renamed or deleted).
    pub missing: Vec<String>,
    /// Labels that couldn't be opened (refused, or the system said no).
    pub failed: Vec<String>,
    /// Start a focus session of this many minutes, if the set asks for one.
    pub focus_minutes: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn stored() -> Value {
        json!({ "sets": [
            { "id": "s1", "name": "Physics", "focus_minutes": 50, "items": [
                { "label": "Notes", "target": "C:\\Uni\\Physics\\notes.pdf" },
                { "target": "https://moodle.uni.edu/course/12" },
                { "label": "  ", "target": "   " },
                "junk"
            ]},
            { "id": "", "name": "No id" },
            { "id": "s2", "name": "  " },
            { "id": "s3", "name": "Work", "focus_minutes": 999, "items": "junk" },
            7
        ]})
    }

    #[test]
    fn reads_only_well_formed_sets_and_items() {
        let sets = parse(Some(&stored()));
        assert_eq!(sets.len(), 2);
        assert_eq!(sets[0].name, "Physics");
        assert_eq!(sets[0].focus_minutes, Some(50));
        assert_eq!(
            sets[0].items,
            vec![
                LaunchItem {
                    label: "Notes".into(),
                    target: "C:\\Uni\\Physics\\notes.pdf".into()
                },
                LaunchItem {
                    label: "moodle.uni.edu".into(),
                    target: "https://moodle.uni.edu/course/12".into()
                },
            ]
        );
        assert_eq!(sets[1].focus_minutes, None, "999 minutes is out of range");
        assert!(sets[1].items.is_empty());
        assert!(parse(None).is_empty());
        assert!(parse(Some(&json!({ "sets": "x" }))).is_empty());
    }

    #[test]
    fn web_links_open_files_open_apps_open_scripts_are_only_shown() {
        let yes = |_: &Path| true;
        assert_eq!(
            step("https://a.b/c", yes),
            Step::Web("https://a.b/c".into())
        );
        assert_eq!(step("mailto:x@y.z", yes), Step::Web("mailto:x@y.z".into()));
        assert_eq!(
            step("C:\\Uni\\a.pdf", yes),
            Step::Open("C:\\Uni\\a.pdf".into())
        );
        assert_eq!(
            step("C:\\Program Files\\Code\\Code.EXE", yes),
            Step::Open("C:\\Program Files\\Code\\Code.EXE".into())
        );
        assert_eq!(
            step("/Applications/Notion.app", yes),
            Step::Open("/Applications/Notion.app".into())
        );
        assert_eq!(
            step("D:\\tools\\setup.bat", yes),
            Step::Reveal("D:\\tools\\setup.bat".into())
        );
        assert_eq!(
            step("/Users/me/run.sh", yes),
            Step::Reveal("/Users/me/run.sh".into())
        );
        assert_eq!(
            step("\\\\server\\share\\plan.docx", yes),
            Step::Open("\\\\server\\share\\plan.docx".into())
        );
    }

    #[test]
    fn missing_and_strange_targets_are_reported_not_opened() {
        let no = |_: &Path| false;
        assert_eq!(
            step("C:\\gone.pdf", no),
            Step::Missing("C:\\gone.pdf".into())
        );
        for bad in [
            "ftp://x.y/z",
            "notes.pdf",
            "javascript:alert(1)",
            "file:///C:/x",
            "C:\\Uni\\..\\..\\Windows\\x.exe",
            "C:relative",
        ] {
            assert_eq!(
                step(bad, |_: &Path| true),
                Step::Refused(bad.into()),
                "{bad}"
            );
        }
    }

    #[test]
    fn short_names() {
        assert_eq!(short_name("C:\\Notes\\Physics.pdf"), "Physics.pdf");
        assert_eq!(short_name("/Users/me/Uni/"), "Uni");
        assert_eq!(
            short_name("https://moodle.uni.edu/course/12?x=1"),
            "moodle.uni.edu"
        );
        assert_eq!(short_name("mailto:prof@uni.edu"), "prof@uni.edu");
    }
}
