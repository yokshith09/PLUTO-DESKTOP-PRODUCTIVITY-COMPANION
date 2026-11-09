// Assistants (MCP): connect AI assistants on this computer to Pluto. One tile per assistant with a
// single Connect; everything else about that assistant (manual setup, where it is set up, its
// requests) lives in its settings. A developer preview, off by default, lists requests and changes.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, BookOpen, Check, CircleSlash, Code2, Copy, Eye, ListChecks, Lock, MessageCircle, PartyPopper, PenLine, Plus, Settings2, ShieldCheck, Undo2 } from "lucide-react";
import { errorMessage, ipc, type AssistantCall, type AssistantInfo, type GitWatchInfo } from "@/ipc";
import { useSetting } from "@/hooks/useTheme";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usePref } from "@/features/guide/usePref";
import { PageHeader, Panel } from "@/features/shell/PageHeader";

/** What assistants can do, in plain words. */
export const CAN = [
  { icon: PartyPopper, text: "Make your pet cheer, wave or look worried when they finish, need you, or get stuck, and say which chat or folder it was." },
  { icon: MessageCircle, text: "Show you a short message on the pet." },
  { icon: ListChecks, text: "See today's plan and your tasks, and plan your day or week with you." },
  { icon: BookOpen, text: "Find and read your notes when you ask about them." },
  { icon: PenLine, text: "Add tasks, reminders and notes, change a task or mark it done, and move a reminder or meeting to the Bin, when you ask. Every change can be undone." },
  { icon: ShieldCheck, text: "Change a setting like the theme, only after you press Allow on the pet." },
  { icon: MessageCircle, text: "Ask you a quick question on the pet, with buttons, while you are in another app." },
  { icon: Eye, text: "See if you are in a focus session, so they don't disturb you." },
] as const;
/** Planned next (owner 2026-11-03, A-1..A-8). Shown so you know what is ahead; none of it works yet. */
export const SOON = [
  { title: "A different sound", text: "“Needs you” sounds different from “done”." },
] as const;

/** What the pet does on its own for each assistant, once connected (the rest only when it asks). */
export const PET_REACTS: Record<string, readonly string[]> = {
  claude: ["Done", "Needs you", "Names the chat", "Names the tool it asks to use", "Counts chats waiting for you", "Click goes to its window", "Welcome-back note", "Says when a chat runs long"],
  codex: ["Done", "Needs you", "Names the chat", "Names the tool it asks to use", "Counts chats waiting for you", "Click goes to its window", "Welcome-back note"],
  cursor: ["Done", "Needs you (questions)", "Names the folder", "Click goes to its window", "Welcome-back note"],
  opencode: ["Done", "Needs you", "Names the folder", "Click goes to its window", "Welcome-back note"],
};

export const COMING = { icon: Lock, text: "Turn assistants off, change tracking, shortcuts or start-up. Those stay with you." } as const;
export const NEVER = { icon: Lock, text: "Your diary. Assistants can never see it." } as const;

/** Paste these into a connected assistant to check each part works (owner 2026-11-02). */
export const TRY = [
  { what: "Reading", text: "Using Pluto, what's on my plan today?" },
  { what: "Pet", text: "Make my Pluto pet cheer, then say \"Test from my assistant\" on it." },
  { what: "Adding", text: "Add a task in Pluto: \"Test task from my assistant\", due tomorrow." },
  { what: "Changing", text: "In Pluto, mark \"Test task from my assistant\" as done." },
  { what: "Reminder", text: "Add a Pluto reminder \"Stretch\" for 10 minutes from now." },
  { what: "Notes", text: "Search my Pluto notes for \"meeting\" and tell me what you find." },
  { what: "Review", text: "Give me a short daily review from Pluto. Don't save it." },
] as const;

const DEV_PREF = "assistants.devPreview";
const parseDev = (raw: unknown) => raw === true;

/** Who made a request, mapped to the assistant tile it belongs to. */
const OWNER: Record<string, string> = { "Claude Code": "claude", Claude: "claude", "VS Code": "vscode", Cursor: "cursor", Codex: "codex", OpenCode: "opencode", Windsurf: "windsurf", Antigravity: "antigravity" };

