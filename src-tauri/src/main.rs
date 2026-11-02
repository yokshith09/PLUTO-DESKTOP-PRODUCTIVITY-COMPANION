// Hide the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // An assistant's bridge runs and exits here; it never opens the app (MCP_PLAN.md §3.1).
    if let Some(code) = pluto_lib::bridge_main() {
        std::process::exit(code);
    }
    pluto_lib::run()
}
