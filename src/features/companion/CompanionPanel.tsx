import { useState } from "react";
import { Cake, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Row, Section } from "@/features/settings/parts";
import { petSay } from "@/ipc";
import { ageDays, ageLabel, helloLine, type Companion } from "./companion";
import { helloFacts, useCompanion } from "./useCompanion";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * About you and your pet (FR-93/FR-94), in Settings › Profile since U-2 (owner 2026-11-03): your
 * name and birthday (day and month, never the year), the pet's name, age and birthday, and the
 * once-a-day hello. Everything stays on this computer.
 */
export function YouSection() {
  const { companion, save } = useCompanion();
  const [name, setName] = useState<string | null>(null);
  if (!companion) return null;
  const [month, day] = companion.userBirthday?.split("-") ?? ["", ""];
  const set = (patch: Partial<Companion>) => void save({ ...companion, ...patch });
  const setBirthday = (m: string, d: string) => set({ userBirthday: m && d ? `${m}-${d}` : null });
  const select = "h-8 rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <>
      <Row label="Your first name" hint="So the pet can greet you by name.">
        <Input id="you-name" aria-label="Your first name" maxLength={40} placeholder="Optional" className="h-8 w-48"
          value={name ?? companion.userName} onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name !== null) set({ userName: name.trim() }); setName(null); }} />
      </Row>
      <Row label="Your birthday" hint="Day and month only, never the year.">
        <select aria-label="Birthday month" value={month} onChange={(e) => setBirthday(e.target.value, day || "01")} className={select}>
          <option value="">Month</option>
          {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
        </select>
        <select aria-label="Birthday day" value={day} onChange={(e) => setBirthday(month || "01", e.target.value)} className={select}>
          <option value="">Day</option>
          {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => <option key={d} value={d}>{Number(d)}</option>)}
        </select>
      </Row>
    </>
  );
}

export function PetSection({ onOpenCharacter }: { onOpenCharacter?: (() => void) | undefined }) {
  const { companion, save } = useCompanion();
  const [pet, setPet] = useState<string | null>(null);
  if (!companion) return null;
  const set = (patch: Partial<Companion>) => void save({ ...companion, ...patch });
  const born = new Date(`${companion.born}T12:00:00`);
  const petName = companion.petName || "Pluto";
  const days = ageDays(companion, new Date());
  const sayHello = async () => {
    const now = new Date();
    await petSay({ text: helloLine(companion, now, await helloFacts(now)), pose: "wave", ms: 10_000 });
  };
  return (
    <Section title="Your pet">
      <Row label="Pet’s name">
        <Input id="pet-name" aria-label="Pet’s name" maxLength={30} placeholder="Pluto" className="h-8 w-48"
          value={pet ?? companion.petName} onChange={(e) => setPet(e.target.value)}
          onBlur={() => { if (pet !== null) set({ petName: pet.trim() }); setPet(null); }} />
      </Row>
      <Row label={`${petName} is ${ageLabel(companion, new Date())}`} hint={`${days} ${days === 1 ? "day" : "days"} together · birthday ${born.toLocaleDateString(undefined, { day: "numeric", month: "long" })}, the day you met`}>
        <Cake className="size-5 text-primary" aria-hidden />
      </Row>
      <Row label="Say hello once a day" hint="The first time you open your PC each day. Never more than once.">
        <Button size="sm" variant="ghost" onClick={() => void sayHello()}><MessageCircle />Say it now</Button>
        <Switch checked={companion.greet} onCheckedChange={(v) => set({ greet: v })} aria-label="Say hello once a day" />
      </Row>
      {onOpenCharacter && (
        <Row label="Looks, reactions and nudges" hint="On the Character page.">
          <Button size="sm" variant="outline" onClick={onOpenCharacter}>Open Character</Button>
        </Row>
      )}
    </Section>
  );
}

/** On the Character page: name, birthdays and the hello moved to Settings › Profile (U-2). */
export function CompanionPanel({ onOpenProfile }: { onOpenProfile?: (() => void) | undefined }) {
  const { companion } = useCompanion();
  if (!companion) return null;
  const petName = companion.petName || "Pluto";
  return (
    <section aria-label="About you and your pet" className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <Cake className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">{petName} is {ageLabel(companion, new Date())}</p>
          <p className="text-xs text-muted-foreground">Your name, the pet’s name, birthdays and the daily hello are in Settings › Profile.</p>
        </div>
        {onOpenProfile && <Button size="sm" variant="outline" onClick={onOpenProfile}>Open Profile</Button>}
      </div>
    </section>
  );
}
