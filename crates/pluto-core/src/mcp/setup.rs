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
    /// `{"mcp": {"pluto": {"type": "local", "command": [program, args…]}}}` (OpenCode).
    OpenCode,
    /// Codex's `config.toml`: a `[mcp_servers.pluto]` table, plus `notify` for the pet (H-1).
    CodexToml,
}

impl Format {
    fn key(self) -> &'static str {
        match self {
            Format::McpServers => "mcpServers",
            Format::VsCode => "servers",
            Format::OpenCode => "mcp",
            Format::CodexToml => "mcp_servers",
        }
    }
}

/// The `pluto` entry for this format.
pub fn entry(format: Format, command: &str, args: &[String]) -> Value {
    let mut e = Map::new();
    if format == Format::OpenCode {
        let mut all = vec![command.to_owned()];
        all.extend(args.iter().cloned());
        e.insert("type".into(), "local".into());
        e.insert("command".into(), all.into());
        e.insert("enabled".into(), true.into());
        return Value::Object(e);
    }
    if format == Format::VsCode {
        e.insert("type".into(), "stdio".into());
    }
    e.insert("command".into(), command.into());
    e.insert("args".into(), args.to_vec().into());
    Value::Object(e)
}

/// The whole block to paste by hand.
pub fn manual(format: Format, command: &str, args: &[String]) -> String {
    if format == Format::CodexToml {
        return codex::table(command, args);
    }
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
    if format == Format::CodexToml {
        return codex::add(existing, command, args);
    }
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
    if format == Format::CodexToml {
        return Ok(codex::remove(existing.unwrap_or("")));
    }
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
    if format == Format::CodexToml {
        return existing.is_some_and(|t| codex::is_set(t, command));
    }
    parse(existing)
        .ok()
        .and_then(|root| {
            let c = root.get(format.key())?.get(ENTRY)?.get("command")?;
            // OpenCode keeps the program as the first word of a list.
            let c = if format == Format::OpenCode {
                c.get(0)?
            } else {
                c
            };
            c.as_str().map(|c| c == command)
        })
        .unwrap_or(false)
}

/// Codex's `config.toml`, edited as text between Pluto's own marker comments so nothing else in
/// the file moves (no TOML library: the file is the user's, and only Pluto's lines change).
pub mod codex {
    const TABLE_START: &str = "# >>> pluto (added by Pluto; Disconnect in Pluto removes it)";
    const TABLE_END: &str = "# <<< pluto";
    const NOTIFY_START: &str = "# >>> pluto notify (the pet cheers when Codex finishes a turn)";
    const NOTIFY_END: &str = "# <<< pluto notify";

    /// A TOML string: literal ('...') when it can be, so Windows paths need no escaping.
    pub fn string(s: &str) -> String {
        if !s.contains('\'') && !s.contains('\n') {
            format!("'{s}'")
        } else {
            format!(
                "\"{}\"",
                s.replace('\\', "\\\\")
                    .replace('"', "\\\"")
                    .replace('\n', "\\n")
            )
        }
    }

    fn list(items: &[String]) -> String {
        format!(
            "[{}]",
            items
                .iter()
                .map(|a| string(a))
                .collect::<Vec<_>>()
                .join(", ")
        )
    }

    /// The table to paste by hand (and the one Pluto adds).
    pub fn table(command: &str, args: &[String]) -> String {
        format!(
            "[mcp_servers.pluto]\ncommand = {}\nargs = {}\n",
            string(command),
            list(args)
        )
    }

    /// The `notify` program line: Codex runs it with the turn's details as one JSON argument.
    pub fn notify(command: &str) -> String {
        let words: Vec<String> = [command, "--react", "agent_done", "--assistant", "codex"]
            .map(String::from)
            .to_vec();
        format!("notify = {}\n", list(&words))
    }

    /// The text without the block between `start` and `end` (markers included).
    fn cut(text: &str, start: &str, end: &str) -> (String, bool) {
        let mut out = Vec::new();
        let mut inside = false;
        let mut found = false;
        for line in text.lines() {
            if line.trim() == start {
                inside = true;
                found = true;
                continue;
            }
            if inside {
                if line.trim() == end {
                    inside = false;
                }
                continue;
            }
            out.push(line);
        }
        let mut s = out.join("\n");
        if !s.is_empty() {
            s.push('\n');
        }
        (s, found)
    }

