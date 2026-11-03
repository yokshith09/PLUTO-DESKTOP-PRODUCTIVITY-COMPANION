import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, Extension, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import HardBreak from "@tiptap/extension-hard-break";
import { Markdown } from "tiptap-markdown";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkCount } from "./format";

/**
 * U-1 (owner 2026-11-03): the note body as you see it. Boxes, headings and lists show while you
 * write, and a box is ticked where it is. The note is still stored as Markdown: the editor reads
 * it in and writes it out, and only writes when you change something, so opening an older note
 * never rewrites it.
 *
 * Ticked items go to the bottom of their list and hide under "Done (n)", like Google Keep.
 */
export type RichKind = "heading" | "bullet" | "number" | "check" | "bold" | "italic";
export interface RichHandle { run: (k: RichKind) => void; focus: () => void }

const SLASH: { kind: RichKind; label: string; hint: string }[] = [
  { kind: "check", label: "Checklist", hint: "[] " },
  { kind: "heading", label: "Heading", hint: "# " },
  { kind: "bullet", label: "Bullet list", hint: "- " },
  { kind: "number", label: "Numbered list", hint: "1. " },
];

function apply(editor: Editor, k: RichKind) {
  const c = editor.chain().focus();
  if (k === "bold") c.toggleBold().run();
  else if (k === "italic") c.toggleItalic().run();
  else if (k === "heading") c.toggleHeading({ level: 2 }).run();
  else if (k === "bullet") c.toggleBulletList().run();
  else if (k === "number") c.toggleOrderedList().run();
  else c.toggleTaskList().run();
}

const getMarkdown = (e: Editor): string => (e.storage as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();

/** Ticked items sink to the bottom of their list; an unticked one rises above the ticked ones. */
function sinkTicked(editor: Editor) {
  const { state } = editor;
  let tr = state.tr;
  let changed = false;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "taskList" || changed) return true;
    const kids: { node: typeof node; checked: boolean }[] = [];
    node.forEach((child) => kids.push({ node: child, checked: !!child.attrs.checked }));
    const order = [...kids.filter((k) => !k.checked), ...kids.filter((k) => k.checked)];
    if (order.every((k, i) => k === kids[i])) return false;
    tr = tr.replaceWith(pos + 1, pos + node.nodeSize - 1, order.map((k) => k.node));
    changed = true;
    return false;
  });
  if (changed) editor.view.dispatch(tr.setMeta("addToHistory", true));
  return changed;
}

/**
 * Notes are written one thing per line ("Oats\nPeanut butter"). In Markdown a single line break is
 * a space, which would run such a note into one line; here it stays a line break and is saved
 * back as a plain line break, so the note's text does not change.
 */
const LineBreak = HardBreak.extend({
  addStorage() {
    return { markdown: { serialize(state: { write: (s: string) => void }) { state.write("\n"); }, parse: {} } };
  },
});

/** Ctrl/Cmd+Enter ticks the checklist line you are on. */
const TickShortcut = Extension.create({
  name: "tickShortcut",
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => {
        const { $from } = this.editor.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          const n = $from.node(d);
          if (n.type.name === "taskItem") {
            const pos = $from.before(d);
            this.editor.view.dispatch(this.editor.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, checked: !n.attrs.checked }));
            return true;
          }
        }
        return false;
      },
    };
  },
});

export const RichBody = forwardRef<RichHandle, { value: string; onChange: (md: string) => void; className?: string }>(function RichBody({ value, onChange, className }, ref) {
  const [slash, setSlash] = useState<{ x: number; y: number; at: number; i: number } | null>(null);
  const [showDone, setShowDone] = useState(false);
  /** What the editor holds now, for the Done (n) count (the parent's value can lag a save). */
  const [md, setMd] = useState(value);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, hardBreak: false }),
      LineBreak,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Take a note…  Type / for a checklist, heading or list" }),
      Markdown.configure({ html: false, tightLists: true, transformPastedText: true, linkify: false, breaks: true }),
      TickShortcut,
    ],
    content: value,
    editorProps: { attributes: { "aria-label": "Note", "aria-multiline": "true", role: "textbox", spellcheck: "true", class: "outline-none" } },
    onUpdate: ({ editor: e, transaction }) => {
      if (transaction.getMeta("pluto-sink")) return;
      if (sinkTicked(e)) return; // the sink dispatches again and comes back here
      const next = getMarkdown(e);
      setMd(next);
      changeRef.current(next);
      // "/" just typed at the start of a line or after a space opens the insert menu.
      const { $from, empty } = e.state.selection;
      const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 2), $from.parentOffset);
      if (empty && (before === "/" || before.endsWith(" /"))) {
        const c = e.view.coordsAtPos($from.pos);
        const box = (e.view.dom as HTMLElement).getBoundingClientRect();
        setSlash({ x: c.left - box.left, y: c.bottom - box.top + 4, at: $from.pos, i: 0 });
      } else setSlash(null);
    },
  });

  // A note changed elsewhere (another window, an assistant) shows here unless you are typing.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (getMarkdown(editor) !== value) {
      editor.commands.setContent(value, false);
      setMd(value);
    }
  }, [editor, value]);

  useImperativeHandle(ref, () => ({ run: (k) => editor && apply(editor, k), focus: () => editor?.commands.focus("end") }), [editor]);

  const choose = (k: RichKind) => {
    if (!editor || !slash) return;
    editor.chain().focus().deleteRange({ from: slash.at - 1, to: slash.at }).run();
    apply(editor, k);
    setSlash(null);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!slash) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setSlash({ ...slash, i: (slash.i + (e.key === "ArrowDown" ? 1 : SLASH.length - 1)) % SLASH.length }); }
    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); choose((SLASH[slash.i] as (typeof SLASH)[number]).kind); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSlash(null); }
  };

  const { done } = checkCount(md);
  return (
    <div className={cn("relative", className)} onKeyDownCapture={onKeyDown}>
      <EditorContent editor={editor} className={cn("pluto-rich text-[15px] leading-relaxed", !showDone && "hide-done")} />
      {done > 0 && (
        <button type="button" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}
          className="mt-2 flex items-center gap-1 rounded text-[12px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRight className={cn("size-3.5 transition-transform", showDone && "rotate-90")} aria-hidden />Done ({done})
        </button>
      )}
      {slash && (
        <div role="menu" aria-label="Insert" className="absolute z-20 min-w-48 rounded-lg border bg-popover p-1 shadow-lg" style={{ left: slash.x, top: slash.y }}>
          {SLASH.map((s, i) => (
            <button key={s.kind} type="button" role="menuitem" onMouseDown={(e) => { e.preventDefault(); choose(s.kind); }}
              className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px]", i === slash.i && "bg-accent")}>
              {s.label}<span className="ml-auto font-mono text-[11px] text-muted-foreground">{s.hint.trim()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
