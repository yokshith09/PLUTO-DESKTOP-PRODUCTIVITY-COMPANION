import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, File, Folder, FolderGit2, FolderOpen, GitCommitHorizontal, Globe, Link2, NotebookPen, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, ipc, type NoteSummary, type TaskRow } from "@/ipc";
import { notify } from "@/lib/notify";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { activity, addLink, linkKind, removeLink, setFolder, shortName, type Space, type Spaces } from "./spaces";

/** Opens a saved folder or file; the shell refuses anything not saved in a project. */
export async function openPath(path: string) {
  try { await ipc.projectPathOpen(path); } catch (e) { notify.error(errorMessage(e)); }
}

/** Under the project name: its folder on disk, with Open / Change / Remove, or Link a folder. */
export function FolderBar({ space, spaces, save }: { space: Space; spaces: Spaces; save: (s: Spaces) => Promise<void> }) {
  const pick = async () => {
    try {
      const path = await ipc.projectPathPick("folder");
      if (path) {
        await save(setFolder(spaces, space.name, path));
        notify.success(`Linked ${shortName(path)}`, { description: "Commits and pushes there now show in Activity." });
      }
    } catch (e) { notify.error(errorMessage(e)); }
  };
  if (!space.folder) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <Folder className="size-3.5" aria-hidden />No folder linked
        <Button size="sm" variant="outline" className="h-7" onClick={() => void pick()}><Link2 className="size-3.5" />Link a folder</Button>
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 font-mono text-[11.5px] text-primary" title={space.folder}>
        <FolderGit2 className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{space.folder}</span>
      </span>
      <Button size="sm" variant="outline" className="h-7" onClick={() => void openPath(space.folder as string)}><FolderOpen className="size-3.5" />Open folder</Button>
      <Button size="sm" variant="ghost" className="h-7" onClick={() => void pick()}>Change</Button>
      <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" aria-label={`Unlink the folder from ${space.name}`}
        onClick={() => void save(setFolder(spaces, space.name, null)).then(() => notify.success("Folder unlinked", { description: "Nothing on disk was changed." }))}>Unlink</Button>
    </div>
  );
}

const KIND_ICON = { web: Globe, file: File, folder: Folder } as const;
const KIND_WORD = { web: "Web page", file: "File", folder: "Folder" } as const;

/** Links & files: web pages open in the browser, files and folders in their own app. */
export function LinksPanel({ space, spaces, save }: { space: Space; spaces: Spaces; save: (s: Spaces) => Promise<void> }) {
  const [draft, setDraft] = useState("");
  const add = async (target: string) => {
    const t = target.trim();
    if (!t) return;
    if (linkKind(t) === "web" && !/^https?:\/\//i.test(t) && !/^mailto:/i.test(t)) return;
    await save(addLink(spaces, space.name, t));
    setDraft("");
  };
  const browse = async (kind: "file" | "folder") => {
    try { const p = await ipc.projectPathPick(kind); if (p) await add(p); } catch (e) { notify.error(errorMessage(e)); }
  };
  const open = (target: string) => (linkKind(target) === "web" ? void ipc.openUrl(target).catch((e: unknown) => notify.error(errorMessage(e))) : void openPath(target));
  const typed = draft.trim();
  const looksWeb = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(typed) && !/^https?:/i.test(typed);
  return (
    <section aria-label="Links and files" className="rounded-xl border bg-card">
      <ul className="divide-y">
        {space.links.length === 0 && (
          <li className="px-5 py-8 text-center">
            <p className="text-[13px] font-medium">No links or files yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">Keep the repo, the design file and the docs you open every day one click away. Pluto saves only where they are; nothing is copied.</p>
          </li>
        )}
        {space.links.map((l) => {
          const kind = linkKind(l.target);
          const Icon = KIND_ICON[kind];
          return (
            <li key={l.target} className="group flex items-center gap-3 px-4 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden /></span>
              <button type="button" onClick={() => open(l.target)} className="min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" title={`Open ${l.target}`}>
                <span className="block truncate text-[13.5px] font-medium group-hover:underline">{l.label}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{l.target}</span>
              </button>
              <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{KIND_WORD[kind]}</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Open ${l.label}`} onClick={() => open(l.target)}><ExternalLink className="size-3.5" /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${l.label}`} className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => void save(removeLink(spaces, space.name, l.target))}><X className="size-3.5" /></Button>
            </li>
          );
        })}
      </ul>
      <form className="flex flex-wrap gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void add(looksWeb ? `https://${typed}` : typed); }}>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste a web link" aria-label="Web link to add" className="min-w-48 flex-1" />
        <Button type="submit" variant="secondary" disabled={!typed}><Plus className="size-3.5" />Add link</Button>
        <Button type="button" variant="outline" onClick={() => void browse("file")}><Upload className="size-3.5" />Add a file</Button>
        <Button type="button" variant="outline" onClick={() => void browse("folder")}><Folder className="size-3.5" />Add a folder</Button>
      </form>
    </section>
  );
}

const ACT_ICON = { committed: GitCommitHorizontal, pushed: Upload, "task-done": CheckCircle2, note: NotebookPen } as const;

/** Activity: commits and pushes in the project's folder, tasks finished and notes edited. */
export function ActivityPanel({ space, tasks, notes }: { space: Space; tasks: TaskRow[]; notes: NoteSummary[] }) {
  const { data: events = [] } = useQuery({ queryKey: ["dev", "events"], queryFn: ipc.devGitEvents, refetchInterval: 15_000 });
  const list = activity(space.folder, events, tasks, notes.map((n) => ({ title: n.title, edited_at: n.edited_at })));
  return (
    <section aria-label="Activity" className="rounded-xl border bg-card">
      {list.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] font-medium">Nothing here yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">{space.folder ? "Finish a task, edit a note, or commit and push in this project's folder, and it shows here." : "Finished tasks and edited notes show here. Link the project's folder to see commits and pushes too."}</p>
        </div>
      ) : (
        <ol className="divide-y">
          {list.map((a, i) => {
            const Icon = ACT_ICON[a.kind];
            return (
              <li key={`${a.at}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <Icon className={cn("size-4 shrink-0", a.kind === "pushed" || a.kind === "committed" ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13px]">{a.text}</span>
                <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground" dateTime={new Date(a.at).toISOString()} title={new Date(a.at).toLocaleString()}>{timeAgo(a.at)}</time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Git projects the folder watcher found that are not a project yet: one click makes one. */
export function FoundFolders({ repos, onMake }: { repos: string[]; onMake: (folder: string) => void }) {
  const [open, setOpen] = useState(true);
  if (repos.length === 0) return null;
  return (
    <section aria-label="Found in your folders" className="rounded-xl border bg-card/60">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <FolderGit2 className="size-3.5" aria-hidden />Found in your folders<span className="ml-auto tabular-nums">{repos.length}</span>
      </button>
      {open && (
        <ul className="divide-y border-t">
          {repos.slice(0, 8).map((r) => (
            <li key={r} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px]" title={r}>{shortName(r)}</span>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" aria-label={`Make ${shortName(r)} a project`} onClick={() => onMake(r)}>Make a project</Button>
            </li>
          ))}
          {repos.length > 8 && <li className="px-3 py-2 text-[11px] text-muted-foreground">and {repos.length - 8} more</li>}
        </ul>
      )}
    </section>
  );
}