    /// The user's own top-level keys come before the first `[table]`; is `key` one of them?
    fn has_top_level(text: &str, key: &str) -> bool {
        text.lines()
            .map(str::trim)
            .take_while(|l| !l.starts_with('['))
            .any(|l| l.split('=').next().is_some_and(|k| k.trim() == key) && l.contains('='))
    }

    fn has_own_pluto_table(text: &str) -> bool {
        text.lines().any(|l| {
            let t: String = l.chars().filter(|c| !c.is_whitespace()).collect();
            t == "[mcp_servers.pluto]" || t == "[mcp_servers.\"pluto\"]"
        })
    }

    pub fn add(existing: Option<&str>, command: &str, args: &[String]) -> Result<String, String> {
        let (text, _) = cut(existing.unwrap_or(""), TABLE_START, TABLE_END);
        let (text, _) = cut(&text, NOTIFY_START, NOTIFY_END);
        if has_own_pluto_table(&text) {
            return Err("Codex's settings already have a \"pluto\" server Pluto did not add, so Pluto left them alone. Use the manual setup instead.".into());
        }
        let mut out = String::new();
        // Never replace a notify program the user set up themselves.
        if !has_top_level(&text, "notify") {
            out.push_str(&format!(
                "{NOTIFY_START}\n{}{NOTIFY_END}\n",
                notify(command)
            ));
        }
        out.push_str(&text);
        if !out.is_empty() && !out.ends_with("\n\n") {
            out.push('\n');
        }
        out.push_str(&format!(
            "{TABLE_START}\n{}{TABLE_END}\n",
            table(command, args)
        ));
        Ok(out)
    }

    /// The file without Pluto's lines, or `None` when it had none.
    pub fn remove(existing: &str) -> Option<String> {
        let (text, a) = cut(existing, TABLE_START, TABLE_END);
        let (text, b) = cut(&text, NOTIFY_START, NOTIFY_END);
        (a || b).then(|| text.trim_end().to_owned() + "\n")
    }

    pub fn is_set(existing: &str, command: &str) -> bool {
        let want = format!("command = {}", string(command));
        let mut inside = false;
        existing.lines().any(|l| {
            if l.trim() == TABLE_START {
                inside = true;
            } else if l.trim() == TABLE_END {
                inside = false;
            }
            inside && l.trim() == want
        })
    }

    /// Whether Pluto's `notify` is in place (the pet reacts when Codex finishes).
    pub fn has_notify(existing: &str) -> bool {
        existing.lines().any(|l| l.trim() == NOTIFY_START)
    }
}

/// Cursor's `hooks.json`: when the agent stops, the pet cheers (H-2). (event, reaction).
pub const CURSOR_HOOKS: &[(&str, &str)] = &[("stop", "agent_done")];

fn is_ours_for(hook: &Value, assistant: &str) -> bool {
    hook.get("command")
        .and_then(Value::as_str)
        .is_some_and(|c| c.contains("--react ") && c.contains(&format!("--assistant {assistant}")))
}

/// Cursor's hooks file with Pluto's hook added (an old Pluto hook replaced), everything else kept.
pub fn add_cursor_hooks(existing: Option<&str>, program: &str) -> Result<String, String> {
    let without =
        remove_cursor_hooks(existing)?.unwrap_or_else(|| existing.unwrap_or("").to_owned());
    let mut root = parse(Some(&without))?;
    root.entry("version").or_insert(Value::from(1));
    let hooks = root
        .entry("hooks")
        .or_insert_with(|| Value::Object(Map::new()));
    let Value::Object(hooks) = hooks else {
        return Err(UNREADABLE.into());
    };
    for (event, reaction) in CURSOR_HOOKS {
        let list = hooks
            .entry(*event)
            .or_insert_with(|| Value::Array(Vec::new()));
        let Value::Array(list) = list else {
            return Err(UNREADABLE.into());
        };
        list.push(serde_json::json!({ "command": format!("\"{program}\" --react {reaction} --assistant cursor") }));
    }
    Ok(print(root))
}

