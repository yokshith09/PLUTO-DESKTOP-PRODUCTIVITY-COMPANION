import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookHeart, Copy, KeyRound, Lock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { usePref } from "@/features/guide/usePref";
import { PageHeader } from "@/features/shell/PageHeader";
import { errorMessage, ipc } from "@/ipc";
import { onCommand } from "@/ipc/transport";
import { parseYmd, ymd } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { DayCard } from "./DayCard";
import { DiaryCalendar } from "./DiaryCalendar";

export const IDLE_LOCK_MS = 5 * 60_000;
export const PICKUP_PREF = "diary.pickup";
const STATUS = ["diary", "status"] as const;
const OVERVIEW = ["diary", "overview"] as const;

function PasswordForm({ configured, onDone }: { configured: boolean; onDone: (recoveryKey?: string) => void }) {
  const [pw, setPw] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [key, setKey] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const submit = async () => {
    setError(null);
    if ((!configured || recovering) && pw !== again) return setError("The two passwords are not the same.");
    try {
      let made: string | undefined;
      if (recovering) await ipc.diaryRecover(key, pw);
      else if (configured) await ipc.diaryUnlock(pw);
      else made = await ipc.diarySetup(pw);
      setPw(""); setAgain(""); setKey("");
      onDone(made);
      await qc.invalidateQueries({ queryKey: STATUS });
    } catch (e) { setError(errorMessage(e)); }
  };
  return (
    <form className="mx-auto mt-10 max-w-sm space-y-3 rounded-xl border bg-card p-6" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="flex items-center gap-2 text-sm font-semibold"><Lock aria-hidden className="size-4 text-primary" />{recovering ? "Set a new password" : configured ? "Unlock your diary" : "Set a password for your diary"}</div>
      {!configured && <p className="text-xs text-muted-foreground">Only you can read it. After you create it, Pluto shows you a recovery key once. Keep that key: it is the only way back in if you forget the password.</p>}
      {recovering && <Input autoFocus value={key} onChange={(e) => setKey(e.target.value)} aria-label="Recovery key" placeholder="ABCD-EFGH-…" autoComplete="off" />}
      <Input autoFocus={!recovering} type="password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label={recovering ? "New password" : "Password"} autoComplete={configured && !recovering ? "current-password" : "new-password"} />
      {(!configured || recovering) && <Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} aria-label="Repeat the password" autoComplete="new-password" />}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={!pw || (recovering && !key.trim())}>{recovering ? "Recover diary" : configured ? "Unlock" : "Create diary"}</Button>
      {configured && (
        <p className="space-y-1 text-center text-xs text-muted-foreground">
          <button type="button" className="block w-full rounded text-primary underline outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setRecovering(!recovering); setError(null); }}>{recovering ? "Back to unlock" : "Forgot the password? Use the recovery key"}</button>
          Lost the recovery key too?{" "}
          <ConfirmAction message="Erase the whole diary? Every entry is deleted and cannot be brought back." verb="Erase" onConfirm={() => void ipc.diaryErase().then(() => qc.invalidateQueries({ queryKey: STATUS }))}>
            <button type="button" className="rounded text-primary underline outline-none focus-visible:ring-2 focus-visible:ring-ring">Erase the diary</button>
          </ConfirmAction>
        </p>
      )}
    </form>
  );
}

function RecoveryKeyCard({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(recoveryKey); notify.success("Recovery key copied"); } catch { notify.error("Could not copy"); } };
  return (
    <section aria-label="Recovery key" className="mx-auto mt-10 max-w-md space-y-3 rounded-xl border bg-card p-6">
      <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound aria-hidden className="size-4 text-primary" />Your recovery key</div>
      <p className="text-xs text-muted-foreground">If you forget your password, this key lets you set a new one without losing anything. Pluto shows it only now and does not keep a readable copy. Write it down or save it somewhere safe.</p>
      <p className="select-all rounded-md bg-muted px-3 py-2 text-center font-mono text-sm tracking-wider" aria-label="Recovery key value">{recoveryKey}</p>
      <Button variant="outline" size="sm" className="w-full" onClick={() => void copy()}><Copy />Copy</Button>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="size-4" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I have saved my recovery key</label>
      <Button className="w-full" disabled={!saved} onClick={onDone}>Open my diary</Button>
    </section>
  );
}

const RECENT = 8;

