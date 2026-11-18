// Browser/test stand-in for the Course page commands (mirrors crates/pluto-core/src/syllabus.rs).
import type { CourseCard, CourseDate, CourseDetail, CourseExam, SyllabusEdit, Topic } from "./types";

type Fail = (code: "VALIDATION" | "NOT_FOUND" | "CONFLICT", message: string) => never;
type Course = { id: string; name: string };
type Extra = { subtitle: string; color: number; archived: boolean };
type StoredExam = { id: string; course_id: string | null; title: string; on_date: string; at_time?: string; place?: string };
const KINDS = ["assignment", "lab", "quiz", "project", "other"];

export function makeSyllabus(courses: Course[], exams: StoredExam[], fail: Fail, nextId: () => string) {
  const extras = new Map<string, Extra>();
  const topics = new Map<string, Topic[]>(); // by course
  const examTopics = new Map<string, string[]>(); // exam id -> topic ids
  const dates = new Map<string, CourseDate[]>(); // by course
  const extra = (id: string): Extra => extras.get(id) ?? { subtitle: "", color: 0, archived: false };
  const card = (c: Course): CourseCard => ({ id: c.id, name: c.name, ...extra(c.id) });
  const text = (s: string, max: number, what: string) => {
    const t = s.trim();
    if (!t || t.length > max) fail("VALIDATION", `Give the ${what} a name of up to ${max} characters.`);
    return t;
  };
  const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fail("VALIDATION", "Pick a date."));
  const findTopic = (id: string) => {
    for (const [course, list] of topics) { const t = list.find((x) => x.id === id); if (t) return { course, list, t }; }
    return fail("NOT_FOUND", "That item no longer exists.");
  };
  const findSub = (id: string) => {
    for (const list of topics.values()) for (const t of list) { const s = t.subtopics.find((x) => x.id === id); if (s) return { t, s }; }
    return fail("NOT_FOUND", "That item no longer exists.");
  };
  const findPoint = (id: string) => {
    for (const list of topics.values()) for (const t of list) for (const s of t.subtopics) { const p = s.points.find((x) => x.id === id); if (p) return { s, p }; }
    return fail("NOT_FOUND", "That item no longer exists.");
  };
  const course = (id: string) => courses.find((c) => c.id === id) ?? fail("NOT_FOUND", "That item no longer exists.");

  return {
    forget(courseId: string) {
      extras.delete(courseId); topics.delete(courseId); dates.delete(courseId);
    },
    course_cards: () => courses.map(card).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name)),
    course_detail: (a: Record<string, unknown>): CourseDetail => {
      const c = course(String(a.id));
      const list = topics.get(c.id) ?? [];
      const mine: CourseExam[] = exams.filter((e) => e.course_id === c.id)
        .sort((x, y) => x.on_date.localeCompare(y.on_date) || (x.at_time ?? "").localeCompare(y.at_time ?? ""))
        .map((e) => ({ id: e.id, title: e.title, on_date: e.on_date, at_time: e.at_time ?? "", place: e.place ?? "", topic_ids: examTopics.get(e.id) ?? [] }));
      return {
        card: card(c), topics: list, exams: mine,
        dates: [...(dates.get(c.id) ?? [])].sort((x, y) => x.on_date.localeCompare(y.on_date)),
        summary: { focus_ms_week: 0, open_tasks: 0, notes: 0 },
      };
    },
    course_edit: (a: Record<string, unknown>) => {
      const e = a.edit as SyllabusEdit;
      switch (e.op) {
        case "course_set": {
          course(e.id);
          if (e.subtitle.trim().length > 60) fail("VALIDATION", "The line under the name can be up to 60 characters.");
          extras.set(e.id, { subtitle: e.subtitle.trim(), color: e.color % 8, archived: e.archived }); break;
        }
        case "topic_add": {
          course(e.course_id);
          const list = topics.get(e.course_id) ?? [];
          list.push({ id: nextId(), title: text(e.title, 100, "topic"), starred: false, status: 0, subtopics: [] });
          topics.set(e.course_id, list); break;
        }
        case "topic_set": {
          const { t } = findTopic(e.id);
          if (e.status != null && e.status > 3) fail("VALIDATION", "Pick one of the four states.");
          if (e.title != null) t.title = text(e.title, 100, "topic");
          if (e.starred != null) t.starred = e.starred;
          if (e.status != null) t.status = e.status; break;
        }
        case "topic_delete": {
          const { list, t } = findTopic(e.id); list.splice(list.indexOf(t), 1); break;
        }
        case "topic_move": {
          const { list, t } = findTopic(e.id);
          const i = list.indexOf(t); const j = e.up ? i - 1 : i + 1;
          const o = list[j];
          if (o) { list[i] = o; list[j] = t; } break;
        }
        case "subtopic_add": {
          const { t } = findTopic(e.topic_id);
          t.subtopics.push({ id: nextId(), title: text(e.title, 100, "subtopic"), done: false, points: [] }); break;
        }
        case "subtopic_set": {
          const { s } = findSub(e.id);
          if (e.title != null) s.title = text(e.title, 100, "subtopic");
          if (e.done != null) s.done = e.done; break;
        }
        case "subtopic_delete": {
          const { t, s } = findSub(e.id); t.subtopics.splice(t.subtopics.indexOf(s), 1); break;
        }
        case "point_add": {
          const { s } = findSub(e.subtopic_id);
          const t = e.text.trim();
          if (!t || t.length > 300) fail("VALIDATION", "A short note can be up to 300 characters.");
          s.points.push({ id: nextId(), text: t, written: false }); break;
        }
        case "point_set": {
          const { p } = findPoint(e.id);
          if (e.text != null) { const t = e.text.trim(); if (!t || t.length > 300) fail("VALIDATION", "A short note can be up to 300 characters."); p.text = t; }
          if (e.written != null) p.written = e.written; break;
        }
        case "point_delete": {
          const { s, p } = findPoint(e.id); s.points.splice(s.points.indexOf(p), 1); break;
        }
        case "exam_save": {
          course(e.course_id);
          if (e.at_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.at_time.trim())) fail("VALIDATION", "Use a time like 10:00.");
          const fields = { title: text(e.title, 100, "exam"), on_date: day(e.on_date), at_time: e.at_time.trim(), place: e.place.trim() };
          const own = new Set((topics.get(e.course_id) ?? []).map((t) => t.id));
          let ex = e.id ? exams.find((x) => x.id === e.id && x.course_id === e.course_id) : undefined;
          if (e.id && !ex) fail("NOT_FOUND", "That item no longer exists.");
          if (ex) Object.assign(ex, fields); else { ex = { id: nextId(), course_id: e.course_id, ...fields }; exams.push(ex); }
          examTopics.set(ex.id, e.topic_ids.filter((t) => own.has(t))); break;
        }
        case "exam_delete": {
          const i = exams.findIndex((x) => x.id === e.id);
          if (i < 0) fail("NOT_FOUND", "That item no longer exists.");
          exams.splice(i, 1); examTopics.delete(e.id); break;
        }
        case "date_save": {
          course(e.course_id);
          if (!KINDS.includes(e.kind)) fail("VALIDATION", "Pick a type.");
          const list = dates.get(e.course_id) ?? [];
          const fields = { title: text(e.title, 100, "date"), on_date: day(e.on_date), kind: e.kind };
          const ex = e.id ? list.find((x) => x.id === e.id) : undefined;
          if (e.id && !ex) fail("NOT_FOUND", "That item no longer exists.");
          if (ex) Object.assign(ex, fields); else list.push({ id: nextId(), ...fields });
          dates.set(e.course_id, list); break;
        }
        case "date_delete": {
          for (const list of dates.values()) { const i = list.findIndex((x) => x.id === e.id); if (i >= 0) { list.splice(i, 1); return null; } }
          fail("NOT_FOUND", "That item no longer exists.");
        }
      }
      return null;
    },
    /** Browser preview only: the course from the owner's design. */
    seedDemo(addCourse: (name: string) => Course) {
      const c = addCourse("Advanced Algorithms & Analysis");
      extras.set(c.id, { subtitle: "CSE • 5th Semester", color: 3, archived: false });
      for (const [name, color] of [["Deep Learning", 5], ["Computer Networks", 1], ["Operating Systems", 2], ["Database Systems", 4], ["SDN", 6]] as const) extras.set(addCourse(name).id, { subtitle: "", color, archived: false });
      const mk = (title: string, starred: boolean, status: number, subs: [string, boolean, string[]][]): Topic => ({
        id: nextId(), title, starred, status,
        subtopics: subs.map(([t, done, pts]) => ({ id: nextId(), title: t, done, points: pts.map((p, i) => ({ id: nextId(), text: p, written: i === 0 && done })) })),
      });
      const list = [
        mk("External Memory Management (LRU)", true, 3, [["LRU policy", true, ["Evict the least recently used page", "Hit ratio depends on locality"]], ["Page faults", true, ["A miss costs a disk read"]], ["Stack distance", true, []], ["Belady's anomaly", false, []]]),
        mk("Basic Graphs", true, 1, [["BFS and DFS", true, ["BFS finds shortest paths in unweighted graphs"]], ["Connectivity", false, []]]),
        mk("B-Trees", false, 0, [["Insert", false, []], ["Delete", false, []]]),
        mk("Proofs", false, 2, [["Induction", true, ["Base case, then step"]]]),
        mk("Max Flow", true, 0, []),
      ];
      topics.set(c.id, list);
      const ex = { id: nextId(), course_id: c.id, title: "Midterm", on_date: "2026-11-24", at_time: "10:00", place: "C-201" };
      exams.push(ex);
      examTopics.set(ex.id, list.slice(0, 3).map((t) => t.id));
      dates.set(c.id, [
        { id: nextId(), title: "Assignment 3", on_date: "2026-11-21", kind: "assignment" },
        { id: nextId(), title: "Lab 2 report", on_date: "2026-11-26", kind: "lab" },
        { id: nextId(), title: "Quiz 2", on_date: "2026-12-02", kind: "quiz" },
      ]);
      return c;
    },
  };
}
