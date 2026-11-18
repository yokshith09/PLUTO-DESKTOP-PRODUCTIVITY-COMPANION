import { useState } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ipc } from "@/ipc";
import type { ClassInput, CourseCard, TimetableClass } from "@/ipc/types";
import { notify } from "@/lib/notify";
import { DAY_NAMES, boxTime, fromBoxTime } from "./timetableLogic";

const sel = "h-9 w-full rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const lab = "space-y-1 text-xs text-muted-foreground";

export type Draft = { id: string | null; input: ClassInput };

export const blankClass = (day: number, start: number, end: number): Draft => ({
  id: null,
  input: { course_id: null, title: "", day, start_min: start, end_min: end, place: "", teacher: "", repeat: "weekly", once_date: null, remind_min: null },
});
export const draftOf = (c: TimetableClass): Draft => ({ id: c.id, input: { course_id: c.course_id, title: c.title, day: c.day, start_min: c.start_min, end_min: c.end_min, place: c.place, teacher: c.teacher, repeat: c.repeat, once_date: c.once_date, remind_min: c.remind_min } });

/** Add or change one class: course (or a name), day, times, place, teacher, how it repeats, a reminder. */
export function ClassEditor({ draft, courses, onClose, onSaved }: { draft: Draft | null; courses: CourseCard[]; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={draft !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-5">{draft && <Form key={draft.id ?? "new"} draft={draft} courses={courses} onClose={onClose} onSaved={onSaved} />}</DialogContent>
    </Dialog>
  );
}

function Form({ draft, courses, onClose, onSaved }: { draft: Draft; courses: CourseCard[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<ClassInput>(draft.input);
  const [error, setError] = useState("");
  const set = (p: Partial<ClassInput>) => setV((x) => ({ ...x, ...p }));
  const fail = (e: unknown) => setError((e as { message?: string })?.message ?? "That did not work.");
  const save = () => {
    setError("");
    const run = draft.id ? ipc.classUpdate(draft.id, v) : ipc.classAdd(v);
    run.then(() => { onSaved(); onClose(); }).catch(fail);
  };
  const time = (k: "start_min" | "end_min", name: string) => (
    <label className={lab}>{name}
      <Input type="time" step={300} value={boxTime(v[k])} onChange={(e) => { const m = fromBoxTime(e.target.value); if (m !== null) set({ [k]: m }); }} className="h-9" />
    </label>
  );
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div>
        <DialogTitle className="text-base font-semibold">{draft.id ? "Edit class" : "Add class"}</DialogTitle>
        <DialogDescription className="text-[13px]">Pick a course, or give the class a name of its own.</DialogDescription>
      </div>
      <label className={lab}>Course
        <select value={v.course_id ?? ""} onChange={(e) => set({ course_id: e.target.value || null })} className={sel}>
          <option value="">No course</option>
          {courses.filter((c) => !c.archived || c.id === v.course_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className={lab}>Name {v.course_id && "(optional, the course name is used)"}
        <Input value={v.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} className="h-9" />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className={lab}>Day
          <select value={v.day} onChange={(e) => set({ day: Number(e.target.value) })} className={sel}>{DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
        </label>
        {time("start_min", "Starts")}
        {time("end_min", "Ends")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={lab}>Place<Input value={v.place} maxLength={40} onChange={(e) => set({ place: e.target.value })} className="h-9" /></label>
        <label className={lab}>Teacher<Input value={v.teacher} maxLength={40} onChange={(e) => set({ teacher: e.target.value })} className="h-9" /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={lab}>Repeats
          <select value={v.repeat} onChange={(e) => set({ repeat: e.target.value, once_date: e.target.value === "once" ? (v.once_date ?? "") : null })} className={sel}>
            <option value="weekly">Every week</option><option value="odd">Odd weeks</option><option value="even">Even weeks</option><option value="once">Just once</option>
          </select>
        </label>
        {v.repeat === "once"
          ? <label className={lab}>Date<Input type="date" value={v.once_date ?? ""} onChange={(e) => set({ once_date: e.target.value })} className="h-9" /></label>
          : <label className={lab}>Remind me
              <select value={v.remind_min ?? ""} onChange={(e) => set({ remind_min: e.target.value ? Number(e.target.value) : null })} className={sel}>
                <option value="">No reminder</option><option value="10">10 minutes before</option><option value="30">30 minutes before</option>
              </select>
            </label>}
      </div>
      {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        {draft.id && (
          <ConfirmAction message="Delete this class?" onConfirm={() => ipc.classDelete(draft.id as string).then(() => { onSaved(); onClose(); notify.success("Class deleted"); }).catch(fail)}>
            <Button type="button" variant="ghost" size="sm">Delete</Button>
          </ConfirmAction>
        )}
        <Button type="button" variant="outline" className="ml-auto" onClick={onClose}>Cancel</Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
