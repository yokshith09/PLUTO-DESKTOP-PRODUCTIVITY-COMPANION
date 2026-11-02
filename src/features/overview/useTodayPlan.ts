import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/ipc";
import { cleanPlan, EMPTY_PLAN, type TodayPlan } from "./todayPlan";

const KEY = ["prefs", "ui.today_plan"] as const;

/** Today's order and Next up queue, kept in user preferences (`ui.today_plan`). */
export function useTodayPlan() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => cleanPlan(await ipc.prefsGet("ui.today_plan")) });
  const plan = data ?? EMPTY_PLAN;
  const save = async (next: TodayPlan) => {
    qc.setQueryData(KEY, next);
    await ipc.prefsSet("ui.today_plan", next);
  };
  return { plan, save };
}
