import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ipc, type AssistantInfo } from "@/ipc";
import { AssistantsPage } from "./AssistantsPage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const claude = (connected: boolean): AssistantInfo => ({
  id: "claude", name: "Claude", installed: true, connected,
  places: [
    { label: "Claude Code", path: "/home/you/.claude.json", installed: true, connected, manual: '{"mcpServers":{"pluto":{"command":"pluto","args":["--mcp-bridge","--assistant","claude-code"]}}}' },
    { label: "Claude app", path: "/home/you/Claude/claude_desktop_config.json", installed: true, connected, manual: '{"mcpServers":{"pluto":{"command":"pluto","args":["--mcp-bridge","--assistant","claude-desktop"]}}}' },
  ],
});
const cursor: AssistantInfo = { id: "cursor", name: "Cursor", installed: false, connected: false, places: [{ label: "Cursor", path: "/home/you/.cursor/mcp.json", installed: false, connected: false, manual: "{}" }] };

function renderPage({ enabled = false, connected = false, dev = false } = {}) {
  vi.spyOn(ipc, "settingsGetAll").mockResolvedValue({ "mcp.enabled": enabled } as never);
  vi.spyOn(ipc, "settingSet").mockResolvedValue(null);
  vi.spyOn(ipc, "prefsGet").mockResolvedValue(dev as never);
  const prefsSet = vi.spyOn(ipc, "prefsSet").mockResolvedValue(null);
  vi.spyOn(ipc, "mcpAssistants").mockResolvedValue([claude(connected), cursor]);
  const connect = vi.spyOn(ipc, "mcpConnect").mockResolvedValue(["Claude Code", "Claude app"]);
  const disconnect = vi.spyOn(ipc, "mcpDisconnect").mockResolvedValue(null);
  const activity = vi.spyOn(ipc, "mcpActivity").mockResolvedValue([
    { atMs: 0, assistant: "Claude Code", tool: "today", ok: true, detail: "Read today's plan.", changed: false, undoId: null, undone: false },
    { atMs: 1, assistant: "Claude Code", tool: "task_add", ok: true, detail: "Added the task \"Call the bank\".", changed: true, undoId: 7, undone: false },
  ]);
  vi.spyOn(ipc, "mcpUndo").mockResolvedValue("Removed the task \"Call the bank\".");
  vi.spyOn(ipc, "mcpDeveloper").mockResolvedValue({ gitCommit: "#!/bin/sh\npluto --react git_commit", gitPush: "x", build: "y" });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AssistantsPage /></QueryClientProvider>);
  return { connect, disconnect, prefsSet, activity };
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

  it("developer reactions show the git and build lines to copy when opened", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Git and builds" }));
    expect((await screen.findByLabelText("After a commit (.git/hooks/post-commit)")).textContent).toContain("--react git_commit");
  });
});
