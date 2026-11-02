import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/ipc";
import { AssistantsPage } from "./AssistantsPage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderPage(enabled: boolean) {
  vi.spyOn(ipc, "settingsGetAll").mockResolvedValue({ "mcp.enabled": enabled } as never);
  const set = vi.spyOn(ipc, "settingSet").mockResolvedValue(null);
  const setup = vi.spyOn(ipc, "mcpSetup").mockImplementation(async (a) => ({ listening: true, command: "pluto.exe", config: `{"assistant":"${a}"}` }));
  vi.spyOn(ipc, "mcpActivity").mockResolvedValue(enabled
    ? [{ atMs: 0, assistant: "Claude Code", tool: "say", ok: false, detail: "The bubble has no text.", changed: false }]
    : []);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AssistantsPage /></QueryClientProvider>);
  return { set, setup };
}

describe("Assistants page", () => {
  it("off: one switch, what assistants can do, and no setup", async () => {
    const { set } = renderPage(false);
    expect(await screen.findByText("Off. No assistant can reach Pluto.")).toBeTruthy();
    expect(screen.queryByLabelText("Setup")).toBeNull();
    expect(screen.getByText("Make the pet react")).toBeTruthy();
    expect(screen.getByText("Your diary")).toBeTruthy();
    expect(screen.getByText("Turn on Connect assistants to see requests here.")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Connect assistants" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("mcp.enabled", true));
  });

  it("on: guides through the setup for the chosen assistant and lists requests", async () => {
    const { setup } = renderPage(true);
    const setupBox = await screen.findByLabelText("Setup");
    await waitFor(() => expect(setupBox.textContent).toContain("claude-code"));
    fireEvent.click(screen.getByRole("button", { name: "VS Code" }));
    await waitFor(() => expect(screen.getByLabelText("Setup").textContent).toContain("vscode"));
    expect(setup).toHaveBeenCalledWith("vscode");
    const requests = await screen.findByRole("region", { name: "Requests" });
    await waitFor(() => expect(requests.textContent).toContain("The bubble has no text."));
    expect(screen.getByLabelText("Refused")).toBeTruthy();
    expect(screen.getByRole("region", { name: "What it changed" }).textContent).toContain("Nothing changed");
  });
});
