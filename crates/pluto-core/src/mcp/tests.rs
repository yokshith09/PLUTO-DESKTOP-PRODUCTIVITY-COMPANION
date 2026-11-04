//! The server driven by the official MCP client over an in-memory pipe, as an assistant would.

use std::sync::{Arc, Mutex};

use rmcp::model::{CallToolRequestParams, CallToolResult, ClientConfig, ProtocolVersion};
use rmcp::service::RunningService;
use rmcp::{ClientLifecycleMode, ClientServiceExt, RoleClient};
use serde_json::{json, Value};

use super::*;

#[derive(Default)]
struct FakeHost {
    shown: Mutex<Vec<PetMessage>>,
    recorded: Mutex<Vec<(&'static str, String, bool, String)>>,
    data: Option<read::Data>,
    changes: Mutex<Vec<write::Change>>,
    focusing: bool,
    answer: Option<String>,
    asked: Mutex<Vec<ask::Question>>,
    waits: Mutex<Vec<WaitChange>>,
}

impl Host for FakeHost {
    fn status(&self) -> HostFuture<'_, Status> {
        Box::pin(async {
            Status {
                focus: Some(FocusNow {
                    kind: "focus".into(),
                    minutes_left: 12,
                    paused: false,
                }),
                app_in_front: Some("VS Code".into()),
                today: TodayCounts {
                    done: 2,
                    open: 3,
                    overdue: 1,
                },
            }
        })
    }
    fn show(&self, message: PetMessage) {
        self.shown.lock().unwrap().push(message);
    }
    fn data(&self) -> Option<read::Data> {
        self.data.clone()
    }
    fn changed(&self, _tool: &'static str, _assistant: &str, change: write::Change) {
        self.changes.lock().unwrap().push(change);
    }
    fn hold(&self, _message: &PetMessage) -> bool {
        self.focusing
    }
    fn ask(&self, question: ask::Question) -> HostFuture<'_, Option<String>> {
        self.asked.lock().unwrap().push(question);
        let answer = self.answer.clone();
        Box::pin(async move { answer })
    }
    fn waiting(&self, change: WaitChange) {
        self.waits.lock().unwrap().push(change);
    }
    fn record(&self, tool: &'static str, assistant: &str, ok: bool, detail: String) {
        self.recorded
            .lock()
            .unwrap()
            .push((tool, assistant.to_owned(), ok, detail));
    }
}

type Client = RunningService<RoleClient, ClientConfig>;

async fn connect(mode: ClientLifecycleMode) -> (Client, Arc<FakeHost>) {
    connect_to(FakeHost::default(), mode).await
}

async fn connect_to(host: FakeHost, mode: ClientLifecycleMode) -> (Client, Arc<FakeHost>) {
    let host = Arc::new(host);
    let server = PlutoMcp::new(host.clone(), "Claude Code", Arc::new(RateLimit::default()));
    let (server_end, client_end) = tokio::io::duplex(64 * 1024);
    tokio::spawn(server.serve(server_end));
    let client = ClientConfig::default()
        .serve_with_lifecycle(client_end, mode)
        .await
        .expect("the client connects");
    (client, host)
}

fn newest() -> ClientLifecycleMode {
    ClientLifecycleMode::Discover {
        preferred_versions: vec![ProtocolVersion::V_2026_07_28],
    }
}

async fn call(client: &Client, tool: &'static str, args: Value) -> CallToolResult {
    let mut params = CallToolRequestParams::new(tool);
    if let Value::Object(map) = args {
        params = params.with_arguments(map);
    }
    client
        .call_tool(params)
        .await
        .expect("the call is answered")
}

fn text(result: &CallToolResult) -> String {
    serde_json::to_value(&result.content).unwrap().to_string()
}

#[tokio::test]
async fn an_assistant_on_the_newest_protocol_sees_the_three_pet_tools_in_a_fixed_order() {
    let (client, _) = connect(newest()).await;
    let tools = client.list_all_tools().await.unwrap();
    let names: Vec<_> = tools.iter().map(|t| t.name.to_string()).collect();
    assert_eq!(
        names,
        [
            "ask_person",
            "meeting_delete",
            "meetings_list",
            "note_add",
            "note_append",
            "note_get",
            "notes_search",
            "react",
            "reminder_add",
            "reminder_delete",
            "reminders_list",
            "say",
            "setting_change",
            "status",
            "task_add",
            "task_complete",
            "task_get",
            "task_update",
            "tasks_list",
            "today",
        ]
    );
    assert!(
        names.iter().all(|n| !n.contains("diary")),
        "no tool reaches the diary"
    );
    let status = tools.iter().find(|t| t.name == "status").unwrap();
    assert!(
        status.output_schema.is_some(),
        "status describes its answer"
    );
    let hints = status.annotations.clone().unwrap();
    assert_eq!(hints.read_only_hint, Some(true));
    let react = tools.iter().find(|t| t.name == "react").unwrap();
    assert_eq!(
        react.annotations.clone().unwrap().destructive_hint,
        Some(false)
    );
    client.cancel().await.unwrap();
}

