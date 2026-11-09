import { Button } from "@/components/ui/button";
import { Row, Section } from "@/features/settings/parts";
import { YouSection } from "@/features/companion/CompanionPanel";
import { GUIDE } from "./content";
import { useStudentPack } from "@/features/student/useStudent";
import { cn } from "@/lib/utils";
import { LEARN_PREF, parseLearn } from "./learn";
import { PROJECTS_PREF, ROLES, ROLE_INFO, ROLE_PREF, STUDENT_PACK_FEATURES, STUDENT_PACK_PREF, parseProjects, parseRole, parseStudentPack, projectsOn, studentPackOn, type Role } from "./roles";
import { TOUR_PREF, parseTour } from "./tourSteps";
import { usePref } from "./usePref";

/** Settings › Profile › You: name, birthday, who you are (only changes order and emphasis), student pack. */
export function YourProfile() {
  const role = usePref(ROLE_PREF, parseRole);
  const pack = usePref(STUDENT_PACK_PREF, parseStudentPack);
  const current: Role = role.value ?? "general";
  const packOn = studentPackOn(current, pack.value);
  const proj = usePref(PROJECTS_PREF, parseProjects);
  const projOn = projectsOn(current, proj.value);

  return (
    <Section title="You">
      <YouSection />
      <div className="space-y-4 py-4">
        <div>
          <p className="text-[13px] font-medium">What describes you best</p>
          <p className="text-xs text-muted-foreground">This only changes what the tour and the quiz show first. It only sets the Student pack and Projects page defaults below and never turns on tracking.</p>
        </div>
        <div role="radiogroup" aria-label="What describes you best" className="grid gap-2 sm:grid-cols-2">
          {ROLES.map((r) => (
            <button
              key={r} type="button" role="radio" aria-checked={current === r} onClick={() => void role.set(r)}
              className={cn("rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", current === r ? "border-primary bg-primary/10" : "hover:border-primary/50")}
            >
              <span className="block text-[13px] font-medium">{ROLE_INFO[r].label}</span>
              <span className="block text-xs text-muted-foreground">{ROLE_INFO[r].blurb}</span>
            </button>
          ))}
        </div>

        <label className="flex items-start gap-3 rounded-lg border p-3 text-[13px]">
          <input type="checkbox" className="mt-0.5 size-4" checked={packOn} onChange={(e) => void pack.set(e.target.checked)} />
          <span>
            <span className="block font-medium">Student pack</span>
            <span className="block text-xs text-muted-foreground">{STUDENT_PACK_FEATURES.join(", ")}. On by default for students, off for everyone else. Every other feature is on for everyone.</span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-lg border p-3 text-[13px]">
          <input type="checkbox" className="mt-0.5 size-4" checked={projOn} onChange={(e) => void proj.set(e.target.checked)} />
          <span>
            <span className="block font-medium">Projects page</span>
            <span className="block text-xs text-muted-foreground">On for developers, students who code and everyone else; off for students (they get Study). Switch it on or off here any time. Nothing is deleted.</span>
          </span>
        </label>
      </div>
    </Section>
  );
}

/** Settings › Profile › Help: the tour, the quiz and the guide in one place. */
export function HelpSection() {
  const tour = usePref(TOUR_PREF, parseTour);
  const learn = usePref(LEARN_PREF, parseLearn);
  const student = useStudentPack();
  return (
    <Section title="Help">
      <Row label="Tour" hint="The short walk-through from the first start.">
        <Button variant="outline" size="sm" onClick={() => void tour.set("pending")}>Replay the tour</Button>
      </Row>
      <Row label="Learn Pluto quiz" hint="A few questions about what Pluto can do, on the Today page.">
        <Button variant="outline" size="sm" onClick={() => void learn.set({ answers: {}, dismissed: false })}>Restart the quiz</Button>
      </Row>
      <details className="py-3.5 text-[13px]">
        <summary className="cursor-pointer font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Guide</summary>
        <div className="mt-2 divide-y">
          {GUIDE.filter((g) => student || !g.studentOnly).map((g) => (
            <details key={g.id} className="py-2.5">
              <summary className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring">{g.title}</summary>
              <p className="mt-2 text-muted-foreground">{g.body}</p>
            </details>
          ))}
        </div>
      </details>
    </Section>
  );
}
