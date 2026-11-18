import { useQuery } from "@tanstack/react-query";
import { Copy, FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ipc } from "@/ipc";
import { notify } from "@/lib/notify";
import { DAY_NAMES, boxTime } from "./timetableLogic";

export const CHATGPT_PROMPT = "Turn this timetable image into CSV with exactly these columns: course,day,start,end,place,teacher. Use day names Mon to Sun and 24-hour times like 09:30. One row per class.";

/** A file's content through FileReader (works in the app's webview and in tests alike). */
const readFile = <T extends string | ArrayBuffer>(f: File, as: "text" | "buffer"): Promise<T> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as T);
    r.onerror = () => reject(new Error("Could not read that file."));
    if (as === "text") r.readAsText(f); else r.readAsArrayBuffer(f);
  });

const copy = async (text: string, done: string) => {
  try { await navigator.clipboard.writeText(text); notify.success(done); } catch { notify.error("Could not copy"); }
};

/** Bring a timetable in from a CSV or Excel file (read on this computer), or send it out as CSV. */
export function ImportDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [name, setName] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const preview = useQuery({ queryKey: ["classes-preview", csv], queryFn: () => ipc.classesPreview(csv as string), enabled: csv !== null });
  const reset = () => { setCsv(null); setName(""); onClose(); };
  const read = async (f: File | undefined) => {
    if (!f) return;
    setName(f.name);
    try {
      if (/\.xlsx$/i.test(f.name)) setCsv(await ipc.classesXlsxToCsv(Array.from(new Uint8Array(await readFile<ArrayBuffer>(f, "buffer")))));
      else setCsv(await readFile<string>(f, "text"));
    } catch (e) { notify.error((e as { message?: string })?.message ?? "Could not read that file."); }
  };
  const run = (replace: boolean) => ipc.classesImport(csv as string, replace)
    .then((n) => { notify.success(`${n} ${n === 1 ? "class" : "classes"} added`); onChanged(); reset(); })
    .catch((e) => notify.error((e as { message?: string })?.message ?? "That did not work."));
  const p = preview.data;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && reset()}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <div className="space-y-1 border-b p-5">
          <DialogTitle className="text-base font-semibold">Import or export your timetable</DialogTitle>
          <DialogDescription className="text-[13px]">Files are read on this computer. Nothing is uploaded.</DialogDescription>
        </div>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5 text-[13px]">
          <section aria-label="Import" className="space-y-2">
            <p>Columns: <code className="rounded bg-muted px-1 text-xs">course,day,start,end,place,teacher</code> (day Mon to Sun, time 24-hour like 09:30).</p>
            <input ref={file} type="file" accept=".csv,.xlsx,text/csv" className="sr-only" aria-label="Choose a CSV or Excel file" onChange={(e) => void read(e.target.files?.[0])} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => file.current?.click()}><FileUp />Choose CSV or Excel file</Button>
              <Button variant="ghost" size="sm" onClick={() => void copy(CHATGPT_PROMPT, "Prompt copied")}><Copy />Copy ChatGPT prompt</Button>
            </div>
            <p className="text-xs text-muted-foreground">Have a picture of your timetable? Paste the prompt and the picture into ChatGPT, save its answer as a .csv file, and choose it here.</p>
            {p && (
              <div aria-label="Preview" role="group" className="space-y-2 rounded-lg border p-3">
                <p className="font-medium">{name}: {p.rows.length} {p.rows.length === 1 ? "class" : "classes"} found{p.errors.length > 0 && `, ${p.errors.length} ${p.errors.length === 1 ? "line" : "lines"} skipped`}</p>
                {p.rows.length > 0 && (
                  <ul className="max-h-32 divide-y overflow-y-auto text-xs">
                    {p.rows.map((r, i) => <li key={i} className="flex gap-2 py-1"><span className="w-8 shrink-0 font-medium">{DAY_NAMES[r.day]}</span><span className="w-24 shrink-0 tabular-nums text-muted-foreground">{boxTime(r.start_min)}–{boxTime(r.end_min)}</span><span className="truncate">{r.course}</span></li>)}
                  </ul>
                )}
                {p.errors.length > 0 && (
                  <ul aria-label="Skipped lines" className="space-y-0.5 text-xs text-destructive">
                    {p.errors.map((e) => <li key={e.line}>Line {e.line}: {e.message}</li>)}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={p.rows.length === 0} onClick={() => void run(true)}>Replace my timetable</Button>
                  <Button size="sm" variant="outline" disabled={p.rows.length === 0} onClick={() => void run(false)}>Add to it</Button>
                </div>
              </div>
            )}
          </section>
          <section aria-label="Export" className="space-y-2 border-t pt-4">
            <p>Copy your timetable as CSV to keep or open in Excel.</p>
            <Button variant="outline" size="sm" onClick={() => void ipc.classesExport().then((t) => copy(t, "Timetable copied as CSV"))}><Copy />Copy as CSV</Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
