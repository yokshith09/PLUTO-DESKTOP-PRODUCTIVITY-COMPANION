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

#[tokio::test]
async fn without_a_running_pluto_the_tools_are_listed_and_every_call_says_so() {
    let (server_end, client_end) = tokio::io::duplex(64 * 1024);
    tokio::spawn(PlutoMcp::offline("Claude Code").serve(server_end));
    let client = ClientConfig::default()
        .serve_with_lifecycle(client_end, newest())
        .await
        .unwrap();
    assert_eq!(client.list_all_tools().await.unwrap().len(), 3);
    for (tool, args) in [
        ("status", json!({})),
        ("react", json!({ "reaction": "agent_done" })),
        ("say", json!({ "text": "hi" })),
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
        assert_eq!(client.list_all_tools().await.unwrap().len(), 3);
        let r = call(&client, "say", json!({ "text": "hi" })).await;
        assert!(text(&r).contains("Pluto is not running"));
        client.cancel().await.unwrap();
    }
}
