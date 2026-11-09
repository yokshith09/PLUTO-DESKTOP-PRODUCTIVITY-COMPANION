import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ipc, type AssistantInfo } from "@/ipc";
import { AssistantsPage, SOON, programOf } from "./AssistantsPage";
import { REACT_KEYS, TOOLS } from "./perms";

// Radix Slider (the volume) measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const claude = (connected: boolean): AssistantInfo => ({
  id: "claude", name: "Claude", installed: true, connected,
  places: [
    { label: "Claude Code", path: "/home/you/.claude.json", installed: true, connected, manual: '{"mcpServers":{"pluto":{"command":"pluto","args":["--mcp-bridge","--assistant","claude-code"]}}}' },
    { label: "Claude app", path: "/home/you/Claude/claude_desktop_config.json", installed: true, connected, manual: '{"mcpServers":{"pluto":{"command":"pluto","args":["--mcp-bridge","--assistant","claude-desktop"]}}}' },
  ],
});
const codex: AssistantInfo = {
  id: "codex", name: "Codex", installed: true, connected: false,
  places: [{ label: "Codex", path: "/home/you/.codex/config.toml", installed: true, connected: false, manual: "[mcp_servers.pluto]\ncommand = 'C:\\Program Files\\Pluto\\pluto.exe'\nargs = ['--mcp-bridge', '--assistant', 'codex']\n" }],
};
const windsurf: AssistantInfo = { id: "windsurf", name: "Windsurf", installed: false, connected: false, places: [{ label: "Windsurf", path: "/home/you/.codeium/windsurf/mcp_config.json", installed: false, connected: false, manual: "{}" }] };
const cursor: AssistantInfo = { id: "cursor", name: "Cursor", installed: false, connected: false, places: [{ label: "Cursor", path: "/home/you/.cursor/mcp.json", installed: false, connected: false, manual: "{}" }] };