export function AssistantsPage() {
  const [enabled, setEnabled] = useSetting("mcp.enabled");
  const on = enabled === true;
  const { data: assistants = [] } = useQuery({ queryKey: ["mcp", "assistants"], queryFn: ipc.mcpAssistants });
  const [editing, setEditing] = useState<string | null>(null);
  const current = assistants.find((a) => a.id === editing) ?? null;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Assistants"
        description="Let AI assistants on this computer work with Pluto. Nothing leaves your computer."
        actions={
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {on ? "On" : "Off"}
            <Switch checked={on} onCheckedChange={(v) => void setEnabled(v)} aria-label="Assistants can reach Pluto" />
          </label>
        }
      />

      <Panel className="p-5">
        <h2 className="text-[15px] font-semibold">Connect an assistant</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Press Connect, restart the assistant, then ask it: <q className="text-foreground">What's on my plan today in Pluto?</q></p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {assistants.map((a) => <AssistantTile key={a.id} a={a} on={on} onSettings={() => setEditing(a.id)} />)}
          <OtherTile onSettings={() => setEditing("other")} />
        </ul>
        {!on && assistants.some((a) => a.connected) && (
          <p className="mt-3 text-[12px] text-muted-foreground">Assistants are off, so connected ones can't reach Pluto until you switch them on.</p>
        )}
      </Panel>

      <TryIt />
      <Capabilities />
      <FocusGuard />
      <DeveloperReactions />
      <DeveloperPreview on={on} />

      <AssistantEditor id={editing} a={current} onClose={() => setEditing(null)} />
    </div>
  );
}

function Monogram({ name }: { name: string }) {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl border bg-muted/60 text-[15px] font-semibold">
      {name === "Another" ? <Plus className="size-4 text-muted-foreground" /> : name.slice(0, 1)}
    </span>
  );
}

function useConnect() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      notify.success(done);
    } catch (e) {
      notify.error(errorMessage(e));
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ["mcp"] });
      await qc.invalidateQueries({ queryKey: ["settings"] });
    }
  };
  return { busy, run };
}

function subtitle(a: AssistantInfo) {
  if (!a.installed) return "Not found on this computer";
  if (a.places.length > 1) return a.places.map((p) => p.label).join(" and ");
  return a.connected ? "Ready" : "Found on this computer";
}

function AssistantTile({ a, on, onSettings }: { a: AssistantInfo; on: boolean; onSettings: () => void }) {
  const { busy, run } = useConnect();
  return (
    <li aria-label={a.name} className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-start gap-3">
        <Monogram name={a.name} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">{a.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">{subtitle(a)}</p>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label={`${a.name} settings`} onClick={onSettings}><Settings2 className="size-4" /></Button>
      </div>
      <ul aria-label={`${a.name} pet reactions`} className="flex flex-wrap gap-1.5">
        {(PET_REACTS[a.id] ?? []).map((r) => <li key={r} className="rounded-md border px-1.5 py-0.5 text-[11px] text-foreground"><span aria-hidden className="text-primary">✓ </span>{r}</li>)}
        {!PET_REACTS[a.id] && <li className="rounded-md border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground">Pet reacts when it asks</li>}
      </ul>
      {a.connected
        ? <p className="flex h-8 items-center gap-1.5 text-[13px] font-medium text-primary"><Check className="size-4" />{on ? "Connected" : "Connected (assistants are off)"}</p>
        : !a.installed
        ? <Button variant="outline" className="w-full" onClick={onSettings}>Set up by hand</Button>
        : <Button className="w-full" disabled={busy} onClick={() => void run(() => ipc.mcpConnect(a.id), `${a.name} connected. Restart it to start.`)}>{busy ? "Connecting…" : "Connect"}</Button>}
    </li>
  );
}

function OtherTile({ onSettings }: { onSettings: () => void }) {
  return (
    <li aria-label="Another assistant" className="flex flex-col gap-3 rounded-xl border border-dashed p-4">
      <div className="flex items-start gap-3">
        <Monogram name="Another" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Another assistant</p>
          <p className="text-[12px] text-muted-foreground">Any app that supports MCP</p>
        </div>
      </div>
      <Button variant="outline" className="w-full" onClick={onSettings}>Set up by hand</Button>
    </li>
  );
}

