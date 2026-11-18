// Browser/test stand-in for the timetable commands (mirrors crates/pluto-core/src/classes.rs).
import type { ClassDraft, ClassInput, ClassPreview, TimetableClass } from "./types";

type Fail = (code: "VALIDATION" | "NOT_FOUND" | "CONFLICT", message: string) => never;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const FULL = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const time = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && v <= 1440 ? v : null;
};
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const quote = (s: string) => (/[,"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

function cells(line: string, sep: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (c === '"' && q && line[i + 1] === '"') { cur += '"'; i++; }
    else if (c === '"') q = !q;
    else if (c === sep && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

export function parseCsv(input: string): ClassPreview {
  const text = input.replace(/^\u{FEFF}/u, "");
  const lines = text.split(/\r?\n/);
  const first = lines[0] ?? "";
  const sep = first.includes(",") || !first.includes(";") ? "," : ";";
  const rows: ClassDraft[] = []; const errors: { line: number; message: string }[] = [];
  lines.forEach((line, i) => {
    const n = i + 1;
    if (!line.trim()) return;
    const c = cells(line, sep);
    if (i === 0 && (c[0] ?? "").toLowerCase() === "course") return;
    const bad = (message: string) => errors.push({ line: n, message });
    if (c.length < 4) return bad("Needs at least course, day, start and end.");
    const d = (c[1] ?? "").toLowerCase();
    const day = DAYS.indexOf(d) >= 0 ? DAYS.indexOf(d) : FULL.indexOf(d);
    if (day < 0) return bad("The day must be Mon, Tue, Wed, Thu, Fri, Sat or Sun.");
    const start = time(c[2] ?? ""); const end = time(c[3] ?? "");
    if (start === null || end === null) return bad("Times look like 09:30 (24-hour).");
    if (end <= start || start > 1439) return bad("The class must end after it starts.");
    if (!c[0] || c[0].length > 80) return bad("Give the class a course or name of up to 80 characters.");
    if ((c[4] ?? "").length > 40 || (c[5] ?? "").length > 40) return bad("Place and teacher can be up to 40 characters.");
    rows.push({ course: c[0], day, start_min: start, end_min: end, place: c[4] ?? "", teacher: c[5] ?? "" });
  });
  return { rows, errors };
}

export function makeClasses(courses: { id: string; name: string }[], fail: Fail, nextId: () => string, newCourse: (name: string) => { id: string; name: string }) {
  const classes: TimetableClass[] = [];
  const clean = (i: ClassInput): ClassInput => {
    let title = i.title.trim();
    if (!title) title = courses.find((c) => c.id === i.course_id)?.name ?? "";
    if (!title) fail("VALIDATION", "Pick a course or give the class a name.");
    if (i.day < 0 || i.day > 6) fail("VALIDATION", "Pick a day.");
    if (i.start_min < 0 || i.start_min > 1439 || i.end_min > 1440 || i.end_min <= i.start_min) fail("VALIDATION", "The class must end after it starts.");
    if (!["weekly", "odd", "even", "once"].includes(i.repeat)) fail("VALIDATION", "Pick how it repeats.");
    if (i.repeat === "once" && !/^\d{4}-\d{2}-\d{2}$/.test(i.once_date ?? "")) fail("VALIDATION", "Pick the date.");
    if (i.remind_min != null && i.remind_min !== 10 && i.remind_min !== 30) fail("VALIDATION", "Remind 10 or 30 minutes before.");
    if (i.place.trim().length > 40 || i.teacher.trim().length > 40) fail("VALIDATION", "That can be up to 40 characters.");
    return { ...i, title, place: i.place.trim(), teacher: i.teacher.trim(), once_date: i.repeat === "once" ? i.once_date : null };
  };
  const sorted = () => [...classes].sort((a, b) => a.day - b.day || a.start_min - b.start_min || a.title.localeCompare(b.title));
  return {
    classes_list: () => sorted(),
    class_add: (a: Record<string, unknown>) => { const c = { id: nextId(), ...clean(a.input as ClassInput) }; classes.push(c); return c; },
    class_update: (a: Record<string, unknown>) => {
      const c = classes.find((x) => x.id === a.id) ?? fail("NOT_FOUND", "That class no longer exists.");
      Object.assign(c, clean(a.input as ClassInput)); return c;
    },
    class_delete: (a: Record<string, unknown>) => {
      const i = classes.findIndex((x) => x.id === a.id);
      if (i < 0) fail("NOT_FOUND", "That class no longer exists.");
      classes.splice(i, 1); return null;
    },
    classes_preview: (a: Record<string, unknown>) => parseCsv(String(a.csv)),
    classes_import: (a: Record<string, unknown>) => {
      const { rows } = parseCsv(String(a.csv));
      if (a.replace) classes.length = 0;
      for (const r of rows) {
        const course = courses.find((c) => c.name.toLowerCase() === r.course.toLowerCase()) ?? newCourse(r.course);
        classes.push({ id: nextId(), course_id: course.id, title: r.course, day: r.day, start_min: r.start_min, end_min: r.end_min, place: r.place, teacher: r.teacher, repeat: "weekly", once_date: null, remind_min: null });
      }
      return rows.length;
    },
    classes_export: () => ["course,day,start,end,place,teacher", ...sorted().map((c) => [quote(courses.find((x) => x.id === c.course_id)?.name ?? c.title), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][c.day], hhmm(c.start_min), hhmm(c.end_min), quote(c.place), quote(c.teacher)].join(","))].join("\n") + "\n",
    classes_xlsx_to_csv: () => fail("VALIDATION", "Excel files can only be read in the Pluto app."),
    seedDemo() {
      const mk = (title: string, day: number, s: number, e: number, place: string, teacher: string) => {
        const course = courses.find((c) => c.name === title) ?? newCourse(title);
        classes.push({ id: nextId(), course_id: course.id, title, day, start_min: s, end_min: e, place, teacher, repeat: "weekly", once_date: null, remind_min: null });
      };
      mk("Advanced Algorithms & Analysis", 0, 540, 630, "C-201", "Dr Rao");
      mk("Deep Learning", 0, 660, 750, "Lab 3", "Dr Iyer");
      mk("Computer Networks", 1, 600, 690, "B-110", "Ms Das");
      mk("Operating Systems", 2, 540, 630, "C-105", "Dr Khan");
      mk("Database Systems", 2, 840, 960, "Lab 1", "Mr Lee");
      mk("Advanced Algorithms & Analysis", 3, 600, 690, "C-201", "Dr Rao");
      mk("SDN", 4, 570, 660, "B-204", "Dr Paul");
      mk("Deep Learning", 4, 780, 870, "Lab 3", "Dr Iyer");
    },
  };
}