/// Cursor's hooks file without Pluto's hook, or `None` when it had none.
pub fn remove_cursor_hooks(existing: Option<&str>) -> Result<Option<String>, String> {
    let mut root = parse(existing)?;
    let Some(Value::Object(hooks)) = root.get_mut("hooks") else {
        return Ok(None);
    };
    let mut found = false;
    for list in hooks.values_mut() {
        let Value::Array(items) = list else { continue };
        let before = items.len();
        items.retain(|h| !is_ours_for(h, "cursor"));
        found |= items.len() != before;
    }
    hooks.retain(|_, list| list.as_array().is_none_or(|a| !a.is_empty()));
    Ok(found.then(|| print(root)))
}

/// The first line of Pluto's OpenCode plugin; a file that starts otherwise is never touched.
pub const OPENCODE_PLUGIN_MARK: &str =
    "// Added by Pluto: the pet cheers when an OpenCode session finishes.";

/// OpenCode plugin (H-3): "done" when a session goes idle, "wants your permission" when it asks
/// (`permission.asked`, or `permission.updated` in older versions; each request once).
pub fn opencode_plugin(program: &str) -> String {
    let prog = serde_json::to_string(program).unwrap_or_default();
    format!(
        r#"{OPENCODE_PLUGIN_MARK}
// Disconnect OpenCode in Pluto to remove it.
const PLUTO = {prog};
const asked = new Set();

export const PlutoPet = async ({{ $, directory }}) => {{
  const react = async (reaction) => {{
    try {{
      await $`${{PLUTO}} --react ${{reaction}} --assistant opencode`.env({{ ...process.env, PLUTO_CWD: directory ?? "" }}).quiet().nothrow();
    }} catch {{}}
  }};
  return {{
    event: async ({{ event }}) => {{
      if (event.type === "session.idle") return react("agent_done");
      if (event.type === "permission.asked" || event.type === "permission.updated") {{
        const id = event.properties?.id;
        if (id) {{ if (asked.has(id)) return; asked.add(id); }}
        return react("agent_permission");
      }}
    }},
  }};
}};
"#
    )
}

/// Claude Code's hooks for the pet (developer reactions): when it stops, the pet cheers; when it
/// needs you, the pet waves; when you send a prompt, that chat stops counting as waiting for you
/// (the badge on the pet, A-1; silent). (event, reaction).
pub const CLAUDE_HOOKS: &[(&str, &str)] = &[
    ("Stop", "agent_done"),
    ("Notification", "agent_needs_you"),
    ("UserPromptSubmit", "agent_resumed"),
];

/// Codex's hook for the pet: when it is about to ask you to approve something. Pluto's hook prints
/// nothing and exits 0, which leaves Codex's own approval prompt exactly as it was. ("Done" comes
/// from `notify`, which needs no trust step.)
pub const CODEX_HOOKS: &[(&str, &str)] = &[("PermissionRequest", "agent_permission")];

/// The hook command for one reaction.
pub fn hook_command(program: &str, reaction: &str) -> String {
    hook_command_for(program, reaction, "claude-code")
}

fn hook_command_for(program: &str, reaction: &str, assistant: &str) -> String {
    format!("\"{program}\" --react {reaction} --assistant {assistant}")
}

/// A settings file in Claude Code's hook shape (`{"hooks": {Event: [{"hooks": [{"command"}]}]}}`,
/// which Codex's `hooks.json` shares) with Pluto's hooks added (old Pluto hooks replaced).
fn add_hooks_in(
    existing: Option<&str>,
    program: &str,
    assistant: &str,
    events: &[(&str, &str)],
) -> Result<String, String> {
    let without =
        remove_hooks_in(existing, assistant)?.unwrap_or_else(|| existing.unwrap_or("").to_owned());
    let mut root = parse(Some(&without))?;
    let hooks = root
        .entry("hooks")
        .or_insert_with(|| Value::Object(Map::new()));
    let Value::Object(hooks) = hooks else {
        return Err(UNREADABLE.into());
    };
    for (event, reaction) in events {
        let list = hooks
            .entry(*event)
            .or_insert_with(|| Value::Array(Vec::new()));
        let Value::Array(list) = list else {
            return Err(UNREADABLE.into());
        };
        list.push(serde_json::json!({
            "hooks": [{ "type": "command", "command": hook_command_for(program, reaction, assistant) }]
        }));
    }
    Ok(print(root))
}