function Capabilities() {
  return (
    <Panel className="p-5">
      <h2 className="text-[15px] font-semibold">What a connected assistant can do</h2>
      <ul className="mt-3 space-y-2.5">
        {CAN.map((c) => (
          <li key={c.text} className="flex items-start gap-3 text-[13px]">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"><c.icon className="size-3.5" aria-hidden /></span>
            <span className="pt-1">{c.text}</span>
          </li>
        ))}
      </ul>
      <section aria-label="Coming" className="mt-4 border-t pt-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">Coming <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Not working yet</span></h3>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Planned next. They show here so you know what is ahead; none of them is switched on.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {SOON.map((c) => (
            <li key={c.title} className="rounded-lg border border-dashed px-3 py-2">
              <p className="text-[12.5px] font-medium">{c.title}</p>
              <p className="text-[12px] text-muted-foreground">{c.text}</p>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2">
        <Note icon={COMING.icon} label="Not allowed" text={COMING.text} />
        <Note icon={NEVER.icon} label="Never" text={NEVER.text} />
      </div>
    </Panel>
  );
}

function Note({ icon: Icon, label, text }: { icon: typeof Lock; label: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-lg bg-muted/40 p-3 text-[12px]">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <p><span className="font-medium">{label}. </span><span className="text-muted-foreground">{text}</span></p>
    </div>
  );
}

function TryIt() {
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); notify.success("Copied. Paste it into your assistant."); } catch { notify.error("Could not copy"); }
  };
  return (
    <Panel className="p-5">
      <h2 className="text-[15px] font-semibold">Try it</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">After connecting, paste one of these into your assistant. Anything it adds can be undone in the developer preview.</p>
      <ul aria-label="Test prompts" className="mt-3 divide-y rounded-lg border">
        {TRY.map((t) => (
          <li key={t.what} className="flex items-center gap-3 px-3 py-2.5">
            <span className="w-20 shrink-0 text-[12px] text-muted-foreground">{t.what}</span>
            <span className="min-w-0 flex-1 text-[13px]">{t.text}</span>
            <Button size="icon-sm" variant="ghost" aria-label={`Copy: ${t.text}`} onClick={() => void copy(t.text)}><Copy className="size-3.5" /></Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function FocusGuard() {
  const [guard, setGuard] = useSetting("mcp.focus_guard");
  return (
    <Panel className="flex items-start gap-4 p-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted/60"><BellOff className="size-4 text-muted-foreground" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold">Quiet while you focus</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">During a focus session, messages from assistants wait and show on the pet when it ends.</p>
      </div>
      <Switch checked={guard === true} onCheckedChange={(v) => void setGuard(v)} aria-label="Quiet while you focus" />
    </Panel>
  );
}

function DeveloperReactions() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: lines } = useQuery({ queryKey: ["mcp", "developer"], queryFn: ipc.mcpDeveloper, enabled: open });
  const { data: watch } = useQuery({ queryKey: ["dev", "git"], queryFn: ipc.devGitWatch });
  const roots = watch?.roots ?? [];
  const repos = watch?.repos ?? [];
  const set = (next: GitWatchInfo | null) => { if (next) qc.setQueryData(["dev", "git"], next); };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); notify.success("Copied"); } catch { notify.error("Could not copy"); }
  };
  return (
    <Panel className="p-5">
      <div className="flex items-start gap-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted/60"><Code2 className="size-4 text-muted-foreground" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Developer reactions</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">The pet cheers when Claude Code finishes and waves when it needs you; Connect on the Claude tile sets that up. Pick the folder that holds your projects once, and the pet also reacts to every commit and every push that worked, in all of them, from any tool.</p>
        </div>
      </div>
      <div className="mt-4 space-y-2 border-t pt-4" aria-label="Watched folders">
        {roots.length === 0 && <p className="text-[12px] text-muted-foreground">No folder yet. Pick the one that holds your projects (for example E:\Projects); every git project inside it is included, and new ones are found by themselves.</p>}
        {roots.map((r) => (
          <div key={r} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={r}>{r}</span>
            <Button size="sm" variant="ghost" aria-label={`Stop watching ${r}`} onClick={() => void ipc.devGitRemoveFolder(r).then(set)}>Remove</Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => void ipc.devGitAddFolder().then(set).catch((e: unknown) => notify.error(errorMessage(e)))}><Plus className="size-3.5" />Add a folder</Button>
          {roots.length > 0 && <span className="text-[12px] text-muted-foreground" aria-live="polite">{repos.length === 0 ? "No git projects found inside yet" : `Watching ${repos.length} project${repos.length === 1 ? "" : "s"}`}</span>}
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Hide" : "Builds"}</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Pluto reads only git's own logs inside each project's .git folder, never your code.</p>
      </div>
      {open && lines && (
        <div className="mt-4 space-y-2 border-t pt-4">
          <p className="text-[12px] font-medium">A build</p>
          <p className="text-[12px] text-muted-foreground">Builds have no log to watch, so set this once as your build command (for example a VS Code task, or a script in package.json), with your own command in place of &lt;your build&gt;.</p>
          <pre aria-label="A build" className="overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">{lines.build}</pre>
          <Button size="sm" variant="outline" onClick={() => void copy(lines.build)}><Copy className="size-3.5" />Copy</Button>
        </div>
      )}
    </Panel>
  );
}

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function useActivity(on: boolean, show: boolean) {
  return useQuery({ queryKey: ["mcp", "activity"], queryFn: ipc.mcpActivity, enabled: show, refetchInterval: on && show ? 2_000 : false }).data ?? [];
}

function DeveloperPreview({ on }: { on: boolean }) {
  const dev = usePref(DEV_PREF, parseDev);
  const show = dev.value === true;
  const calls = useActivity(on, show);
  const changes = calls.filter((c) => c.changed);
  return (
    <Panel className="p-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Developer preview</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">See every request an assistant makes and everything it changed, as it happens, with Undo. Useful for testing an assistant. The last 50 are kept on this computer, so Undo works after a restart.</p>
        </div>
        <Switch checked={show} onCheckedChange={(v) => void dev.set(v)} aria-label="Developer preview" />
      </div>
      {show && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Calls title="Requests" calls={calls} empty={on ? "No requests yet. Ask a connected assistant something about your day." : "Assistants are off. Switch them on to see requests."} />
          <Calls title="What it changed" calls={changes} empty="Nothing changed yet. Anything an assistant adds or changes shows here with an Undo." undo />
        </div>
      )}
    </Panel>
  );
}

function UndoButton({ id }: { id: number }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const undo = async () => {
    setBusy(true);
    try { notify.success(await ipc.mcpUndo(id)); } catch (e) { notify.error(errorMessage(e)); } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ["mcp", "activity"] });
      await qc.invalidateQueries();
    }
  };
  return <Button size="sm" variant="outline" disabled={busy} onClick={() => void undo()}><Undo2 className="size-3.5" />Undo</Button>;
}