#[tokio::test]
async fn every_call_is_noted_for_the_assistants_page_with_what_happened() {
    let (client, host) = connect(newest()).await;
    call(&client, "status", json!({})).await;
    call(&client, "react", json!({ "reaction": "agent_done" })).await;
    call(&client, "say", json!({ "text": "" })).await;
    let recorded = host.recorded.lock().unwrap().clone();
    assert_eq!(recorded.len(), 3);
    assert_eq!(recorded[0].0, "status");
    assert!(recorded[0].2);
    assert_eq!(recorded[1].1, "Claude Code");
    assert_eq!(recorded[1].3, "The pet showed agent_done.");
    assert_eq!(recorded[2].0, "say");
    assert!(!recorded[2].2, "a refused call is noted as refused");
    client.cancel().await.unwrap();
}

#[tokio::test]
async fn an_assistant_on_the_previous_protocol_with_the_start_up_handshake_works_too() {
    let (client, host) = connect(ClientLifecycleMode::Initialize).await;
    let info = client.peer_info().unwrap();
    assert_eq!(info.server_info.as_ref().unwrap().name, "pluto");
    assert!(info
        .instructions
        .as_deref()
        .unwrap()
        .contains("diary is private"));
    let done = call(&client, "react", json!({ "reaction": "agent_done" })).await;
    assert_ne!(done.is_error, Some(true));
    assert_eq!(host.shown.lock().unwrap()[0].text, "Claude Code is done");
    client.cancel().await.unwrap();
}

#[tokio::test]
async fn status_answers_with_structured_content_and_no_titles() {
    let (client, _) = connect(newest()).await;
    let result = call(&client, "status", json!({})).await;
    let value = result.structured_content.expect("structured answer");
    assert_eq!(value["today"]["open"], 3);
    assert_eq!(value["focus"]["minutes_left"], 12);
    assert_eq!(value["app_in_front"], "VS Code");
    client.cancel().await.unwrap();
}

#[tokio::test]
async fn react_shows_the_line_with_the_name_set_in_pluto_and_refuses_unknown_reactions() {
    let (client, host) = connect(newest()).await;
    let ok = call(&client, "react", json!({ "reaction": "agent_needs_you" })).await;
    assert_ne!(ok.is_error, Some(true));
    let unknown = call(&client, "react", json!({ "reaction": "dance" })).await;
    assert_eq!(unknown.is_error, Some(true));
    assert!(
        text(&unknown).contains("agent_done"),
        "the refusal lists the valid names"
    );
    let shown = host.shown.lock().unwrap().clone();
    assert_eq!(shown.len(), 1);
    assert_eq!(shown[0].text, "Claude Code needs you");
    assert_eq!(shown[0].reaction, Some("agent_needs_you"));
    client.cancel().await.unwrap();
}

#[tokio::test]
async fn say_shows_clean_plain_text_and_refuses_empty_or_long_bubbles() {
    let (client, host) = connect(newest()).await;
    let ok = call(&client, "say", json!({ "text": "  Tests\n\tpassed  " })).await;
    assert_ne!(ok.is_error, Some(true));
    let long = call(
        &client,
        "say",
        json!({ "text": "x".repeat(SAY_MAX_CHARS + 1) }),
    )
    .await;
    assert_eq!(long.is_error, Some(true));
    let empty = call(&client, "say", json!({ "text": " \n " })).await;
    assert_eq!(empty.is_error, Some(true));
    let shown = host.shown.lock().unwrap().clone();
    assert_eq!(shown.len(), 1);
    assert_eq!(shown[0].text, "Tests passed");
    assert_eq!(shown[0].reaction, None);
    assert_eq!(shown[0].assistant, "Claude Code");
    client.cancel().await.unwrap();
}

#[tokio::test]
async fn the_eleventh_call_of_a_tool_in_a_minute_is_refused_and_other_tools_still_work() {
    let (client, host) = connect(newest()).await;
    for _ in 0..CALLS_PER_MINUTE {
        let r = call(&client, "react", json!({ "reaction": "build_ok" })).await;
        assert_ne!(r.is_error, Some(true));
    }
    let over = call(&client, "react", json!({ "reaction": "build_ok" })).await;
    assert_eq!(over.is_error, Some(true));
    assert!(text(&over).contains("10 a minute"));
    let say = call(&client, "say", json!({ "text": "still here" })).await;
    assert_ne!(say.is_error, Some(true));
    assert_eq!(host.shown.lock().unwrap().len(), CALLS_PER_MINUTE + 1);
    client.cancel().await.unwrap();
}