function Journal({ onLock }: { onLock: () => void }) {
  const qc = useQueryClient();
  const today = ymd(new Date());
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const pickup = usePref<boolean>(PICKUP_PREF, (r) => r === true);
  const overview = useQuery({ queryKey: OVERVIEW, queryFn: () => ipc.diaryOverview() });
  const infos = overview.data ?? [];
  const [query, setQuery] = useState("");
  const results = useQuery({ queryKey: ["diary", "search", query.trim()], queryFn: () => ipc.diarySearch(query), enabled: query.trim().length > 0 });
  const changed = useCallback(() => void qc.invalidateQueries({ queryKey: OVERVIEW }), [qc]);
  // Opening a day in another year moves the calendar there too.
  const show = (day: string) => { setOpen(day); setYear(Number(day.slice(0, 4))); };
  const recent = all ? infos : infos.slice(0, RECENT);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="min-w-0 space-y-5">
        <DiaryCalendar year={year} onYear={setYear} infos={infos} onOpen={show} />

        <section aria-label="Recent days">
          <h2 className="mb-2 text-[13px] font-semibold text-muted-foreground">Recent days</h2>
          {infos.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">Nothing yet. Press “Write today” to start; each day you write turns one square on.</p>
          ) : (
            <>
              <ul className="grid gap-2 sm:grid-cols-2">
                {recent.map((d) => (
                  <li key={d.day}>
                    <button type="button" onClick={() => show(d.day)} aria-label={`Open ${d.day}`}
                      className="flex h-full w-full flex-col gap-1 rounded-xl border bg-card p-3 text-left outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex items-center gap-2 text-[13px] font-semibold">
                        {parseYmd(d.day).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                        <span className="ml-auto rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{d.entries} {d.entries === 1 ? "entry" : "entries"}</span>
                      </span>
                      <span className="line-clamp-2 min-h-[2.6em] text-[13px] text-muted-foreground">{d.snippet}</span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">{d.words} words</span>
                    </button>
                  </li>
                ))}
              </ul>
              {infos.length > RECENT && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${infos.length} days`}</Button>}
            </>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <Button variant="outline" size="sm" className="w-full" onClick={onLock}><Lock />Lock now</Button>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <Switch checked={pickup.value === true} onCheckedChange={(v) => void pickup.set(v)} aria-label="Spot things to do" />
          <span><span className="block font-medium text-foreground">Spot things to do</span>Underlines lines like “I need to submit… by Friday”. Off by default; it all happens on this computer.</span>
        </label>
        <div>
          <label htmlFor="diary-search" className="mb-1 block text-xs font-medium text-muted-foreground">Search the diary</label>
          <Input id="diary-search" type="search" value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQuery("")} placeholder="Words from an entry" className="h-8" />
          {query.trim() && (
            <ul aria-label="Search results" className="mt-2 max-h-72 space-y-1 overflow-auto">
              {(results.data ?? []).map((h) => (
                <li key={h.day}><button type="button" onClick={() => show(h.day)} className="w-full rounded px-2 py-1 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"><span className="block font-medium tabular-nums">{h.day}</span><span className="block text-muted-foreground">{h.snippet}</span></button></li>
              ))}
              {results.data && results.data.length === 0 && <li className="px-2 text-xs text-muted-foreground">No entry has those words.</li>}
            </ul>
          )}
        </div>
      </aside>

      <DayCard day={open} onClose={() => setOpen(null)} onDay={show} onChanged={changed} pickup={pickup.value === true} onPickup={(v) => void pickup.set(v)} />
    </div>
  );
}

/** Diary: a private, password-locked journal. The text is encrypted on this computer and never leaves it. */
export function DiaryPage() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: STATUS, queryFn: () => ipc.diaryStatus() });
  const lock = useCallback(async () => { await ipc.diaryLock(); await qc.invalidateQueries({ queryKey: STATUS }); }, [qc]);
  const unlocked = status.data?.unlocked === true;
  // The shell locks the diary when the dashboard is put away; drop what is on screen to match.
  useEffect(() => onCommand((c) => { if (c === "diary-locked") void qc.invalidateQueries({ queryKey: STATUS }); }), [qc]);
  const [newKey, setNewKey] = useState<string | null>(null);

  // Locks after five idle minutes, and when you leave the page.
  useEffect(() => {
    if (!unlocked) return;
    let t = setTimeout(() => void lock(), IDLE_LOCK_MS);
    const reset = () => { clearTimeout(t); t = setTimeout(() => void lock(), IDLE_LOCK_MS); };
    const events = ["keydown", "pointerdown", "pointermove"] as const;
    for (const e of events) window.addEventListener(e, reset);
    return () => { clearTimeout(t); for (const e of events) window.removeEventListener(e, reset); void ipc.diaryLock(); void qc.invalidateQueries({ queryKey: STATUS }); };
  }, [unlocked, lock, qc]);

  return (
    <div>
      <PageHeader title="Diary" description="Private. Locked with your password." actions={<BookHeart aria-hidden className="size-5 text-primary" />} />
      {status.data && (newKey ? <RecoveryKeyCard recoveryKey={newKey} onDone={() => setNewKey(null)} /> : unlocked ? <Journal onLock={() => void lock()} /> : <PasswordForm configured={status.data.configured} onDone={(k) => k && setNewKey(k)} />)}
    </div>
  );
}
