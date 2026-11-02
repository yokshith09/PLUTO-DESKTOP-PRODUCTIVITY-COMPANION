//! Developer reactions without hooks (P4.3a, owner 2026-11-02: "one-time setup, common for all
//! projects"). You pick one or more folders once; every git repository inside them is found and
//! watched. Pluto reads only git's own reflogs (`.git/logs/...`), never your source files.
//!
//! - A commit (from any tool) adds a `commit...` line to `.git/logs/HEAD` → `git_commit`.
//! - A push that succeeded adds an `update by push` line to `.git/logs/refs/remotes/<r>/<b>` →
//!   `git_push`. A failed push writes nothing, so it never reacts.
//!
//! The first look at a repository only records where its logs are; nothing from before Pluto
//! started watching ever reacts.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// How deep under a chosen folder repositories are looked for (`E:\Projects\client\app` = 3).
pub const MAX_DEPTH: usize = 4;
/// At most this many repositories are watched, so a whole drive picked by mistake stays cheap.
pub const MAX_REPOS: usize = 200;

/// Folders never looked into: big, generated, or not yours.
const SKIP: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
    "AppData",
    "Library",
    "$RECYCLE.BIN",
    "System Volume Information",
    "Windows",
    "Program Files",
    "Program Files (x86)",
];

/// Every git repository at or under `root`, up to [`MAX_DEPTH`] folders down. A repository's own
/// sub-folders are not searched (submodules aside, they hold no other repositories).
pub fn find_repos(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    walk(root, 0, &mut found);
    found.sort();
    found
}

fn walk(dir: &Path, depth: usize, found: &mut Vec<PathBuf>) {
    if found.len() >= MAX_REPOS {
        return;
    }
    if dir.join(".git").join("logs").is_dir() || dir.join(".git").join("HEAD").is_file() {
        found.push(dir.to_owned());
        return;
    }
    if depth >= MAX_DEPTH {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            !name.starts_with('.') && !SKIP.iter().any(|s| s.eq_ignore_ascii_case(&name))
        })
        .map(|e| e.path())
        .collect();
    dirs.sort();
    for d in dirs {
        walk(&d, depth + 1, found);
    }
}

/// The last line of a file, read from its end (reflogs only grow).
fn last_line(path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    text.lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .map(str::to_owned)
}

/// The message part of a reflog line (after the tab): `commit: fix the tray`, `update by push`…
fn message(line: &str) -> &str {
    line.split_once('\t').map(|(_, m)| m).unwrap_or("")
}

/// `commit: …`, `commit (amend): …`, `commit (initial): …`, `commit (merge): …` are commits;
/// checkout, pull, reset, rebase are not.
pub fn is_commit(line: &str) -> bool {
    message(line).starts_with("commit")
}

pub fn is_push(line: &str) -> bool {
    message(line).starts_with("update by push")
}

/// The remote-tracking reflogs of a repository (`.git/logs/refs/remotes/<remote>/<branch...>`).
fn remote_logs(repo: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![repo.join(".git/logs/refs/remotes")];
    while let Some(d) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&d) else {
            continue;
        };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else {
                out.push(p);
            }
        }
    }
    out
}

/// Remembers the last reflog line of each watched file and reports what is new.
#[derive(Debug, Default)]
pub struct Watcher {
    seen: HashMap<PathBuf, String>,
    /// Repositories looked at before: a log that appears in one of them later is new activity.
    known: std::collections::HashSet<PathBuf>,
}

impl Watcher {
    pub fn new() -> Self {
        Self::default()
    }

    /// Looks at every repository once. Returns `(repository, reaction)` for each new commit or
    /// successful push since the last look; the first look at a file reports nothing.
    pub fn poll(&mut self, repos: &[PathBuf]) -> Vec<(PathBuf, &'static str)> {
        let mut out = Vec::new();
        for repo in repos {
            let known = !self.known.insert(repo.clone());
            let head = repo.join(".git/logs/HEAD");
            if let Some(r) = self.check(&head, known, is_commit, "git_commit") {
                out.push((repo.clone(), r));
            }
            let mut pushed = false;
            for log in remote_logs(repo) {
                // One push can move several branches; it is one reaction.
                if self.check(&log, known, is_push, "git_push").is_some() {
                    pushed = true;
                }
            }
            if pushed {
                out.push((repo.clone(), "git_push"));
            }
        }
        out
    }

    fn check(
        &mut self,
        file: &Path,
        known_repo: bool,
        test: fn(&str) -> bool,
        reaction: &'static str,
    ) -> Option<&'static str> {
        let line = last_line(file)?;
        let before = self.seen.insert(file.to_owned(), line.clone());
        match before {
            Some(old) if old != line && test(&line) => Some(reaction),
            // A log that is new in a repository already watched: its first push or commit.
            None if known_repo && test(&line) => Some(reaction),
            _ => None,
        }
    }
}

