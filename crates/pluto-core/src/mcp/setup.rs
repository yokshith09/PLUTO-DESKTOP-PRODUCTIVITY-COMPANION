//! Adding Pluto to an assistant's own MCP settings file, and taking it out again. Pure text in,
//! text out: the shell reads and writes the files. Only the `pluto` entry is ever touched; a file
//! Pluto cannot understand is left alone rather than overwritten.

use serde_json::{Map, Value};

/// The entry's name in every assistant's settings.
pub const ENTRY: &str = "pluto";

/// Where an assistant keeps its MCP servers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    /// `{"mcpServers": {"pluto": {"command", "args"}}}` (Claude Code, Claude, Cursor).
    McpServers,
    /// `{"servers": {"pluto": {"type": "stdio", "command", "args"}}}` (VS Code).
    VsCode,
}

impl Format {
    fn key(self) -> &'static str {
        match self {
            Format::McpServers => "mcpServers",
            Format::VsCode => "servers",
        }
    }
}

/// The `pluto` entry for this format.
pub fn entry(format: Format, command: &str, args: &[String]) -> Value {
    let mut e = Map::new();
    if format == Format::VsCode {
        e.insert("type".into(), "stdio".into());
    }
    e.insert("command".into(), command.into());
    e.insert("args".into(), args.to_vec().into());
    Value::Object(e)
}

/// The whole block to paste by hand.
pub fn manual(format: Format, command: &str, args: &[String]) -> String {
    let mut servers = Map::new();
    servers.insert(ENTRY.into(), entry(format, command, args));
    let mut root = Map::new();
    root.insert(format.key().into(), Value::Object(servers));
    serde_json::to_string_pretty(&Value::Object(root)).unwrap_or_default()
}

const UNREADABLE: &str =
    "This settings file is not plain JSON, so Pluto left it alone. Use the manual setup instead.";

fn parse(existing: Option<&str>) -> Result<Map<String, Value>, String> {
    let text = existing.unwrap_or("").trim();
    if text.is_empty() {
        return Ok(Map::new());
    }
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(map)) => Ok(map),
        _ => Err(UNREADABLE.into()),
    }
}

fn print(map: Map<String, Value>) -> String {
    let mut text = serde_json::to_string_pretty(&Value::Object(map)).unwrap_or_default();
    text.push('\n');
    text
}

/// The file with Pluto added (or its entry brought up to date), everything else kept.
pub fn add(
    existing: Option<&str>,
    format: Format,
    command: &str,
    args: &[String],
) -> Result<String, String> {
    let mut root = parse(existing)?;
    let servers = root
        .entry(format.key())
        .or_insert_with(|| Value::Object(Map::new()));
    let Value::Object(servers) = servers else {
        return Err(UNREADABLE.into());
    };
    servers.insert(ENTRY.into(), entry(format, command, args));
    Ok(print(root))
}

/// The file without Pluto, or `None` when Pluto was not in it (nothing to write).
pub fn remove(existing: Option<&str>, format: Format) -> Result<Option<String>, String> {
    let mut root = parse(existing)?;
    let Some(Value::Object(servers)) = root.get_mut(format.key()) else {
        return Ok(None);
    };
    if servers.remove(ENTRY).is_none() {
        return Ok(None);
    }
    Ok(Some(print(root)))
}

/// True when the file has a `pluto` entry that starts this program.
pub fn is_set(existing: Option<&str>, format: Format, command: &str) -> bool {
    parse(existing)
        .ok()
        .and_then(|root| {
            root.get(format.key())?
                .get(ENTRY)?
                .get("command")?
                .as_str()
                .map(|c| c == command)
        })
        .unwrap_or(false)
}

/// Claude Code's hooks for the pet (developer reactions): when it stops, the pet cheers; when it
/// needs you, the pet waves. (event, reaction).
pub const CLAUDE_HOOKS: &[(&str, &str)] =
    &[("Stop", "agent_done"), ("Notification", "agent_needs_you")];

/// The hook command for one reaction.
pub fn hook_command(program: &str, reaction: &str) -> String {
    format!("\"{program}\" --react {reaction} --assistant claude-code")
}

fn is_ours(hook: &Value) -> bool {
    hook.get("command")
        .and_then(Value::as_str)
        .is_some_and(|c| c.contains("--react ") && c.contains("--assistant claude-code"))
}

/// Claude Code's `settings.json` with Pluto's hooks added (old Pluto hooks replaced), all else kept.
pub fn add_hooks(existing: Option<&str>, program: &str) -> Result<String, String> {
    let without = remove_hooks(existing)?.unwrap_or_else(|| existing.unwrap_or("").to_owned());
    let mut root = parse(Some(&without))?;
    let hooks = root
        .entry("hooks")
        .or_insert_with(|| Value::Object(Map::new()));
    let Value::Object(hooks) = hooks else {
        return Err(UNREADABLE.into());
    };
    for (event, reaction) in CLAUDE_HOOKS {
        let list = hooks
            .entry(*event)
            .or_insert_with(|| Value::Array(Vec::new()));
        let Value::Array(list) = list else {
            return Err(UNREADABLE.into());
        };
        list.push(serde_json::json!({
            "hooks": [{ "type": "command", "command": hook_command(program, reaction) }]
        }));
    }
    Ok(print(root))
}