#[tokio::test(start_paused = true)]
async fn the_limit_frees_up_a_minute_later() {
    let limit = RateLimit::default();
    for _ in 0..CALLS_PER_MINUTE {
        assert!(limit.allow("say"));
    }
    assert!(!limit.allow("say"));
    tokio::time::advance(std::time::Duration::from_secs(59)).await;
    assert!(!limit.allow("say"));
    tokio::time::advance(std::time::Duration::from_secs(1)).await;
    assert!(limit.allow("say"));
}

#[test]
fn bubbles_lose_control_characters_and_extra_spaces() {
    assert_eq!(clean_bubble("a\u{7}b  c\r\n").unwrap(), "a b c");
    assert!(clean_bubble("").is_err());
    let exactly = "é".repeat(SAY_MAX_CHARS);
    assert_eq!(
        clean_bubble(&exactly).unwrap(),
        exactly,
        "characters, not bytes"
    );
}

#[tokio::test]
async fn hooks_keep_the_waiting_list_and_a_reply_is_silent() {
    let host = Arc::new(FakeHost::default());
    let dyn_host: Arc<dyn Host> = host.clone();
    let server = PlutoMcp::new(dyn_host, "Claude Code", Arc::new(RateLimit::default()));
    server.react_once("agent_needs_you", Some("app · “fix tray”"));
    server.react_once("agent_permission", Some("to use Bash · app"));
    server.react_once("agent_resumed", Some("app"));
    server.react_once("agent_done", Some("app"));
    let waits = host.waits.lock().unwrap().clone();
    assert_eq!(waits.len(), 4);
    assert!(matches!(
        &waits[0],
        WaitChange::Raise {
            kind: waiting::Kind::Needs,
            ..
        }
    ));
    assert!(
        matches!(&waits[1], WaitChange::Raise { kind: waiting::Kind::Permission, place: Some(p), .. } if p == "to use Bash · app")
    );
    assert!(matches!(&waits[2], WaitChange::Clear { place: Some(p), .. } if p == "app"));
    assert!(matches!(&waits[3], WaitChange::Clear { .. }));
    // Only the first, second and last made a bubble: a reply shows nothing and is not logged.
    let shown = host.shown.lock().unwrap().clone();
    assert_eq!(shown.len(), 3);
    assert!(shown.iter().all(|m| !m.text.is_empty()));
    let logged = host.recorded.lock().unwrap().len();
    assert_eq!(logged, 3);
}

#[tokio::test]
async fn the_react_tool_does_not_offer_the_silent_reply() {
    let (client, host) = connect(newest()).await;
    let r = call(&client, "react", json!({ "reaction": "agent_resumed" })).await;
    assert_eq!(r.is_error, Some(true));
    let said = text(&r);
    let offered = said.split("Use one of:").nth(1).unwrap_or_default();
    assert!(offered.contains("agent_done") && !offered.contains("agent_resumed"));
    assert!(host.shown.lock().unwrap().is_empty());
    client.cancel().await.unwrap();
}

#[test]
fn every_reaction_has_a_line_and_only_assistant_lines_carry_the_name() {
    for (name, _) in REACTIONS {
        let (_, line) = reaction_line(name, "Cursor").unwrap();
        assert!(!line.contains("{}"));
    }
    assert_eq!(
        reaction_line("agent_error", "Cursor").unwrap().1,
        "Cursor hit an error"
    );
    assert!(reaction_line("nope", "Cursor").is_none());
}

#[tokio::test]
async fn without_a_running_pluto_the_tools_are_listed_and_every_call_says_so() {
    let (server_end, client_end) = tokio::io::duplex(64 * 1024);
    tokio::spawn(PlutoMcp::offline("Claude Code").serve(server_end));
    let client = ClientConfig::default()
        .serve_with_lifecycle(client_end, newest())
        .await
        .unwrap();
    assert_eq!(client.list_all_tools().await.unwrap().len(), 20);
    for (tool, args) in [
        ("status", json!({})),
        ("react", json!({ "reaction": "agent_done" })),
        ("say", json!({ "text": "hi" })),
        ("today", json!({})),
        ("note_get", json!({ "id": "n1" })),
    ] {
        let r = call(&client, tool, args).await;
        assert_eq!(r.is_error, Some(true), "{tool}");
        assert!(text(&r).contains("Pluto is not running"), "{tool}");
    }
    client.cancel().await.unwrap();
}

mod link_tests {
    use super::*;
    use crate::mcp::link::{self, Refused};

