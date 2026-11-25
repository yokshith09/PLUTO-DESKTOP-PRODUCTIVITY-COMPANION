/**
 * Launch Buddy sets (P5 item 2, FR-72), as stored in the `launch.sets` preference. The shell reads
 * the same preference to run a set by id (`crates/pluto-core/src/launch.rs`), so these shapes
 * must match its `parse`.
 */
export interface LaunchItem { label: string; target: string }
export interface LaunchSet { id: string; name: string; items: LaunchItem[]; focus_minutes: number | null }
export interface LaunchSets { sets: LaunchSet[] }

export const LAUNCH_PREF = "launch.sets";
export const MAX_ITEMS = 20;
export const EMPTY: LaunchSets = { sets: [] };

/** Whatever is stored, as a clean list (bad entries dropped, like the shell does). */
export function cleanSets(raw: unknown): LaunchSets {
  const list = raw && typeof raw === "object" && Array.isArray((raw as LaunchSets).sets) ? (raw as LaunchSets).sets : [];
  return {
    sets: list.flatMap((s) => {
      if (!s || typeof s !== "object" || typeof s.id !== "string" || typeof s.name !== "string" || !s.id.trim() || !s.name.trim()) return [];
      const items = Array.isArray(s.items)
        ? s.items.filter((i): i is LaunchItem => !!i && typeof i.target === "string" && !!i.target.trim()).map((i) => ({ label: typeof i.label === "string" ? i.label : "", target: i.target }))
        : [];
      const m = s.focus_minutes;
      return [{ id: s.id, name: s.name.trim(), items, focus_minutes: typeof m === "number" && m >= 1 && m <= 240 ? m : null }];
    }),
  };
}

export const isWeb = (t: string) => /^(https?:\/\/|mailto:)/i.test(t.trim());

/** A web address typed without https:// gets it; anything else is left alone. */
export function webTarget(typed: string): string | null {
  const t = typed.trim();
  if (!t) return null;
  if (isWeb(t)) return t;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(t)) return `https://${t}`;
  return null;
}

/** "C:\Notes\Physics.pdf" → "Physics.pdf"; a web link → its site. Same rule as the shell. */
export function shortName(target: string): string {
  const t = target.trim();
  const web = /^[a-z]+:\/\/([^/?#]+)/i.exec(t);
  if (web?.[1]) return web[1];
  if (t.toLowerCase().startsWith("mailto:")) return t.slice(7);
  return t.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || t;
}

export const labelOf = (i: LaunchItem) => i.label.trim() || shortName(i.target);

export function upsert(all: LaunchSets, set: LaunchSet): LaunchSets {
  const at = all.sets.findIndex((s) => s.id === set.id);
  const sets = [...all.sets];
  if (at >= 0) sets[at] = set; else sets.push(set);
  return { sets };
}
export const remove = (all: LaunchSets, id: string): LaunchSets => ({ sets: all.sets.filter((s) => s.id !== id) });
export const newId = () => `set-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