function Calls({ title, calls, empty, undo = false }: { title: string; calls: AssistantCall[]; empty: string; undo?: boolean }) {
  return (
    <section aria-label={title} className="flex min-h-32 flex-col rounded-lg border">
      <header className="flex h-10 items-center gap-2 border-b px-3">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <span className="rounded-md bg-muted px-1.5 text-[11px] font-medium tabular-nums leading-5 text-muted-foreground">{calls.length}</span>
      </header>
      {calls.length === 0
        ? <p className="p-3 text-[12px] text-muted-foreground">{empty}</p>
        : (
          <ul className="max-h-72 divide-y overflow-y-auto">
            {calls.map((c, i) => (
              <li key={`${c.atMs}-${i}`} className="flex items-start gap-2 px-3 py-2 text-[12px]">
                {c.ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-label="Done" /> : <CircleSlash className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-label="Refused" />}
                <div className="min-w-0 flex-1">
                  <p><span className="font-medium">{c.assistant}</span> <span className="font-mono text-muted-foreground">{c.tool}</span></p>
                  <p className="truncate text-muted-foreground" title={c.detail}>{c.detail}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <time className="tabular-nums text-muted-foreground">{time(c.atMs)}</time>
                  {undo && c.undoId !== null && <UndoButton id={c.undoId} />}
                  {undo && c.undone && <span className="text-muted-foreground">Undone</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

type ManualJson = { mcpServers?: { pluto?: { command?: string } }; servers?: { pluto?: { command?: string } }; mcp?: { pluto?: { command?: string[] } } };
/** The program Pluto starts, read from a manual setup text: JSON for most, TOML for Codex. */
export function programOf(manual: string): string {
  try {
    const v = JSON.parse(manual) as ManualJson;
    return v.mcpServers?.pluto?.command ?? v.servers?.pluto?.command ?? v.mcp?.pluto?.command?.[0] ?? "pluto";
  } catch {
    const m = /command\s*=\s*(?:'([^']*)'|"((?:[^"\\]|\\.)*)")/.exec(manual);
    return m?.[1] ?? m?.[2]?.replace(/\\(.)/g, "$1") ?? "pluto";
  }
}

const OTHER_MANUAL = (exe: string) => JSON.stringify({ mcpServers: { pluto: { command: exe, args: ["--mcp-bridge", "--assistant", "my-assistant"] } } }, null, 2);

function AssistantEditor({ id, a, onClose }: { id: string | null; a: AssistantInfo | null; onClose: () => void }) {
  const { busy, run } = useConnect();
  const calls = useActivity(true, id !== null).filter((c) => a && OWNER[c.assistant] === a.id).slice(0, 5);
  const [manualOpen, setManualOpen] = useState(false);
  const name = a?.name ?? "Another assistant";
  const command = a?.places[0] ? programOf(a.places[0].manual) : "pluto";
  const { data: lines } = useQuery({ queryKey: ["mcp", "developer"], queryFn: ipc.mcpDeveloper, enabled: id !== null && !a });
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); notify.success("Setup copied"); } catch { notify.error("Could not copy"); }
  };
  return (
    <Dialog open={id !== null} onOpenChange={(o) => { if (!o) { onClose(); setManualOpen(false); } }}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <div className="flex items-center gap-3 border-b p-5">
          <Monogram name={a ? a.name : "Another"} />
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold">{name}</DialogTitle>
            <DialogDescription className="text-[13px]">
              {a ? (a.connected ? "Connected to Pluto." : a.installed ? "Not connected yet." : "Not found on this computer.") : "Any app that supports MCP can use Pluto."}
            </DialogDescription>
          </div>
        </div>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto p-5 text-[13px]">
          {a && (
            <section aria-label="Connection">
              <ul className="divide-y rounded-lg border">
                {a.places.map((p) => (
                  <li key={p.label} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.label}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground" title={p.path}>{p.path}</p>
                    </div>
                    <span className={`shrink-0 text-[12px] ${p.connected ? "text-primary" : "text-muted-foreground"}`}>{p.connected ? "Set up" : p.installed ? "Not set up" : "Not found"}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                {a.connected
                  ? <Button variant="outline" disabled={busy} onClick={() => void run(() => ipc.mcpDisconnect(a.id), `${a.name} disconnected`)}>Disconnect</Button>
                  : <Button disabled={busy || !a.installed} onClick={() => void run(() => ipc.mcpConnect(a.id), `${a.name} connected. Restart it to start.`)}>Connect</Button>}
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">Connect adds one entry named "pluto" to these settings and keeps a copy of the file first. Disconnect removes only that entry.</p>
            </section>
          )}

          <section aria-label="Manual setup">
            {a && !manualOpen
              ? <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setManualOpen(true)}>Show manual setup</Button>
              : (
                <>
                  <h3 className="text-xs font-medium text-muted-foreground">Manual setup</h3>
                  <p className="mt-1 text-[12px] text-muted-foreground">Paste this into the assistant's MCP settings, then restart it.</p>
                  {(a ? a.places.map((p) => ({ label: p.label, text: p.manual })) : [{ label: "Setup", text: OTHER_MANUAL(command) }]).map((m) => (
                    <div key={m.label} className="mt-3">
                      {a && a.places.length > 1 && <p className="mb-1 text-[12px] font-medium">{m.label}</p>}
                      <pre aria-label={`${m.label} setup`} className="max-h-44 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">{m.text}</pre>
                      <Button size="sm" variant="outline" className="mt-2" onClick={() => void copy(m.text)}><Copy className="size-3.5" />Copy</Button>
                    </div>
                  ))}
                  {!a && <p className="mt-2 text-[12px] text-muted-foreground">Change "my-assistant" to its name; the pet shows it with every message.</p>}
                </>
              )}
          </section>

          {!a && lines && (
            <section aria-label="Pet reactions from any app">
              <h3 className="text-xs font-medium text-muted-foreground">Pet reactions from any app</h3>
              <p className="mt-1 text-[12px] text-muted-foreground">If the app can run a command when it finishes or waits for you (a hook, a notify setting, a script), give it one of these. Change “my-app” to its name; Pluto shows it on the pet.</p>
              {([["It is done", lines.agentDone], ["It needs you", lines.agentNeedsYou], ["It wants your permission", lines.agentPermission]] as const).map(([what, text]) => (
                <div key={what} className="mt-3">
                  <p className="mb-1 text-[12px] font-medium">{what}</p>
                  <pre aria-label={`${what} command`} className="overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">{text}</pre>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => void copy(text)}><Copy className="size-3.5" />Copy</Button>
                </div>
              ))}
            </section>
          )}

          {a && (
            <section aria-label="Recent requests">
              <h3 className="text-xs font-medium text-muted-foreground">Recent requests</h3>
              {calls.length === 0
                ? <p className="mt-1 text-[12px] text-muted-foreground">None since Pluto opened.</p>
                : (
                  <ul className="mt-2 divide-y rounded-lg border">
                    {calls.map((c, i) => (
                      <li key={`${c.atMs}-${i}`} className="flex items-center gap-2 px-3 py-2 text-[12px]">
                        <span className="font-mono">{c.tool}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.detail}</span>
                        <time className="tabular-nums text-muted-foreground">{time(c.atMs)}</time>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