    #[test]
    fn tokens_are_long_random_and_never_repeat() {
        let a = link::new_token();
        let b = link::new_token();
        assert_eq!(a.len(), 64);
        assert!(a.bytes().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    #[test]
    fn the_first_line_must_carry_this_runs_token_and_a_plain_id() {
        let t = link::new_token();
        assert_eq!(
            link::check_hello(&link::hello_line(&t, "claude-code"), &t),
            Ok("claude-code".into())
        );
        assert_eq!(
            link::check_hello(&link::hello_line(&link::new_token(), "claude-code"), &t),
            Err(Refused::WrongToken)
        );
        assert_eq!(
            link::check_hello(&format!("PLUTO1 {t}\n"), &t),
            Err(Refused::BadHello)
        );
        assert_eq!(
            link::check_hello(&format!("PLUTO1 {t} a b\n"), &t),
            Err(Refused::BadHello)
        );
        assert_eq!(
            link::check_hello(&format!("PLUTO2 {t} cursor\n"), &t),
            Err(Refused::BadHello)
        );
        assert_eq!(
            link::check_hello(&link::hello_line(&t, "Bad_Id"), &t),
            Err(Refused::BadHello)
        );
        assert_eq!(
            link::check_hello(&link::hello_line(&t, &"a".repeat(41)), &t),
            Err(Refused::BadHello)
        );
    }

    #[test]
    fn assistants_get_readable_names() {
        assert_eq!(link::display_name("claude-code"), "Claude Code");
        assert_eq!(link::display_name("my-agent"), "My Agent");
        assert_eq!(link::display_name("cursor"), "Cursor");
        assert_eq!(link::display_name("opencode"), "OpenCode");
        assert_eq!(link::display_name("codex"), "Codex");
        assert_eq!(link::display_name("windsurf"), "Windsurf");
    }

    /// Assistant ⇄ bridge (stdio) ⇄ pipe ⇄ Pluto, all in memory: the whole path an assistant uses.
    #[tokio::test]
    async fn an_assistant_reaches_pluto_through_the_bridge_and_the_pet_reacts() {
        let host = Arc::new(FakeHost::default());
        let token = link::new_token();
        let (pluto_end, bridge_pipe) = tokio::io::duplex(64 * 1024);
        let (bridge_stdio, assistant_end) = tokio::io::duplex(64 * 1024);
        let (h, t) = (host.clone() as Arc<dyn Host>, token.clone());
        let pluto = tokio::spawn(async move {
            link::accept(pluto_end, &t, h, |_| Arc::new(RateLimit::default())).await
        });
        let t = token.clone();
        tokio::spawn(async move {
            link::bridge(Some(bridge_pipe), &t, "claude-code", bridge_stdio).await
        });
        let client = ClientConfig::default()
            .serve_with_lifecycle(assistant_end, newest())
            .await
            .unwrap();
        let r = call(&client, "react", json!({ "reaction": "agent_done" })).await;
        assert_ne!(r.is_error, Some(true));
        assert_eq!(host.shown.lock().unwrap()[0].text, "Claude Code is done");
        client.cancel().await.unwrap();
        assert_eq!(pluto.await.unwrap(), Ok("claude-code".into()));
    }

    #[tokio::test]
    async fn a_bridge_with_the_wrong_token_never_reaches_the_pet() {
        let host = Arc::new(FakeHost::default());
        let (pluto_end, bridge_pipe) = tokio::io::duplex(64 * 1024);
        let (bridge_stdio, _assistant_end) = tokio::io::duplex(64 * 1024);
        let h = host.clone() as Arc<dyn Host>;
        let pluto = tokio::spawn(async move {
            link::accept(pluto_end, "right-token", h, |_| {
                Arc::new(RateLimit::default())
            })
            .await
        });
        tokio::spawn(async move {
            link::bridge(
                Some(bridge_pipe),
                "wrong-token",
                "claude-code",
                bridge_stdio,
            )
            .await
        });
        assert_eq!(pluto.await.unwrap(), Err(Refused::WrongToken));
        assert!(host.shown.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_hook_plays_one_reaction_with_the_token_and_nothing_without_it() {
        let host = Arc::new(FakeHost::default());
        let (pluto_end, hook_end) = tokio::io::duplex(4096);
        let h = host.clone() as Arc<dyn Host>;
        let pluto = tokio::spawn(async move {
            link::accept(pluto_end, "tok", h, |_| Arc::new(RateLimit::default())).await
        });
        let said = link::send_reaction(
            hook_end,
            "tok",
            "claude-code",
            "agent_done",
            Some("DESKTOP-PET · “fix tray”"),
        )
        .await;
        assert_eq!(said.as_deref(), Some("The pet showed agent_done."));
        assert_eq!(pluto.await.unwrap(), Ok("claude-code".into()));
        assert_eq!(
            host.shown.lock().unwrap()[0].text,
            "Claude Code is done · DESKTOP-PET · “fix tray”"
        );
        assert_eq!(host.recorded.lock().unwrap()[0].0, "react");

        assert_eq!(
            link::check_react(&link::react_line("bad", "git", "git_push", None), "tok"),
            Err(Refused::WrongToken)
        );
        assert_eq!(
            link::check_react(&link::react_line("tok", "git", "explode", None), "tok"),
            Err(Refused::BadHello)
        );
        assert_eq!(
            link::check_react(&link::react_line("tok", "git", "git_push", None), "tok"),
            Ok(("git".into(), "git_push", None))
        );
        assert_eq!(
            link::check_react(
                &link::react_line("tok", "claude-code", "agent_permission", Some("staysync")),
                "tok"
            ),
            Ok((
                "claude-code".into(),
                "agent_permission",
                Some("staysync".into())
            ))
        );
        assert_eq!(
            link::check_react("PLUTO1R tok git git_push %ZZ\n", "tok"),
            Err(Refused::BadHello)
        );
    }

    #[tokio::test(start_paused = true)]
    async fn a_connection_that_never_says_hello_is_closed() {
        let (pluto_end, _silent) = tokio::io::duplex(1024);
        let r = link::accept(pluto_end, "t", Arc::new(FakeHost::default()), |_| {
            Arc::new(RateLimit::default())
        })
        .await;
        assert_eq!(r, Err(Refused::NoHello));
    }

    #[tokio::test]
    async fn with_pluto_closed_the_bridge_still_lists_the_tools_and_explains() {
        let (bridge_stdio, assistant_end) = tokio::io::duplex(64 * 1024);
        tokio::spawn(link::bridge(
            None::<tokio::io::DuplexStream>,
            "",
            "cursor",
            bridge_stdio,
        ));
        let client = ClientConfig::default()
            .serve_with_lifecycle(assistant_end, newest())
            .await
            .unwrap();
        assert_eq!(client.list_all_tools().await.unwrap().len(), 20);
        let r = call(&client, "say", json!({ "text": "hi" })).await;
        assert!(text(&r).contains("Pluto is not running"));
        client.cancel().await.unwrap();
    }
}

fn read_tests_world() -> (tempfile::TempDir, read::Data) {
    let w = read_tests::world();
    (w.dir, w.data)
}

mod read_tests {
    use chrono::NaiveDate;
    use chrono_tz::Tz;

    use super::*;
    use crate::bus::EventBus;
    use crate::clock::FakeClock;
    use crate::db::Database;
    use crate::diary::{self, Diary};
    use crate::notes::{self, NoteInput};
    use crate::tasks::{self, TaskInput};

    pub(super) struct World {
        pub(super) dir: tempfile::TempDir,
        pub(super) data: read::Data,
    }

    pub(super) fn world() -> World {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("pluto.db"), EventBus::default()).unwrap();
        let clock = FakeClock::at_local(
            Tz::Asia__Kolkata,
            NaiveDate::from_ymd_opt(2026, 11, 2).unwrap(),
            10,
            0,
            0,
        );
        let (db, clock): (Arc<Database>, Arc<dyn crate::clock::Clock>) =
            (Arc::new(db), Arc::new(clock));
        World {
            dir,
            data: read::Data {
                settings: Some(Arc::new(crate::settings_service::SettingsService::new(
                    db.clone(),
                    clock.clone(),
                ))),
                db,
                clock,
            },
        }
    }

    async fn client_for(w: &World) -> Client {
        let host = FakeHost {
            data: Some(w.data.clone()),
            ..FakeHost::default()
        };
        connect_to(host, newest()).await.0
    }

    fn answer(r: &CallToolResult) -> Value {
        r.structured_content.clone().expect("a structured answer")
    }

    #[tokio::test]
    async fn today_and_task_lists_show_the_persons_tasks_and_task_get_the_details() {
        let w = world();
        let today = w.data.clock.today();
        let t = tasks::create(
            &w.data.db,
            &*w.data.clock,
            TaskInput {
                title: "Write the report".into(),
                description: "Sections 1 to 3".into(),
                planned_date: Some(today),
                ..TaskInput::default()
            },
        )
        .await
        .unwrap();
        let client = client_for(&w).await;

        let plan = answer(&call(&client, "today", json!({})).await);
        assert_eq!(plan["date"], "2026-11-02");
        assert_eq!(plan["tasks"][0]["title"], "Write the report");

        let list =
            answer(&call(&client, "tasks_list", json!({ "which": "all", "limit": 5 })).await);
        assert_eq!(list["tasks"].as_array().unwrap().len(), 1);
        assert_eq!(list["more"], false);

        let one = answer(&call(&client, "task_get", json!({ "id": t.id })).await);
        assert_eq!(one["description"], "Sections 1 to 3");

        let missing = call(&client, "task_get", json!({ "id": "nope" })).await;
        assert_eq!(missing.is_error, Some(true));
        assert!(text(&missing).contains("There is no task with that id."));
        client.cancel().await.unwrap();
    }

    #[tokio::test]
    async fn notes_are_found_and_read_but_never_the_diary_or_the_bin() {
        let w = world();
        let (db, clock) = (&w.data.db, &*w.data.clock);
        let kept = notes::create(
            db,
            clock,
            NoteInput {
                title: "Trip plan".into(),
                body: "Pack the blue umbrella".into(),
                ..NoteInput::default()
            },
        )
        .await
        .unwrap();
        let binned = notes::create(
            db,
            clock,
            NoteInput {
                title: "Old umbrella list".into(),
                ..NoteInput::default()
            },
        )
        .await
        .unwrap();
        notes::delete(db, clock, &binned.id).await.unwrap();
        let diary = Diary::default();
        diary::setup(db, &diary, clock, "secret-pass")
            .await
            .unwrap();
        diary::day_save(
            db,
            &diary,
            clock,
            "2026-11-02",
            "umbrella secret in my diary",
        )
        .await
        .unwrap();
        let client = client_for(&w).await;

        let hits = answer(&call(&client, "notes_search", json!({ "query": "umbrella" })).await);
        let found: Vec<_> = hits["notes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n["title"].clone())
            .collect();
        assert_eq!(
            found,
            [json!("Trip plan")],
            "the Bin and the diary are never searched"
        );

        let note = answer(&call(&client, "note_get", json!({ "id": kept.id })).await);
        assert_eq!(note["body"], "Pack the blue umbrella");
        assert_eq!(note["cut"], false);

        let gone = call(&client, "note_get", json!({ "id": binned.id })).await;
        assert_eq!(gone.is_error, Some(true));

        let blank = call(&client, "notes_search", json!({ "query": "  " })).await;
        assert_eq!(blank.is_error, Some(true));
        client.cancel().await.unwrap();
    }

    #[tokio::test]
    async fn todays_plan_status_and_notes_are_resources_but_never_the_diary() {
        let w = world();
        let n = notes::create(
            &w.data.db,
            &*w.data.clock,
            NoteInput {
                title: "Recipe".into(),
                body: "Rice".into(),
                ..NoteInput::default()
            },
        )
        .await
        .unwrap();
        let client = client_for(&w).await;
        let listed: Vec<String> = client
            .list_all_resources()
            .await
            .unwrap()
            .into_iter()
            .map(|r| r.uri.clone())
            .collect();
        assert_eq!(listed, ["pluto://today", "pluto://status"]);
        let templates = client.list_all_resource_templates().await.unwrap();
        assert_eq!(templates.len(), 2);
        let read = |uri: String| {
            let client = &client;
            async move {
                client
                    .read_resource(rmcp::model::ReadResourceRequestParams::new(uri))
                    .await
            }
        };
        let today = serde_json::to_string(&read("pluto://today".into()).await.unwrap()).unwrap();
        assert!(today.contains("2026-11-02"));
        let note =
            serde_json::to_string(&read(format!("pluto://note/{}", n.id)).await.unwrap()).unwrap();
        assert!(note.contains("Rice"));
        assert!(read("pluto://diary/2026-11-02".into()).await.is_err());
        client.cancel().await.unwrap();
    }

    #[tokio::test]
    async fn read_tools_say_pluto_is_starting_until_its_data_is_open() {
        let (client, _) = connect(newest()).await;
        let r = call(&client, "today", json!({})).await;
        assert_eq!(r.is_error, Some(true));
        assert!(text(&r).contains("still starting"));
        client.cancel().await.unwrap();
    }
}

mod write_tests {
    use super::read_tests_world as world;
    use super::*;
    use crate::notes;
    use crate::reminders;
    use crate::tasks::{self, TaskStatus};

    async fn client_for(data: &read::Data, focusing: bool) -> (Client, Arc<FakeHost>) {
        let host = FakeHost {
            data: Some(data.clone()),
            focusing,
            ..FakeHost::default()
        };
        connect_to(host, newest()).await
    }

    fn id(r: &CallToolResult) -> String {
        assert_ne!(r.is_error, Some(true), "{}", text(r));
        r.structured_content.clone().unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned()
    }

    async fn undo_last(host: &FakeHost, data: &read::Data) -> String {
        let change = host.changes.lock().unwrap().last().cloned().unwrap();
        write::undo(data, change.undo.as_ref().unwrap())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn a_task_can_be_added_changed_and_finished_and_each_step_undone() {
        let (_dir, data) = world();
        let (client, host) = client_for(&data, false).await;

        let t = id(&call(
            &client,
            "task_add",
            json!({ "title": "Call the bank", "priority": "high", "due": "2026-11-05" }),
        )
        .await);
        let task = tasks::get(&data.db, &t).await.unwrap();
        assert_eq!(task.due_date.unwrap().to_string(), "2026-11-05");

        id(&call(
            &client,
            "task_update",
            json!({ "id": t, "title": "Call the bank at 10", "due": "" }),
        )
        .await);
        assert_eq!(tasks::get(&data.db, &t).await.unwrap().due_date, None);
        undo_last(&host, &data).await;
        let back = tasks::get(&data.db, &t).await.unwrap();
        assert_eq!(
            (back.title.as_str(), back.due_date.unwrap().to_string()),
            ("Call the bank", "2026-11-05".into())
        );

        id(&call(&client, "task_complete", json!({ "id": t })).await);
        assert_eq!(
            tasks::get(&data.db, &t).await.unwrap().status,
            TaskStatus::Completed
        );
        undo_last(&host, &data).await;
        assert_eq!(
            tasks::get(&data.db, &t).await.unwrap().status,
            TaskStatus::Planned
        );

        // Undo the very first change: the task is gone again.
        let first = host.changes.lock().unwrap()[0].clone();
        write::undo(&data, first.undo.as_ref().unwrap())
            .await
            .unwrap();
        assert!(tasks::get(&data.db, &t).await.is_err());

        let bad = call(
            &client,
            "task_add",
            json!({ "title": "x", "due": "next friday" }),
        )
        .await;
        assert_eq!(bad.is_error, Some(true));
        assert!(text(&bad).contains("2026-11-02"));
        client.cancel().await.unwrap();
    }

    #[tokio::test]
    async fn reminders_and_notes_are_added_and_undone_and_nothing_is_deleted_for_good() {
        let (_dir, data) = world();
        let (client, host) = client_for(&data, false).await;

        let past = call(
            &client,
            "reminder_add",
            json!({ "title": "Stand up", "at": "2026-11-02 09:00" }),
        )
        .await;
        assert_eq!(past.is_error, Some(true), "10:00 now, 09:00 has passed");
        let r = id(&call(
            &client,
            "reminder_add",
            json!({ "title": "Stand up", "at": "2026-11-02 17:30" }),
        )
        .await);
        assert_eq!(reminders::list(&data.db, false).await.unwrap()[0].id, r);
        undo_last(&host, &data).await;
        assert!(reminders::list(&data.db, false).await.unwrap().is_empty());

        let n = id(&call(
            &client,
            "note_add",
            json!({ "title": "Review", "body": "Good week" }),
        )
        .await);
        id(&call(
            &client,
            "note_append",
            json!({ "id": n, "text": "Next: sleep earlier" }),
        )
        .await);
        assert_eq!(
            notes::get(&data.db, &n).await.unwrap().body,
            "Good week\nNext: sleep earlier"
        );
        undo_last(&host, &data).await;
        assert_eq!(notes::get(&data.db, &n).await.unwrap().body, "Good week");
        let made = host.changes.lock().unwrap()[1].clone();
        write::undo(&data, made.undo.as_ref().unwrap())
            .await
            .unwrap();
        assert!(
            notes::in_bin(&data.db, &n).await.unwrap(),
            "undone notes go to the Bin"
        );
        client.cancel().await.unwrap();
    }

    async fn asking(data: &read::Data, answer: Option<&str>) -> (Client, Arc<FakeHost>) {
        let host = FakeHost {
            data: Some(data.clone()),
            answer: answer.map(str::to_owned),
            ..FakeHost::default()
        };
        connect_to(host, newest()).await
    }

    #[tokio::test]
    async fn a_setting_changes_only_after_allow_on_the_pet_and_can_be_undone() {
        let (_dir, data) = world();
        let settings = data.settings.clone().unwrap();
        let theme = || async { settings.get_all().await.unwrap()["general.theme"].clone() };

        let (client, host) = asking(&data, Some("Deny")).await;
        let no = call(
            &client,
            "setting_change",
            json!({ "key": "general.theme", "value": "dark" }),
        )
        .await;
        assert_eq!(no.is_error, Some(true));
        assert_eq!(theme().await, json!("system"));
        let q = host.asked.lock().unwrap()[0].clone();
        assert_eq!(q.title, "Claude Code wants to change a setting");
        assert_eq!(q.detail, "Theme: system → dark");
        assert_eq!(q.options, ["Allow", "Deny"]);
        client.cancel().await.unwrap();

        let (client, _) = asking(&data, None).await;
        let silent = call(
            &client,
            "setting_change",
            json!({ "key": "general.theme", "value": "dark" }),
        )
        .await;
        assert!(text(&silent).contains("did not answer"));
        client.cancel().await.unwrap();

        let (client, host) = asking(&data, Some("Allow")).await;
        id(&call(
            &client,
            "setting_change",
            json!({ "key": "general.theme", "value": "dark" }),
        )
        .await);
        assert_eq!(theme().await, json!("dark"));
        undo_last(&host, &data).await;
        assert_eq!(theme().await, json!("system"));

        let off_limits = call(
            &client,
            "setting_change",
            json!({ "key": "mcp.enabled", "value": false }),
        )
        .await;
        assert!(text(&off_limits).contains("may change only"));
        let bad = call(
            &client,
            "setting_change",
            json!({ "key": "pet.size", "value": "XXL" }),
        )
        .await;
        assert_eq!(bad.is_error, Some(true));
        client.cancel().await.unwrap();
    }

    #[tokio::test]
    async fn a_question_on_the_pet_returns_the_button_pressed_or_nothing() {
        let (_dir, data) = world();
        let (client, host) = asking(&data, Some("Tomorrow")).await;
        let r = call(
            &client,
            "ask_person",
            json!({ "question": "When should I schedule it?", "options": ["Today", "Tomorrow"] }),
        )
        .await;
        assert_eq!(r.structured_content.unwrap()["answer"], "Tomorrow");
        assert_eq!(host.asked.lock().unwrap()[0].title, "Claude Code asks");
        let one = call(
            &client,
            "ask_person",
            json!({ "question": "Ok?", "options": ["Yes"] }),
        )
        .await;
        assert_eq!(one.is_error, Some(true));
        client.cancel().await.unwrap();
        let (client, _) = asking(&data, None).await;
        let r = call(
            &client,
            "ask_person",
            json!({ "question": "Ok?", "options": ["Yes", "No"] }),
        )
        .await;
        assert_eq!(r.structured_content.unwrap()["answer"], json!(null));
        client.cancel().await.unwrap();
    }

    #[tokio::test]
    async fn reminders_and_meetings_deleted_by_an_assistant_go_to_the_bin_and_undo_brings_them_back(
    ) {
        let (_dir, data) = world();
        let (client, host) = client_for(&data, false).await;
        let r = id(&call(
            &client,
            "reminder_add",
            json!({ "title": "Pay rent", "at": "2026-11-03 09:00" }),
        )
        .await);
        let listed = call(&client, "reminders_list", json!({})).await;
        assert_eq!(
            listed.structured_content.unwrap()["reminders"][0]["at"],
            "2026-11-03 09:00"
        );
        id(&call(&client, "reminder_delete", json!({ "id": r })).await);
        assert!(reminders::list(&data.db, true).await.unwrap().is_empty());
        assert_eq!(reminders::list_binned(&data.db).await.unwrap().len(), 1);
        undo_last(&host, &data).await;
        assert_eq!(reminders::list(&data.db, true).await.unwrap().len(), 1);

        let m = crate::meetings::create(
            &data.db,
            &*data.clock,
            crate::meetings::MeetingInput {
                title: "Retro".into(),
                starts_at: Some(data.clock.now_ms()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        let meetings = call(&client, "meetings_list", json!({})).await;
        assert_eq!(
            meetings.structured_content.unwrap()["meetings"][0]["title"],
            "Retro"
        );
        id(&call(&client, "meeting_delete", json!({ "id": m.id })).await);
        assert_eq!(
            crate::meetings::list_binned(&data.db).await.unwrap()[0].title,
            "Retro"
        );
        undo_last(&host, &data).await;
        assert!(crate::meetings::get(&data.db, &m.id).await.is_ok());
        client.cancel().await.unwrap();
    }

    #[tokio::test]
    async fn during_focus_the_guard_keeps_pet_messages_back_and_says_so() {
        let (_dir, data) = world();
        let (client, host) = client_for(&data, true).await;
        let r = call(&client, "react", json!({ "reaction": "agent_done" })).await;
        assert!(text(&r).contains("focus session"));
        assert!(host.shown.lock().unwrap().is_empty());
        client.cancel().await.unwrap();
    }

    #[tokio::test]
    async fn the_ready_made_prompts_are_listed_and_the_review_writes_no_note_unless_asked() {
        let (_dir, data) = world();
        let (client, _) = client_for(&data, false).await;
        let prompts = client.list_all_prompts().await.unwrap();
        let names: Vec<_> = prompts.iter().map(|p| p.name.to_string()).collect();
        for want in [
            "plan_my_day",
            "daily_review",
            "weekly_review",
            "meeting_to_tasks",
            "what_was_i_doing",
            "study_quiz",
        ] {
            assert!(names.contains(&want.to_string()), "{want}");
        }
        let review = client
            .get_prompt(rmcp::model::GetPromptRequestParams::new("weekly_review"))
            .await
            .unwrap();
        let said = serde_json::to_string(&review.messages).unwrap();
        assert!(said.contains("only save it as a note in Pluto if I ask"));
        client.cancel().await.unwrap();
    }
}

#[test]
fn git_reactions_name_the_project() {
    assert_eq!(
        super::reaction_line("git_push", "Pluto").map(|(_, l)| l),
        Some("Pluto: pushed".to_owned())
    );
    assert_eq!(
        super::reaction_line("git_commit", "StaySync").map(|(_, l)| l),
        Some("StaySync: committed".to_owned())
    );
}
