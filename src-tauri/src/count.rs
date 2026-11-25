//! The anonymous daily count, the network half (the rule is `pluto_core::count`).
//!
//! On by default with no switch for now (owner, 2026-11-24); what it sends is described on the
//! website's privacy page. It runs only in builds made with `PLUTO_COUNT_URL` set (the release
//! workflow sets it), so development and test runs are never counted.
//!
//! Every hour while Pluto is open it asks the core rule what to send today: hello on first open,
//! otherwise at most one ping per UTC day. Failures are silent and retried an hour later.

use std::path::PathBuf;
use std::time::Duration;

use pluto_core::count::{self, Action, CountState};

/// Set at build time, e.g. `https://pluto-api.<account>.workers.dev`. Unset: nothing is sent.
const BASE: Option<&str> = option_env!("PLUTO_COUNT_URL");
const VERSION: &str = env!("CARGO_PKG_VERSION");
const EVERY: Duration = Duration::from_secs(60 * 60);
const FIRST_DELAY: Duration = Duration::from_secs(20);

pub fn start(data_dir: PathBuf) {
    let Some(base) = BASE
        .map(|b| b.trim_end_matches('/').to_owned())
        .filter(|b| b.starts_with("https://"))
    else {
        tracing::debug!("anonymous count off in this build (no PLUTO_COUNT_URL)");
        return;
    };
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(concat!("Pluto/", env!("CARGO_PKG_VERSION")))
        .build()
    {
        Ok(c) => c,
        Err(error) => {
            tracing::warn!(%error, "anonymous count: couldn't start the HTTPS client");
            return;
        }
    };
    tauri::async_runtime::spawn(async move {
        // Let the app finish starting before the first request.
        tokio::time::sleep(FIRST_DELAY).await;
        let (mut state, new) = count::load(&data_dir);
        if new && count::save(&data_dir, &state).is_err() {
            // Without a saved number every start would look like a new install: send nothing.
            tracing::warn!("anonymous count: couldn't save the install number; not counting");
            return;
        }
        loop {
            once(&client, &base, &data_dir, &mut state).await;
            tokio::time::sleep(EVERY).await;
        }
    });
}

async fn once(client: &reqwest::Client, base: &str, dir: &std::path::Path, state: &mut CountState) {
    let today = chrono::Utc::now().date_naive();
    let action = count::next_action(state, today);
    let path = match action {
        Action::Hello => "/v1/hello",
        Action::Ping => "/v1/ping",
        Action::Nothing => return,
    };
    let Some(body) = count::body(state, action, count::os_name(), VERSION) else {
        return;
    };
    let reply = match client
        .post(format!("{base}{path}"))
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await
    {
        Ok(res) => {
            let status = res.status().as_u16();
            let text = res.text().await.unwrap_or_default();
            count::read_reply(action, status, &text)
        }
        Err(_) => count::Reply::TryLater,
    };
    tracing::debug!(?action, ?reply, "anonymous count");
    if count::apply(state, &reply, today) {
        if let Err(error) = count::save(dir, state) {
            tracing::warn!(%error, "anonymous count: couldn't save");
        }
    }
}
