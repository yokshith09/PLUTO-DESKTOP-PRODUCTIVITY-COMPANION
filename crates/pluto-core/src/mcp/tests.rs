//! The server driven by the official MCP client over an in-memory pipe, as an assistant would.

use std::sync::{Arc, Mutex};

use rmcp::model::{CallToolRequestParams, CallToolResult, ClientConfig, ProtocolVersion};
use rmcp::service::RunningService;
use rmcp::{ClientLifecycleMode, ClientServiceExt, RoleClient, ServiceExt};
use serde_json::{json, Value};

use super::*;

#[derive(Default)]
struct FakeHost {
    shown: Mutex<Vec<PetMessage>>,
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
}

type Client = RunningService<RoleClient, ClientConfig>;

async fn connect(mode: ClientLifecycleMode) -> (Client, Arc<FakeHost>) {
    let host = Arc::new(FakeHost::default());
    let server = PlutoMcp::new(host.clone(), "Claude Code", Arc::new(RateLimit::default()));
    let (server_end, client_end) = tokio::io::duplex(64 * 1024);
    tokio::spawn(async move {
        if let Ok(running) = server.serve(server_end).await {
            let _ = running.waiting().await;
        }
    });
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
    assert_eq!(names, ["react", "say", "status"]);
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
