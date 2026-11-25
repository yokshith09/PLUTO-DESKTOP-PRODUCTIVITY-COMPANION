import { useState } from "react";
import { FileText, Folder, Globe, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmAction } from "@/components/ConfirmAction";
import { errorMessage, ipc } from "@/ipc";
import { notify } from "@/lib/notify";
import { isWeb, labelOf, MAX_ITEMS, newId, remove, upsert, webTarget, type LaunchSet } from "./sets";
import { runSet, useLaunchSets } from "./useLaunchSets";

const FOCUS_CHOICES = [null, 25, 50, 90] as const;

/**
 * Launch Buddy (P5 item 2, FR-72): saved sets of files, folders, apps and web links that open in
 * one click, from here or from Quick Actions. A set can also start a focus session.
 */
export function LaunchSetsPanel() {
  const { sets, save } = useLaunchSets();
  const [editing, setEditing] = useState<LaunchSet | null>(null);

  if (editing) {
    return (
      <SetEditor
        initial={editing}
        onCancel={() => setEditing(null)}
        onSave={async (set) => {
          await save(upsert(sets, set));
          setEditing(null);
          notify.success(`Saved “${set.name}”`, { description: "Open it from here or from Quick Actions (Ctrl/⌘+K)." });
        }}
      />
    );
  }
  return (
    <div className="py-3.5">
      {sets.sets.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          A launch set opens your files, folders, apps and web pages in one click, for example everything for one course or one project. It can also start a focus session.
        </p>
      ) : (
        <ul className="divide-y" aria-label="Launch sets">
          {sets.sets.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <div className="min-w-[10rem] flex-1">
                <p className="text-[13px] font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.items.length ? s.items.map(labelOf).join(" · ") : "Empty"}
                  {s.focus_minutes ? ` · then ${s.focus_minutes} min focus` : ""}
                </p>
              </div>
              <Button size="sm" onClick={() => void runSet(s)} disabled={!s.items.length} aria-label={`Open ${s.name}`}><Play className="size-3.5" />Open</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}>Edit</Button>
              <ConfirmAction message={`Delete the launch set “${s.name}”? The files themselves stay where they are.`} onConfirm={() => void save(remove(sets, s.id))}>
                <Button size="sm" variant="ghost" aria-label={`Delete ${s.name}`}><Trash2 className="size-3.5" /></Button>
              </ConfirmAction>
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing({ id: newId(), name: "", items: [], focus_minutes: null })}>
        <Plus className="size-3.5" />New launch set
      </Button>
    </div>
  );
}

function SetEditor({ initial, onSave, onCancel }: { initial: LaunchSet; onSave: (s: LaunchSet) => Promise<void>; onCancel: () => void }) {
  const [set, setSet] = useState(initial);
  const [link, setLink] = useState("");
  const full = set.items.length >= MAX_ITEMS;
  const add = (target: string) => {
    if (set.items.some((i) => i.target === target)) return notify.info("That is already in this set.");
    setSet((s) => ({ ...s, items: [...s.items, { label: "", target }] }));
  };
  const pick = async (kind: "file" | "folder") => {
    try {
      const path = await ipc.projectPathPick(kind);
      if (path) add(path);
    } catch (error) {
      notify.error(errorMessage(error));
    }
  };
  const addLink = () => {
    const target = webTarget(link);
    if (!target) return notify.error("That doesn't look like a web address.", { description: "For example moodle.uni.edu/course/12" });
    add(target);
    setLink("");
  };
  const name = set.name.trim();
  return (
    <form
      className="space-y-3 py-3.5" aria-label="Edit launch set"
      onSubmit={(e) => { e.preventDefault(); if (name) void onSave({ ...set, name }); }}
    >
      <label className="block text-[13px] font-medium">
        Name
        <Input className="mt-1" value={set.name} onChange={(e) => setSet({ ...set, name: e.target.value })} placeholder="Physics, Work, Thesis…" autoFocus required />
      </label>
      <div>
        <p className="text-[13px] font-medium">Opens</p>
        {set.items.length === 0 && <p className="text-xs text-muted-foreground">Nothing yet. Add files, folders, apps or web pages.</p>}
        <ul className="mt-1 space-y-1" aria-label="Items in this set">
          {set.items.map((item, i) => (
            <li key={item.target} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-[13px]">
              {isWeb(item.target) ? <Globe className="size-3.5 shrink-0 text-muted-foreground" /> : /[.][a-z0-9]{1,5}$/i.test(item.target) ? <FileText className="size-3.5 shrink-0 text-muted-foreground" /> : <Folder className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate" title={item.target}>{labelOf(item)}</span>
              <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${labelOf(item)}`}
                onClick={() => setSet((s) => ({ ...s, items: s.items.filter((_, j) => j !== i) }))}><Trash2 className="size-3.5" /></Button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={full} onClick={() => void pick("file")}><FileText className="size-3.5" />Add a file or app</Button>
          <Button type="button" size="sm" variant="outline" disabled={full} onClick={() => void pick("folder")}><Folder className="size-3.5" />Add a folder</Button>
        </div>
        <div className="mt-2 flex gap-2">
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Web address" aria-label="Web address to add" disabled={full}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} />
          <Button type="button" size="sm" variant="outline" disabled={full || !link.trim()} onClick={addLink}><Globe className="size-3.5" />Add link</Button>
        </div>
        {full && <p className="mt-1 text-xs text-muted-foreground">A set opens at most {MAX_ITEMS} things.</p>}
      </div>
      <fieldset>
        <legend className="text-[13px] font-medium">Then start focus</legend>
        <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Then start focus">
          {FOCUS_CHOICES.map((m) => (
            <Button key={m ?? 0} type="button" size="sm" variant={set.focus_minutes === m ? "default" : "outline"} role="radio" aria-checked={set.focus_minutes === m}
              onClick={() => setSet({ ...set, focus_minutes: m })}>{m ? `${m} min` : "No"}</Button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">Scripts and installers are only shown in their folder, never run.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!name}>Save</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