fn remove_hooks_in(existing: Option<&str>, assistant: &str) -> Result<Option<String>, String> {
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
                inner.retain(|h| !is_ours_for(h, assistant));
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

/// Claude Code's `settings.json` with Pluto's hooks added (old Pluto hooks replaced), all else kept.
pub fn add_hooks(existing: Option<&str>, program: &str) -> Result<String, String> {
    add_hooks_in(existing, program, "claude-code", CLAUDE_HOOKS)
}

/// The file without Pluto's hooks, or `None` when it had none.
pub fn remove_hooks(existing: Option<&str>) -> Result<Option<String>, String> {
    remove_hooks_in(existing, "claude-code")
}

/// Codex's `hooks.json` with Pluto's approval hook added, everything else kept.
pub fn add_codex_hooks(existing: Option<&str>, program: &str) -> Result<String, String> {
    add_hooks_in(existing, program, "codex", CODEX_HOOKS)
}

/// Codex's `hooks.json` without Pluto's hook, or `None` when it had none.
pub fn remove_codex_hooks(existing: Option<&str>) -> Result<Option<String>, String> {
    remove_hooks_in(existing, "codex")
}

/// True when Pluto's approval hook is in Codex's `hooks.json`.
pub fn has_codex_hooks(existing: Option<&str>) -> bool {
    matches!(remove_codex_hooks(existing), Ok(Some(_)))
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
    fn codex_gets_its_table_at_the_end_and_notify_before_any_table_and_both_come_out_again() {
        let before = "model = \"o3\"\n\n[mcp_servers.github]\ncommand = \"gh\"\n";
        let prog = "C:\\Program Files\\Pluto\\pluto.exe";
        let after = add(Some(before), Format::CodexToml, prog, &args()).unwrap();
        // Top-level keys stay above every table; Pluto's table comes last; Windows paths need no escaping.
        let notify_at = after.find("notify = ").unwrap();
        let first_table = after.find("[mcp_servers.github]").unwrap();
        assert!(notify_at < first_table);
        assert!(after.find("model = \"o3\"").unwrap() < first_table);
        assert!(after.trim_end().ends_with("# <<< pluto"));
        assert!(after.contains("command = 'C:\\Program Files\\Pluto\\pluto.exe'"));
        assert!(after.contains("args = ['--mcp-bridge', '--assistant', 'claude-code']"));
        assert!(after.contains("'--react', 'agent_done', '--assistant', 'codex'"));
        assert!(is_set(Some(&after), Format::CodexToml, prog));
        assert!(codex::has_notify(&after));
        // Again: replaced, not doubled.
        let again = add(Some(&after), Format::CodexToml, prog, &args()).unwrap();
        assert_eq!(again.matches("[mcp_servers.pluto]").count(), 1);
        assert_eq!(again.matches("notify = ").count(), 1);
        // Out again: the file as it was.
        assert_eq!(
            remove(Some(&again), Format::CodexToml).unwrap().as_deref(),
            Some(before)
        );
        assert_eq!(remove(Some(before), Format::CodexToml).unwrap(), None);
    }

    #[test]
    fn codex_keeps_the_users_own_notify_and_refuses_a_pluto_table_it_did_not_add() {
        let own = "notify = [\"python3\", \"/home/me/notify.py\"]\n";
        let after = add(Some(own), Format::CodexToml, "pluto", &args()).unwrap();
        assert_eq!(after.matches("notify = ").count(), 1);
        assert!(after.starts_with(own));
        assert!(!codex::has_notify(&after));
        assert!(add(
            Some("[mcp_servers.pluto]\ncommand = \"x\"\n"),
            Format::CodexToml,
            "pluto",
            &args()
        )
        .is_err());
        assert_eq!(codex::string("it's"), "\"it's\"");
        assert!(manual(Format::CodexToml, "pluto", &args()).starts_with("[mcp_servers.pluto]"));
    }

    #[test]
    fn opencode_keeps_the_program_as_the_first_word_of_its_command() {
        let after = add(
            Some(r#"{"theme":"opencode","mcp":{"x":{"type":"remote","url":"u"}}}"#),
            Format::OpenCode,
            "/opt/pluto",
            &args(),
        )
        .unwrap();
        let v: Value = serde_json::from_str(&after).unwrap();
        assert_eq!(v["mcp"]["x"]["url"], "u");
        assert_eq!(v["mcp"]["pluto"]["type"], "local");
        assert_eq!(v["mcp"]["pluto"]["command"][0], "/opt/pluto");
        assert_eq!(v["mcp"]["pluto"]["command"][1], "--mcp-bridge");
        assert!(is_set(Some(&after), Format::OpenCode, "/opt/pluto"));
        let plugin = opencode_plugin("C:\\Pluto\\pluto.exe");
        assert!(plugin.starts_with(OPENCODE_PLUGIN_MARK));
        assert!(plugin.contains(r#"const PLUTO = "C:\\Pluto\\pluto.exe";"#));
        assert!(plugin.contains("session.idle"));
        // It also reacts when OpenCode asks for permission, once per request.
        assert!(plugin.contains("permission.asked") && plugin.contains("permission.updated"));
        assert!(plugin.contains("agent_permission") && plugin.contains("asked.has(id)"));
    }

    #[test]
    fn codex_gets_an_approval_hook_that_keeps_the_users_own_hooks_and_comes_out_again() {
        let before = r#"{"hooks":{"PermissionRequest":[{"matcher":"Bash","hooks":[{"type":"command","command":"python3 ~/mine.py"}]}],"Stop":[{"hooks":[{"type":"command","command":"x"}]}]}}"#;
        let after = add_codex_hooks(Some(before), "/opt/pluto").unwrap();
        let again = add_codex_hooks(Some(&after), "/opt/pluto").unwrap();
        assert_eq!(after, again, "added once");
        assert!(has_codex_hooks(Some(&again)));
        assert!(
            !has_hooks(Some(&again)),
            "Claude's hooks are a separate thing"
        );
        assert!(again.contains("--react agent_permission --assistant codex"));
        let back: Value =
            serde_json::from_str(&remove_codex_hooks(Some(&again)).unwrap().unwrap()).unwrap();
        assert_eq!(back, serde_json::from_str::<Value>(before).unwrap());
        assert_eq!(remove_codex_hooks(Some(before)).unwrap(), None);
        let fresh: Value = serde_json::from_str(&add_codex_hooks(None, "p").unwrap()).unwrap();
        assert_eq!(
            fresh["hooks"]["PermissionRequest"][0]["hooks"][0]["type"],
            "command"
        );
    }

    #[test]
    fn cursor_hooks_are_added_once_and_removed_leaving_the_users_own() {
        let before = r#"{"version":1,"hooks":{"stop":[{"command":"./mine.sh"}],"beforeShellExecution":[{"command":"./check.sh"}]}}"#;
        let after = add_cursor_hooks(Some(before), "/opt/pluto").unwrap();
        let again = add_cursor_hooks(Some(&after), "/opt/pluto").unwrap();
        let v: Value = serde_json::from_str(&again).unwrap();
        let stop = v["hooks"]["stop"].as_array().unwrap();
        assert_eq!(stop.len(), 2);
        assert_eq!(
            stop[1]["command"],
            "\"/opt/pluto\" --react agent_done --assistant cursor"
        );
        let back: Value =
            serde_json::from_str(&remove_cursor_hooks(Some(&again)).unwrap().unwrap()).unwrap();
        assert_eq!(back, serde_json::from_str::<Value>(before).unwrap());
        assert_eq!(remove_cursor_hooks(Some(before)).unwrap(), None);
        let fresh: Value = serde_json::from_str(&add_cursor_hooks(None, "p").unwrap()).unwrap();
        assert_eq!(fresh["version"], 1);
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
        assert!(v["hooks"]["UserPromptSubmit"][0]["hooks"][0]["command"]
            .as_str()
            .unwrap()
            .contains("--react agent_resumed --assistant claude-code"));
        assert!(has_hooks(Some(&twice)));

        let back = remove_hooks(Some(&twice)).unwrap().unwrap();
        let v: Value = serde_json::from_str(&back).unwrap();
        assert_eq!(v["hooks"]["Stop"][0]["hooks"][0]["command"], "say done");
        assert!(v["hooks"].get("Notification").is_none());
        assert!(v["hooks"].get("UserPromptSubmit").is_none());
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