/// The folders to watch from the stored preference: strings only, empty ones dropped, no repeats.
pub fn clean_roots(stored: Option<&serde_json::Value>) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    if let Some(list) = stored.and_then(serde_json::Value::as_array) {
        for v in list {
            if let Some(s) = v.as_str().map(str::trim).filter(|s| !s.is_empty()) {
                let p = PathBuf::from(s);
                if !out.contains(&p) {
                    out.push(p);
                }
            }
        }
    }
    out
}

/// One commit or push seen, kept for a project's Activity ("Committed" / "Pushed" and the time;
/// owner 2026-11-02: no commit messages).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitEvent {
    pub repo: String,
    /// `git_commit` or `git_push`.
    pub kind: String,
    pub at_ms: i64,
}

/// How many git events are kept (newest first), across all projects.
pub const EVENTS_KEPT: usize = 500;
pub const EVENTS_PREF: &str = "dev.git_events";

/// The kept events from the stored preference (malformed entries dropped).
pub fn events_from(stored: Option<&serde_json::Value>) -> Vec<GitEvent> {
    stored
        .and_then(serde_json::Value::as_array)
        .map(|l| {
            l.iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .take(EVENTS_KEPT)
                .collect()
        })
        .unwrap_or_default()
}

/// Adds the newest event in front and keeps at most [`EVENTS_KEPT`].
pub fn remember(events: &mut Vec<GitEvent>, event: GitEvent) {
    events.insert(0, event);
    events.truncate(EVENTS_KEPT);
}

/// The preference that holds the chosen folders.
pub const ROOTS_PREF: &str = "dev.git_roots";

#[cfg(test)]
mod tests {
    use super::*;

    const Z: &str = "0000000000000000000000000000000000000000";

    fn line(msg: &str) -> String {
        format!("{Z} {Z} You <you@x> 1700000000 +0530\t{msg}\n")
    }

