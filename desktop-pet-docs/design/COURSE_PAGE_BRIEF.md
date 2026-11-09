# Course page: design brief

Owner 2026-11-09: "mention all features, I'll get it designed." Previews v2, v3, v4 and the Notebook/Board pair were rejected. This brief lists what the page must do, not how it looks.

## Where it lives

Pluto main window › Study › **Courses** tab. The other Study tabs (Timetable; Exams, notes, tasks) are out of scope. Desktop app (Windows and Mac), light and dark theme, main window usually 1000 to 1400 px wide, must still work at about 800 px.

## What the page is for

A student opens one course to answer three questions:

1. What do I still need to learn for this exam? (overview, readiness)
2. What does this topic contain, and what are my short notes for it? (learning, writing notes)
3. When are the exam and the deadlines, and what is in the exam? (facts)

## Features

### 1. Switching courses
- List of the student's courses (name and colour). Pick one to open it.
- Add a course (name, colour). Rename, change colour, archive, delete (with Undo).
- Empty state: no courses yet, with "Add your first course".

### 2. Course summary
- Course name and colour.
- Countdown to the next exam ("Exam in 12 days").
- Readiness: "2 of 7 topics exam-ready", plus a breakdown by status (To learn, Learning, Revise, Exam-ready).
- Focus time spent on this course this week (from Pluto's focus sessions).
- Count of linked open tasks and notes, with a way to jump to them (Exams, notes, tasks tab).

### 3. Exams (one course can have several: midterm, final, practical)
- Each exam: name, date and time, place or seat, format (for example "written, 3 hours, 5 long questions"), share of the grade, allowed items, free notes.
- Topics in this exam: pick which syllabus topics it covers. Readiness per exam is computed from those topics.
- Add, edit, delete exams.

### 4. Important dates
- Deadlines that are not exams: assignment, lab, quiz, project, other. Each has a title, date (optional time) and type.
- Shows "in N days". Past dates fade out or move away.
- Add, edit, delete. A date can also be a task, so it shows on Today and the pet can remind.

### 5. Syllabus: topics
- Ordered list of topics. For each topic:
  - name
  - **importance star** (likely to be asked in the exam)
  - **status**: To learn, Learning, Revise, Exam-ready (the student sets it)
  - progress: subtopics understood out of total
  - short notes: how many there are, and how many are written in the paper notebook
- Add topic, rename, delete (Undo), reorder (drag and keyboard).
- Filter or sort ideas, optional: starred only, not ready yet.
- Empty state: no topics, with "Add topics from your syllabus".

### 6. Inside one topic
- **Subtopics** (the parts of the topic): name and an "I understand this" tick. Add, rename, delete, reorder.
- **Short notes** (exam points), grouped under each subtopic:
  - one short line or two each (about 300 characters at most)
  - a "written in my notebook" marker per point
  - add, edit in place, delete, reorder; Enter adds the next point
- Empty states: topic with no subtopics, subtopic with no points.

### 7. Notes from ChatGPT (no AI inside Pluto)
1. Pluto shows a ready prompt with the topic and the course filled in. One button copies it.
2. The student pastes ChatGPT's answer into Pluto.
3. Pluto splits it into short points, which the student can edit or delete.
4. The student picks the subtopic to save them under, or a new one.

### 8. Write-out mode (copying notes into the paper notebook)
- Shows one point at a time in large text, with the topic, the subtopic and "point 3 of 9".
- Next and Back. "Written" marks the point and moves on.
- The point can be edited here, and a point or subtopic can be added.
- An outline of all points with their written state; jump to any point.
- Ends with a short summary. Closing keeps progress.

### 9. Notebook sheet
- Printable or save-as-PDF page for one topic or the whole course: headings, subtopics, numbered points.
- Two sizes: A4 with space to copy by hand, or a half-page revision card.

### 10. Next steps (computed hints, two or three at most)
- Starred topics that are not exam-ready yet.
- Topics whose notes are not written in the notebook yet.
- The next deadline.
- Kind wording only. Never "missed", "failed" or "behind".

## Rules the design must keep
- Everything stays on the computer. No accounts, no sync, no AI inside Pluto.
- Every delete has an Undo.
- Every action works with the keyboard. Visible focus. Respects reduced motion.
- Status is chosen by the student, never guessed by Pluto.
- Words the student sees: Topic, Subtopic, Short notes (points), Exam, Important dates.
- Connected assistants (Claude, Codex and others) may later add notes through Pluto's tools. The design does not need a screen for that.

## Out of scope for this page
Timetable; the Exams, notes, tasks tab; Friends (study group, needs a backend, on hold); per-class pet reminders (setting lives with the timetable); the routine tracker.

## Questions for the designer to answer
1. Is the course summary always visible, or only at the top?
2. Do exam facts and dates sit beside the syllabus, above it, or on their own view?
3. Is one topic opened in place, as a separate view, or side by side with the list?
4. Do short notes live with subtopics (current model) or as one list per topic?
5. How does the student see, at a glance, which topics are in which exam?
