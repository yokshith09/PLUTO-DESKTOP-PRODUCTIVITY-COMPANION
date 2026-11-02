import { ExamCountdown } from "@/features/student/ExamCountdown";
import { LearnCard } from "@/features/guide/LearnCard";
import type { Page } from "@/features/shell/Sidebar";
import { LinksCard } from "@/features/links/Shortcuts";
import { RoutineCard } from "@/features/routine/RoutineCard";
import { TimeHero } from "@/features/time/TimeHero";
import { FocusTile } from "@/features/focus/FocusTile";
import { dayLabel } from "@/lib/dates";
import { greeting } from "@/lib/time";
import { AgendaCard } from "./AgendaCard";
import { MovableTiles, type TileId } from "./MovableTiles";
import { QuoteOfTheDay } from "./QuoteOfTheDay";
import { useAgenda } from "./TodayAgenda";
import { YesterdayLine, type TaskFocus } from "./YesterdayLine";

/** Today: the day's list, focus, routine, time and links (owner 2026-10-25: no activity feed, no week count). */
export function TodayOverviewPage({ onShowTasks = () => {}, onNavigate = () => {} }: { onShowTasks?: (focus: TaskFocus) => void; onNavigate?: (page: Page) => void }) {
  const agenda = useAgenda();
  const now = new Date();
  const flagged = agenda.overdue + agenda.missed;

  // Rows that share their width equally and take the height their content needs (MovableTiles).
  const tiles: Record<TileId, { wide?: boolean; node: React.ReactNode; title: string }> = {
    agenda: { wide: true, title: "Today", node: <AgendaCard className="h-full" /> },
    focus: { wide: true, title: "Focus", node: <FocusTile className="h-full" /> },
    routine: { wide: true, title: "Daily routine", node: <RoutineCard className="h-full" /> },
    time: { wide: true, title: "Total time today", node: <TimeHero className="h-full" /> },
    links: { wide: true, title: "Links", node: <LinksCard className="h-full" /> },
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 pt-1">
          <h1 className="text-2xl font-semibold tracking-tight">{greeting(now.getHours())}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {dayLabel(now)} · {agenda.open} open{flagged ? <> · <span className="text-destructive">{flagged} overdue or missed</span></> : null}
          </p>
          <YesterdayLine onShow={onShowTasks} className="mt-2" />
        </div>
        <QuoteOfTheDay className="w-full sm:w-auto sm:min-w-80 sm:flex-1 lg:flex-none lg:w-[30rem]" />
      </header>
      <ExamCountdown onManage={() => onNavigate("study")} />
      <LearnCard onShow={onNavigate} />
      <MovableTiles tiles={tiles} />
    </div>
  );
}
