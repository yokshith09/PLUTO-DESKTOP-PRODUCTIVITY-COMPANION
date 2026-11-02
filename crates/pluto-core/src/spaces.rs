//! Project Spaces (FM-PS, FR-53; owner 2026-11-02). A project is still the name on its tasks and
//! notes; a space adds a folder on disk and links to files, folders and web pages. Stored as one
//! preference ([`SPACES_PREF`]) that the UI writes; the shell reads it to know which paths it may
//! open and which project a git folder belongs to. Nothing is copied: only paths are kept.

use std::path::{Path, PathBuf};

use serde_json::Value;

pub const SPACES_PREF: &str = "projects.spaces";

/// One project's space, as far as the shell needs it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Space {
    pub name: String,
    pub folder: Option<PathBuf>,
    /// Paths among the links (web links are opened elsewhere and are not listed here).
    pub paths: Vec<PathBuf>,
}

/// The spaces in the stored preference; anything malformed is skipped.
pub fn parse(stored: Option<&Value>) -> Vec<Space> {
    let Some(list) = stored
        .and_then(|v| v.get("projects"))
        .and_then(Value::as_array)
    else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|p| {
            let name = p.get("name")?.as_str()?.trim();
            if name.is_empty() {
                return None;
            }
            let folder = p
                .get("folder")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(PathBuf::from);
            let paths = p
                .get("links")
                .and_then(Value::as_array)
                .map(|ls| {
                    ls.iter()
                        .filter_map(|l| l.get("target")?.as_str())
                        .filter(|t| !is_web(t))
                        .map(PathBuf::from)
                        .collect()
                })
                .unwrap_or_default();
            Some(Space {
                name: name.to_owned(),
                folder,
                paths,
            })
        })
        .collect()
}

fn is_web(target: &str) -> bool {
    let t = target.trim_start().to_ascii_lowercase();
    t.starts_with("http://") || t.starts_with("https://") || t.starts_with("mailto:")
}

/// Paths compare without case on Windows and macOS (their usual file systems), and without a
/// trailing separator, so `E:\Projects\Pluto\` and `e:\projects\pluto` are one folder.
pub fn same_path(a: &Path, b: &Path) -> bool {
    let norm = |p: &Path| {
        let s = p.to_string_lossy().replace('\\', "/");
        let s = s.trim_end_matches('/').to_owned();
        if cfg!(any(windows, target_os = "macos")) {
            s.to_lowercase()
        } else {
            s
        }
    };
    norm(a) == norm(b)
}

/// The project whose folder is this git repository, if one is linked.
pub fn project_for<'a>(spaces: &'a [Space], repo: &Path) -> Option<&'a str> {
    spaces
        .iter()
        .find(|s| s.folder.as_deref().is_some_and(|f| same_path(f, repo)))
        .map(|s| s.name.as_str())
}

/// Whether a path is one the person put in a project (its folder or a file/folder link). Only
/// these may be opened from the Projects page.
pub fn is_listed(spaces: &[Space], path: &Path) -> bool {
    spaces.iter().any(|s| {
        s.folder.as_deref().is_some_and(|f| same_path(f, path))
            || s.paths.iter().any(|p| same_path(p, path))
    })
}

/// How a listed path is opened: folders and documents in their usual app; programs and scripts
/// are only shown in their folder, so a click never runs anything.
#[derive(Debug, PartialEq, Eq)]
pub enum OpenAs {
    Open,
    ShowInFolder,
}

const RUNS: &[&str] = &[
    "exe", "msi", "bat", "cmd", "com", "scr", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf",
    "wsh", "hta", "cpl", "lnk", "reg", "jar", "sh", "command", "app", "pkg", "dmg", "py", "pyw",
];

pub fn open_as(path: &Path) -> OpenAs {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase());
    match ext {
        Some(e) if RUNS.contains(&e.as_str()) => OpenAs::ShowInFolder,
        _ => OpenAs::Open,
    }
}

/// The last part of a path, for a project made from a folder ("E:\Projects\pluto" → "pluto").
pub fn folder_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn stored() -> Value {
        json!({ "projects": [
            { "name": "Pluto", "folder": "E:\\Projects\\pluto", "links": [
                { "label": "Repo", "target": "https://github.com/x/pluto" },
                { "label": "Plan", "target": "E:\\Projects\\pluto\\MASTER_PLAN.md" }
            ]},
            { "name": "  ", "folder": "X:\\nope" },
            { "name": "Exam prep", "folder": null, "links": "junk" },
            "junk"
        ]})
    }

    #[test]
    fn parses_spaces_and_skips_junk_and_web_links() {
        let s = parse(Some(&stored()));
        assert_eq!(s.len(), 2);
        assert_eq!(s[0].folder, Some(PathBuf::from("E:\\Projects\\pluto")));
        assert_eq!(
            s[0].paths,
            vec![PathBuf::from("E:\\Projects\\pluto\\MASTER_PLAN.md")]
        );
        assert_eq!(s[1].folder, None);
        assert!(parse(None).is_empty());
        assert!(parse(Some(&json!(3))).is_empty());
    }

    #[test]
    fn a_git_folder_finds_its_project_and_only_listed_paths_open() {
        let s = parse(Some(&stored()));
        // Separators and a trailing one do not matter; case does not matter on Windows and Mac.
        assert_eq!(
            project_for(&s, Path::new("E:/Projects/pluto/")),
            Some("Pluto")
        );
        assert_eq!(project_for(&s, Path::new("E:\\Projects\\other")), None);
        assert!(is_listed(
            &s,
            Path::new("E:\\Projects\\pluto\\MASTER_PLAN.md")
        ));
        assert!(!is_listed(&s, Path::new("C:\\Windows\\System32")));
    }

    #[test]
    fn programs_and_scripts_are_only_shown_never_run() {
        assert_eq!(open_as(Path::new("E:\\a\\setup.EXE")), OpenAs::ShowInFolder);
        assert_eq!(open_as(Path::new("/a/run.sh")), OpenAs::ShowInFolder);
        assert_eq!(open_as(Path::new("E:\\a\\notes.md")), OpenAs::Open);
        assert_eq!(open_as(Path::new("E:\\a\\folder")), OpenAs::Open);
    }

    #[test]
    fn a_folder_names_its_project() {
        assert_eq!(folder_name(Path::new("/home/me/pluto")), "pluto");
    }
}
