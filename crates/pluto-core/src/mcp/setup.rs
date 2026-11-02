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
    fn the_manual_block_is_the_same_entry() {
        let text = manual(Format::McpServers, "pluto", &args());
        let v: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(
            v["mcpServers"]["pluto"],
            entry(Format::McpServers, "pluto", &args())
        );
    }
}