    fn repo(root: &Path, name: &str) -> PathBuf {
        let r = root.join(name);
        std::fs::create_dir_all(r.join(".git/logs/refs/remotes/origin")).unwrap();
        std::fs::write(r.join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();
        std::fs::write(r.join(".git/logs/HEAD"), line("commit (initial): start")).unwrap();
        r
    }

    fn append(file: &Path, msg: &str) {
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(file)
            .unwrap();
        f.write_all(line(msg).as_bytes()).unwrap();
    }

    #[test]
    fn finds_every_repository_under_a_folder_but_skips_generated_and_hidden_ones() {
        let dir = tempfile::tempdir().unwrap();
        let a = repo(dir.path(), "a");
        let b = repo(dir.path(), "clients/acme/b");
        repo(dir.path(), "node_modules/pkg");
        repo(dir.path(), ".cache/x");
        repo(dir.path(), "1/2/3/4/too-deep");
        repo(&a, "inside-a");
        assert_eq!(find_repos(dir.path()), vec![a, b]);
    }

    #[test]
    fn a_folder_that_is_itself_a_repository_is_watched() {
        let dir = tempfile::tempdir().unwrap();
        let r = repo(dir.path(), "app");
        assert_eq!(find_repos(&r), vec![r]);
    }

    #[test]
    fn a_new_commit_reacts_once_and_old_history_never_does() {
        let dir = tempfile::tempdir().unwrap();
        let r = repo(dir.path(), "app");
        let mut w = Watcher::new();
        assert!(
            w.poll(std::slice::from_ref(&r)).is_empty(),
            "first look is quiet"
        );
        append(&r.join(".git/logs/HEAD"), "commit: fix the tray");
        assert_eq!(
            w.poll(std::slice::from_ref(&r)),
            vec![(r.clone(), "git_commit")]
        );
        assert!(
            w.poll(std::slice::from_ref(&r)).is_empty(),
            "same commit, no second reaction"
        );
        append(&r.join(".git/logs/HEAD"), "commit (amend): fix the tray");
        assert_eq!(
            w.poll(std::slice::from_ref(&r)),
            vec![(r.clone(), "git_commit")]
        );
    }

    #[test]
    fn checkout_pull_and_reset_are_not_commits() {
        let dir = tempfile::tempdir().unwrap();
        let r = repo(dir.path(), "app");
        let mut w = Watcher::new();
        w.poll(std::slice::from_ref(&r));
        for msg in [
            "checkout: moving from main to dev",
            "pull: Fast-forward",
            "reset: moving to HEAD~1",
        ] {
            append(&r.join(".git/logs/HEAD"), msg);
            assert!(w.poll(std::slice::from_ref(&r)).is_empty(), "{msg}");
        }
    }

    #[test]
    fn a_successful_push_reacts_once_even_when_it_moves_two_branches_and_a_fetch_does_not() {
        let dir = tempfile::tempdir().unwrap();
        let r = repo(dir.path(), "app");
        let main = r.join(".git/logs/refs/remotes/origin/main");
        let dev = r.join(".git/logs/refs/remotes/origin/feature/x");
        std::fs::create_dir_all(dev.parent().unwrap()).unwrap();
        append(&main, "fetch: fast-forward");
        append(&dev, "fetch: fast-forward");
        let mut w = Watcher::new();
        w.poll(std::slice::from_ref(&r));
        append(&main, "update by push");
        append(&dev, "update by push");
        assert_eq!(
            w.poll(std::slice::from_ref(&r)),
            vec![(r.clone(), "git_push")]
        );
        append(&main, "fetch: fast-forward");
        assert!(w.poll(std::slice::from_ref(&r)).is_empty());
    }

    #[test]
    fn a_branch_pushed_for_the_first_time_reacts_but_a_repository_seen_for_the_first_time_does_not()
    {
        let dir = tempfile::tempdir().unwrap();
        let r = repo(dir.path(), "app");
        let mut w = Watcher::new();
        w.poll(std::slice::from_ref(&r));
        let new = r.join(".git/logs/refs/remotes/origin/new");
        append(&new, "update by push");
        assert_eq!(
            w.poll(std::slice::from_ref(&r)),
            vec![(r.clone(), "git_push")]
        );
        let other = repo(dir.path(), "other");
        append(
            &other.join(".git/logs/refs/remotes/origin/main"),
            "update by push",
        );
        assert!(
            w.poll(&[r, other]).is_empty(),
            "history of a newly found repository is quiet"
        );
    }

    #[test]
    fn events_keep_the_newest_first_and_drop_junk() {
        let mut list = events_from(Some(&serde_json::json!([
            { "repo": "a", "kind": "git_push", "atMs": 2 },
            { "nope": 1 }
        ])));
        assert_eq!(list.len(), 1);
        remember(
            &mut list,
            GitEvent {
                repo: "b".into(),
                kind: "git_commit".into(),
                at_ms: 3,
            },
        );
        assert_eq!(list[0].repo, "b");
        for i in 0..600 {
            remember(
                &mut list,
                GitEvent {
                    repo: "c".into(),
                    kind: "git_commit".into(),
                    at_ms: i,
                },
            );
        }
        assert_eq!(list.len(), EVENTS_KEPT);
    }

    #[test]
    fn roots_from_the_preference_drop_junk_and_repeats() {
        let v = serde_json::json!(["E:\\Projects", "", 3, "E:\\Projects", " D:\\Work "]);
        assert_eq!(
            clean_roots(Some(&v)),
            vec![PathBuf::from("E:\\Projects"), PathBuf::from("D:\\Work")]
        );
        assert!(clean_roots(None).is_empty());
    }

    /// The real `git`: a commit and a push to a local remote react, a fetch does not. Skipped
    /// when git is not installed.
    #[test]
    fn real_git_commit_and_push_react() {
        use std::process::Command;
        let git = |dir: &Path, args: &[&str]| {
            Command::new("git")
                .args(args)
                .current_dir(dir)
                .env("GIT_AUTHOR_NAME", "t")
                .env("GIT_AUTHOR_EMAIL", "t@x")
                .env("GIT_COMMITTER_NAME", "t")
                .env("GIT_COMMITTER_EMAIL", "t@x")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        };
        let dir = tempfile::tempdir().unwrap();
        if !git(dir.path(), &["--version"]) {
            return;
        }
        let remote = dir.path().join("remote.git");
        assert!(git(dir.path(), &["init", "-q", "--bare", "remote.git"]));
        let work = dir.path().join("projects/app");
        std::fs::create_dir_all(&work).unwrap();
        assert!(git(&work, &["init", "-q", "-b", "main"]));
        std::fs::write(work.join("a.txt"), "1").unwrap();
        assert!(git(&work, &["add", "."]));
        assert!(git(&work, &["commit", "-q", "-m", "one"]));
        assert!(git(
            &work,
            &["remote", "add", "origin", remote.to_str().unwrap()]
        ));
        assert!(git(&work, &["push", "-q", "-u", "origin", "main"]));

        let repos = find_repos(&dir.path().join("projects"));
        assert_eq!(repos, vec![work.clone()]);
        let mut w = Watcher::new();
        assert!(w.poll(&repos).is_empty());

        std::fs::write(work.join("a.txt"), "2").unwrap();
        assert!(git(&work, &["commit", "-q", "-am", "two"]));
        assert_eq!(w.poll(&repos), vec![(work.clone(), "git_commit")]);
        assert!(git(&work, &["push", "-q"]));
        assert_eq!(w.poll(&repos), vec![(work.clone(), "git_push")]);
        assert!(git(&work, &["fetch", "-q"]));
        assert!(w.poll(&repos).is_empty());
        assert!(git(&work, &["checkout", "-q", "-b", "dev"]));
        assert!(w.poll(&repos).is_empty(), "a checkout is not a commit");
    }
}
