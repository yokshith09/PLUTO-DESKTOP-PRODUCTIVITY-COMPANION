// Assistants (MCP, P4.1a): connect AI assistants on this computer to Pluto. One switch, the setup
// to copy, what assistants can do, and a developer preview of what they asked and changed.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, CircleSlash, Copy, Eye, Lock, MessageCircle, PartyPopper, PenLine } from "lucide-react";
import { ipc, type AssistantCall } from "@/ipc";
import { useSetting } from "@/hooks/useTheme";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader, Panel } from "@/features/shell/PageHeader";

/** The assistants the setup can be made for; the id is what the pet shows as the name. */
export const ASSISTANTS = [
  { id: "claude-code", name: "Claude Code" },
  { id: "claude-desktop", name: "Claude" },
  { id: "vscode", name: "VS Code" },
  { id: "assistant", name: "Another" },
] as const;

/** What assistants can do through Pluto, now and next. */
export const CAPABILITIES = [
  { icon: PartyPopper, title: "Make the pet react", text: "Done, needs you, hit an error: shown over any app.", now: true },
  { icon: MessageCircle, title: "Say a short line", text: "A plain bubble of up to 140 characters, with the assistant's name.", now: true },
  { icon: Eye, title: "See what you're doing", text: "Your focus session and today's task counts. Never titles or note text.", now: true },
  { icon: PenLine, title: "Add tasks and reminders", text: "Coming next. Changes to settings only after you press Allow.", now: false },
  { icon: Lock, title: "Your diary", text: "Never. Assistants cannot read or change it.", now: false, never: true },
] as const;

export function AssistantsPage() {
  const [enabled, setEnabled] = useSetting("mcp.enabled");
  const on = enabled === true;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Assistants" description="Let AI assistants on this computer talk to Pluto. Nothing leaves your computer." />
      <Panel className="p-5">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold">Connect assistants</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {on ? "On. Assistants you set up can reach Pluto while it is open." : "Off. No assistant can reach Pluto."}
            </p>
          </div>
          <Switch checked={on} onCheckedChange={(v) => void setEnabled(v)} aria-label="Connect assistants" />
        </div>
        {on && <Setup />}
      </Panel>
      <Capabilities />
      <DeveloperPreview on={on} />
    </div>
  );
}

function Setup() {
  const [assistant, setAssistant] = useState<string>(ASSISTANTS[0].id);
  const { data } = useQuery({ queryKey: ["mcp", "setup", assistant], queryFn: () => ipc.mcpSetup(assistant) });
  const copy = async () => {
    if (!data) return;
    try { await navigator.clipboard.writeText(data.config); notify.success("Setup copied"); } catch { notify.error("Could not copy"); }
  };
  return (
    <ol className="mt-5 space-y-4 border-t pt-5 text-[13px]">
      <Step n={1} title="Pick your assistant">
        <div role="group" aria-label="Assistant" className="mt-2 flex flex-wrap gap-2">
          {ASSISTANTS.map((a) => (
            <Button key={a.id} size="sm" variant={a.id === assistant ? "default" : "outline"} aria-pressed={a.id === assistant} onClick={() => setAssistant(a.id)}>{a.name}</Button>
          ))}
        </div>
      </Step>
      <Step n={2} title="Copy the setup into its MCP settings">
        <pre aria-label="Setup" className="mt-2 max-h-48 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[12px] leading-relaxed">{data?.config ?? "…"}</pre>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void copy()} disabled={!data}><Copy className="size-3.5" />Copy setup</Button>
      </Step>
      <Step n={3} title="Restart the assistant and ask it to make Pluto cheer">
        <p className="mt-1 text-muted-foreground">You will see its request below.</p>
      </Step>
    </ol>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[12px] font-semibold tabular-nums">{n}</span>
      <div className="min-w-0 flex-1"><p className="font-medium">{title}</p>{children}</div>
    </li>
  );
}

function Capabilities() {
  return (
    <Panel className="p-5">
      <h2 className="text-[15px] font-semibold">What assistants can do</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {CAPABILITIES.map((c) => (
          <li key={c.title} className="flex gap-3 rounded-lg border p-3">
            <c.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[13px] font-medium">
                {c.title}
                <span className={`rounded-md px-1.5 text-[11px] leading-5 ${c.now ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {c.now ? "Now" : "never" in c ? "Never" : "Next"}
                </span>
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{c.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function DeveloperPreview({ on }: { on: boolean }) {
  const { data = [] } = useQuery({ queryKey: ["mcp", "activity"], queryFn: ipc.mcpActivity, refetchInterval: on ? 2_000 : false });
  const changes = data.filter((c) => c.changed);
  return (
    <Panel className="p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold">Developer preview</h2>
        <span className="rounded-md bg-muted px-1.5 text-[11px] leading-5 text-muted-foreground">Since Pluto opened</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Calls title="Requests" calls={data} empty={on ? "No requests yet. Ask your assistant to make Pluto cheer." : "Turn on Connect assistants to see requests here."} />
        <Calls title="What it changed" calls={changes} empty="Nothing changed. Assistants can only show things on the pet for now." />
      </div>
    </Panel>
  );
}

function Calls({ title, calls, empty }: { title: string; calls: AssistantCall[]; empty: string }) {
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
                <time className="shrink-0 tabular-nums text-muted-foreground">{time(c.atMs)}</time>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