/// The file without Pluto's hooks, or `None` when it had none.
pub fn remove_hooks(existing: Option<&str>) -> Result<Option<String>, String> {
    let mut root = parse(existing)?;
    let Some(Value::Object(hooks)) = root.get_mut("hooks") else {
        return Ok(None);
    };
    let mut found = false;
    for list in hooks.values_mut() {
        let Value::Array(groups) = list else { continue };
        for group in groups.iter_mut() {
            if let Some(Value::Array(inner)) = group.get_mut("hooks") {
                let before = inner.len();
                inner.retain(|h| !is_ours(h));
                found |= inner.len() != before;
            }
        }
        groups.retain(|g| {
            g.get("hooks")
                .and_then(Value::as_array)
                .is_none_or(|a| !a.is_empty())
        });
    }
    hooks.retain(|_, list| list.as_array().is_none_or(|a| !a.is_empty()));
    if !found {
        return Ok(None);
    }
    if hooks.is_empty() {
        root.remove("hooks");
    }
    Ok(Some(print(root)))
}

/// True when Pluto's hooks are in the file.
pub fn has_hooks(existing: Option<&str>) -> bool {
    matches!(remove_hooks(existing), Ok(Some(_)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args() -> Vec<String> {
        ["--mcp-bridge", "--assistant", "claude-code"]
            .map(String::from)
            .to_vec()
    }

    #[test]
    fn adding_keeps_every_other_setting_and_server() {
        let before = r#"{"theme":"dark","mcpServers":{"github":{"command":"gh"}}}"#;
        let after = add(
            Some(before),
            Format::McpServers,
            "C:\\Pluto\\pluto.exe",
            &args(),
        )
        .unwrap();
        let v: Value = serde_json::from_str(&after).unwrap();
        assert_eq!(v["theme"], "dark");
        assert_eq!(v["mcpServers"]["github"]["command"], "gh");
        assert_eq!(v["mcpServers"]["pluto"]["command"], "C:\\Pluto\\pluto.exe");
        assert_eq!(v["mcpServers"]["pluto"]["args"][0], "--mcp-bridge");
        assert!(is_set(
            Some(&after),
            Format::McpServers,
            "C:\\Pluto\\pluto.exe"
        ));
        assert!(!is_set(
            Some(&after),
            Format::McpServers,
            "D:\\old\\pluto.exe"
        ));
    }

    #[test]
    fn a_missing_or_empty_file_gets_just_pluto_and_vs_code_gets_its_own_shape() {
        let made = add(None, Format::VsCode, "pluto", &args()).unwrap();
        let v: Value = serde_json::from_str(&made).unwrap();
        assert_eq!(v["servers"]["pluto"]["type"], "stdio");
        assert!(v.get("mcpServers").is_none());
        assert!(add(Some("  "), Format::McpServers, "pluto", &args()).is_ok());
    }

    #[test]
    fn a_file_pluto_cannot_read_is_never_overwritten() {
        for bad in ["{ // comment\n}", "[1,2]", r#"{"mcpServers": 3}"#] {
            assert!(
                add(Some(bad), Format::McpServers, "pluto", &args()).is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn removing_takes_out_only_pluto_and_writes_nothing_when_it_was_not_there() {
        let both = r#"{"mcpServers":{"github":{"command":"gh"},"pluto":{"command":"p"}}}"#;
        let after = remove(Some(both), Format::McpServers).unwrap().unwrap();
        let v: Value = serde_json::from_str(&after).unwrap();
        assert!(v["mcpServers"].get("pluto").is_none());
        assert_eq!(v["mcpServers"]["github"]["command"], "gh");
        assert_eq!(remove(Some(&after), Format::McpServers).unwrap(), None);
        assert_eq!(remove(None, Format::VsCode).unwrap(), None);
    }

    #[test]
    fn claude_code_hooks_are_added_once_and_removed_without_touching_the_persons_hooks() {
        let mine = r#"{"model":"opus","hooks":{"Stop":[{"hooks":[{"type":"command","command":"say done"}]}]}}"#;
        let once = add_hooks(Some(mine), "C:/Pluto/pluto.exe").unwrap();
        let twice = add_hooks(Some(&once), "C:/Pluto/pluto.exe").unwrap();
        assert_eq!(once, twice, "connecting again does not add a second copy");
        let v: Value = serde_json::from_str(&twice).unwrap();
        assert_eq!(v["model"], "opus");
        assert_eq!(v["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert!(v["hooks"]["Notification"][0]["hooks"][0]["command"]
            .as_str()
            .unwrap()
            .contains("--react agent_needs_you"));
        assert!(has_hooks(Some(&twice)));

        let back = remove_hooks(Some(&twice)).unwrap().unwrap();
        let v: Value = serde_json::from_str(&back).unwrap();
        assert_eq!(v["hooks"]["Stop"][0]["hooks"][0]["command"], "say done");
        assert!(v["hooks"].get("Notification").is_none());
        assert!(!has_hooks(Some(&back)));
        assert_eq!(remove_hooks(Some("{}")).unwrap(), None);
        let alone = remove_hooks(Some(&add_hooks(None, "p").unwrap()))
            .unwrap()
            .unwrap();
        assert_eq!(alone.trim(), "{}");
    }

    #[test]
    fn the_manual_block_is_the_same_entry() {
        let text = manual(Format::McpServers, "pluto", &args());
        let v: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(
            v["mcpServers"]["pluto"],
            entry(Format::McpServers, "pluto", &args())
        );
    }
}
