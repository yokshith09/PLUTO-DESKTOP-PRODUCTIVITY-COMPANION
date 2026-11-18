import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/ipc";
import type { SyllabusEdit } from "@/ipc/types";
import { notify } from "@/lib/notify";
import { ymd } from "@/lib/dates";

export const cardsKey = ["courses", "cards"] as const;

/** The sidebar: every course with its colour and subtitle. */
export function useCourseCards() {
  return useQuery({ queryKey: cardsKey, queryFn: () => ipc.courseCards() });
}

/** One course with everything on it, and the single way to change it. */
export function useCoursePage(id: string | null) {
  const qc = useQueryClient();
  const today = ymd(new Date());
  const detail = useQuery({ queryKey: ["courses", "detail", id, today], queryFn: () => ipc.courseDetail(id as string, today), enabled: !!id });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["courses"] }), qc.invalidateQueries({ queryKey: ["exams"] }), qc.invalidateQueries({ queryKey: ["weekly-report"] })]);
  const mutation = useMutation({
    mutationFn: (e: SyllabusEdit) => ipc.courseEdit(e),
    onSuccess: refresh,
    onError: (e) => notify.error((e as { message?: string })?.message ?? "That did not work."),
  });
  /** Make a change; `then` runs only when it worked (to close a form, say). */
  const edit = (e: SyllabusEdit, then?: () => void) => mutation.mutate(e, { onSuccess: () => then?.() });
  return { today, detail: detail.data, loading: detail.isPending && !!id, edit, refresh };
}