function renderPage({ enabled = false, connected = false, dev = false } = {}) {
  vi.spyOn(ipc, "settingsGetAll").mockResolvedValue({ "mcp.enabled": enabled } as never);
  vi.spyOn(ipc, "settingSet").mockResolvedValue(null);
  vi.spyOn(ipc, "prefsGet").mockResolvedValue(dev as never);
  const prefsSet = vi.spyOn(ipc, "prefsSet").mockResolvedValue(null);
  vi.spyOn(ipc, "mcpPermsGet").mockResolvedValue({});
  const permsSet = vi.spyOn(ipc, "mcpPermsSet").mockResolvedValue(null);
  vi.spyOn(ipc, "mcpAssistants").mockResolvedValue([claude(connected), codex, cursor, windsurf]);
  const connect = vi.spyOn(ipc, "mcpConnect").mockResolvedValue(["Claude Code", "Claude app"]);
  const disconnect = vi.spyOn(ipc, "mcpDisconnect").mockResolvedValue(null);
  const activity = vi.spyOn(ipc, "mcpActivity").mockResolvedValue([
    { atMs: 0, assistant: "Claude Code", tool: "today", ok: true, detail: "Read today's plan.", changed: false, undoId: null, undone: false },
    { atMs: 1, assistant: "Claude Code", tool: "task_add", ok: true, detail: "Added the task \"Call the bank\".", changed: true, undoId: 7, undone: false },
  ]);
  vi.spyOn(ipc, "mcpUndo").mockResolvedValue("Removed the task \"Call the bank\".");
  vi.spyOn(ipc, "mcpDeveloper").mockResolvedValue({ gitCommit: "#!/bin/sh\npluto --react git_commit", gitPush: "x", build: "make && pluto --react build_ok", agentDone: "pluto --react agent_done --assistant my-app", agentNeedsYou: "pluto --react agent_needs_you --assistant my-app", agentPermission: "pluto --react agent_permission --assistant my-app" });
  if (!vi.isMockFunction(ipc.devGitWatch)) vi.spyOn(ipc, "devGitWatch").mockResolvedValue({ roots: [], repos: [] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AssistantsPage /></QueryClientProvider>);
  return { connect, disconnect, prefsSet, activity, permsSet };
}

describe("Assistants page", () => {
  it("shows one Claude tile for Claude Code and the Claude app, and Connect sets both up", async () => {
    const { connect } = renderPage();
    const tile = await screen.findByRole("listitem", { name: "Claude" });
    expect(tile.textContent).toContain("Claude Code and Claude app");
    fireEvent.click(within(tile).getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(connect).toHaveBeenCalledWith("claude"));
  });

  it("an assistant that is not installed offers the manual setup instead of Connect", async () => {
    renderPage();
    const tile = await screen.findByRole("listitem", { name: "Cursor" });
    expect(tile.textContent).toContain("Not found on this computer");
    expect(within(tile).queryByRole("button", { name: "Connect" })).toBeNull();
    fireEvent.click(within(tile).getByRole("button", { name: "Set up by hand" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("the manual setup stays hidden until asked for, inside the assistant's settings", async () => {
    const { disconnect } = renderPage({ enabled: true, connected: true });
    expect(screen.queryByLabelText("Claude Code setup")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Claude settings" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("/home/you/.claude.json")).toBeTruthy();
    expect(within(dialog).queryByLabelText("Claude Code setup")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Show manual setup" }));
    expect(within(dialog).getByLabelText("Claude Code setup").textContent).toContain("claude-code");
    expect(within(dialog).getByLabelText("Claude app setup").textContent).toContain("claude-desktop");
    await waitFor(() => expect(within(dialog).getByRole("region", { name: "Recent requests" }).textContent).toContain("Read today's plan."));
    fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith("claude"));
  });

  it("lists Codex and Windsurf with only a summary and Edit setup outside; no tools or reaction chips on the tile (owner 2026-11-09)", async () => {
    renderPage();
    const tile = await screen.findByRole("listitem", { name: "Codex" });
    expect(tile.textContent).toContain(`${TOOLS.length} of ${TOOLS.length} tools · 4 of 4 pet reactions`);
    expect(within(tile).getByRole("button", { name: "Codex settings" }).textContent).toContain("Edit setup");
    expect(within(tile).queryByRole("list", { name: "Codex pet reactions" })).toBeNull();
    expect(within(await screen.findByRole("listitem", { name: "Windsurf" })).getByRole("button", { name: "Set up by hand" }).textContent).toBe("Set up by hand");
    expect(screen.queryByRole("listitem", { name: "ChatGPT" })).toBeNull();
    expect(screen.queryByRole("listitem", { name: "DeepSeek" })).toBeNull();
    expect(screen.queryByText(/DeepSeek/)).toBeNull();
  });

  it("Edit setup holds the tools: switching one off is saved as an off-list for that assistant", async () => {
    const { permsSet } = renderPage({ connected: true });
    fireEvent.click(await screen.findByRole("button", { name: "Claude settings" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "Tools" }));
    const add = within(dialog).getByRole("switch", { name: "Add a task for Claude" });
    expect(add.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(add);
    await waitFor(() => expect(permsSet).toHaveBeenCalledWith({ claude: { tools: ["task_add"], reactions: [] } }));
    expect(within(dialog).getByRole("switch", { name: "Add a task for Claude" }).getAttribute("aria-checked")).toBe("false");
    expect(within(dialog).getAllByRole("switch")).toHaveLength(TOOLS.length);
  });

  it("Edit setup holds the pet reactions: only what the assistant can really send is switchable", async () => {
    const { permsSet } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Codex settings" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "Pet reactions" }));
    expect((within(dialog).getByRole("switch", { name: "Says when a chat runs long for Codex" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByText("Not available for Codex yet.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("switch", { name: "Welcome-back note for Codex" }));
    await waitFor(() => expect(permsSet).toHaveBeenCalledWith({ codex: { tools: [], reactions: ["away"] } }));
  });

  it("an assistant with no hook says so in its reactions tab", async () => {
    renderPage();
    fireEvent.click(within(await screen.findByRole("listitem", { name: "Windsurf" })).getByRole("button", { name: "Set up by hand" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "Pet reactions" }));
    expect(within(dialog).getByText(/has no hook Pluto can use yet/)).toBeTruthy();
    expect(within(dialog).getAllByRole("switch").every((x) => (x as HTMLButtonElement).disabled)).toBe(true);
  });

  it("Codex's settings open with its TOML setup and name the program from it", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Codex settings" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Show manual setup" }));
    expect(within(dialog).getByLabelText("Codex setup").textContent).toContain("[mcp_servers.pluto]");
    expect(programOf("[mcp_servers.pluto]\ncommand = 'C:\\Pluto\\pluto.exe'\n")).toBe("C:\\Pluto\\pluto.exe");
    expect(programOf('command = "C:\\\\Pluto\\\\pluto.exe"')).toBe("C:\\Pluto\\pluto.exe");
    expect(programOf('{"mcp":{"pluto":{"type":"local","command":["/opt/pluto","--mcp-bridge"]}}}')).toBe("/opt/pluto");
    expect(programOf('{"servers":{"pluto":{"command":"/x"}}}')).toBe("/x");
    expect(programOf("nothing here")).toBe("pluto");
  });

  it("Another assistant gets the commands for done, needs you and permission, to copy into any app's hook (owner 2026-11-03)", async () => {
    renderPage();
    fireEvent.click(within(await screen.findByRole("listitem", { name: "Another assistant" })).getByRole("button", { name: "Set up by hand" }));
    const dialog = await screen.findByRole("dialog");
    const section = await within(dialog).findByRole("region", { name: "Pet reactions from any app" });
    expect(within(section).getByLabelText("It needs you command").textContent).toContain("--react agent_needs_you --assistant my-app");
    expect(within(section).getByLabelText("It wants your permission command").textContent).toContain("agent_permission");
    expect(within(section).getAllByRole("button", { name: "Copy" })).toHaveLength(3);
  });

  it("every assistant that reacts on its own lists Needs you, as the owner asked", () => {
    for (const id of ["claude", "codex", "opencode", "cursor"]) expect(REACT_KEYS[id]).toContain("needs");
  });

  it("everything planned has shipped, so the Coming list is gone; sounds have their own panel (A-8)", async () => {
    renderPage();
    await screen.findByRole("listitem", { name: "Codex" });
    expect(SOON).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Coming" })).toBeNull();
    expect(REACT_KEYS.claude).toContain("click");
    expect(screen.getByRole("switch", { name: "Assistant sounds" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Sound for Needs you" })).toBeTruthy();
  });

  it("says plainly what assistants can do and that the diary is never shared", async () => {
    renderPage();
    expect(await screen.findByText("Find and read your notes when you ask about them.")).toBeTruthy();
    expect(screen.getByText("Your diary. Assistants can never see it.")).toBeTruthy();
  });

  it("the developer preview is hidden until switched on", async () => {
    const { prefsSet } = renderPage({ enabled: true });
    await screen.findByRole("listitem", { name: "Claude" });
    expect(screen.queryByRole("region", { name: "Requests" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Developer preview" }));
    await waitFor(() => expect(prefsSet).toHaveBeenCalledWith("assistants.devPreview", true));
    const requests = await screen.findByRole("region", { name: "Requests" });
    await waitFor(() => expect(requests.textContent).toContain("Read today's plan."));
    const changed = screen.getByRole("region", { name: "What it changed" });
    expect(changed.textContent).toContain("Added the task");
    fireEvent.click(within(changed).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(ipc.mcpUndo).toHaveBeenCalledWith(7));
  });

  it("offers test prompts to paste into the assistant, each with Copy", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    renderPage();
    const list = await screen.findByRole("list", { name: "Test prompts" });
    expect(within(list).getAllByRole("listitem").length).toBe(7);
    fireEvent.click(within(list).getByRole("button", { name: "Copy: Using Pluto, what's on my plan today?" }));
    await waitFor(() => expect(write).toHaveBeenCalledWith("Using Pluto, what's on my plan today?"));
  });

  it("the focus guard is off by default and switches on from this page", async () => {
    renderPage();
    const guard = await screen.findByRole("switch", { name: "Quiet while you focus" });
    expect(guard.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(guard);
    await waitFor(() => expect(ipc.settingSet).toHaveBeenCalledWith("mcp.focus_guard", true));
  });

  it("developer reactions: one folder picked once watches every project in it; builds keep a line to copy", async () => {
    let roots: string[] = [];
    const info = () => ({ roots: [...roots], repos: roots.flatMap((r) => [`${r}/a`, `${r}/b`]) });
    vi.spyOn(ipc, "devGitWatch").mockImplementation(async () => info());
    vi.spyOn(ipc, "devGitAddFolder").mockImplementation(async () => { roots = ["E:/Projects"]; return info(); });
    vi.spyOn(ipc, "devGitRemoveFolder").mockImplementation(async () => { roots = []; return info(); });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add a folder" }));
    expect(await screen.findByText("Watching 2 projects")).toBeTruthy();
    expect(screen.getByText("E:/Projects")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop watching E:/Projects" }));
    await waitFor(() => expect(screen.queryByText("E:/Projects")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Builds" }));
    expect((await screen.findByLabelText("A build")).textContent).toContain("build_ok");
  });
});
