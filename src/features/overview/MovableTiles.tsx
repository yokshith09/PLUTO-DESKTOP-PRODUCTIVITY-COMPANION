import { useRef, useState, type ReactNode } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCcw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { TileHandleContext } from "@/features/shell/TileHandle";
import { ipc } from "@/ipc";
import { cn } from "@/lib/utils";

export type TileId = "agenda" | "focus" | "routine" | "time" | "links";
/** Today and Time side by side, then the three small tiles (owner 2026-11-02). */
export const DEFAULT_ORDER: TileId[] = ["agenda", "time", "focus", "routine", "links"];
/** The order before 2026-11-02; stored as-is it means "never moved", so it becomes the new default. */
const OLD_DEFAULT: TileId[] = ["agenda", "focus", "routine", "time", "links"];
/** The big tiles: a row with one holds two tiles, a row of small ones holds three. */
const BIG: TileId[] = ["agenda", "time"];
const KEY = ["prefs", "ui.overview_order"] as const;

/** Stored order, with anything unknown dropped and anything missing put back at the end. */
export function cleanOrder(stored: unknown): TileId[] {
  const known = Array.isArray(stored) ? stored.filter((x): x is TileId => DEFAULT_ORDER.includes(x as TileId)) : [];
  const unique = [...new Set(known)];
  if (unique.length === OLD_DEFAULT.length && unique.every((id, i) => id === OLD_DEFAULT[i])) return DEFAULT_ORDER;
  return [...unique, ...DEFAULT_ORDER.filter((id) => !unique.includes(id))];
}

export function useTileOrder() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => cleanOrder(await ipc.prefsGet("ui.overview_order")) });
  const order = data ?? DEFAULT_ORDER;
  const save = async (next: TileId[]) => {
    qc.setQueryData(KEY, next);
    await ipc.prefsSet("ui.overview_order", next);
  };
  return { order, save, isDefault: order.every((id, i) => id === DEFAULT_ORDER[i]) };
}

/**
 * Free size (U-5, owner 2026-11-04): a tile is 3 to 12 of the page's 12 columns wide and, if you set
 * it, 1 to 4 rows tall (a minimum: content still grows it). It snaps while you drag its corner.
 */
export interface TileSize { c: number; r?: number }
export const MIN_COLS = 3;
export const MAX_COLS = 12;
export const MAX_ROWS = 4;
const SIZE_KEY = ["prefs", "ui.overview_sizes"] as const;
const ROW_REM = 7;
const GAP_REM = 1.25;

/** Where a tile starts: Today and Time take half the page each, the small ones a third. */
export const defaultCols = (id: TileId): number => (BIG.includes(id) ? 6 : 4);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
export const snap = (s: TileSize): TileSize => (s.r === undefined ? { c: clamp(s.c, MIN_COLS, MAX_COLS) } : { c: clamp(s.c, MIN_COLS, MAX_COLS), r: clamp(s.r, 1, MAX_ROWS) });
const rowsRem = (r: number) => r * ROW_REM + (r - 1) * GAP_REM;

/**
 * Stored sizes, with anything unknown dropped. Before U-5 a size was "n" (normal) or "w" (full width):
 * full width stays 12 columns, normal goes back to the tile's usual width (so it is simply dropped).
 */
export function cleanSizes(stored: unknown): Partial<Record<TileId, TileSize>> {
  const out: Partial<Record<TileId, TileSize>> = {};
  if (stored && typeof stored === "object") {
    for (const id of DEFAULT_ORDER) {
      const v = (stored as Record<string, unknown>)[id];
      if (v === "w" || v === "l") out[id] = { c: MAX_COLS };
      else if (v && typeof v === "object") {
        const { c, r } = v as { c?: unknown; r?: unknown };
        if (typeof c === "number" && Number.isFinite(c)) out[id] = snap(typeof r === "number" && Number.isFinite(r) ? { c, r } : { c });
      }
    }
  }
  return out;
}

export function useTileSizes() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: SIZE_KEY, queryFn: async () => cleanSizes(await ipc.prefsGet("ui.overview_sizes")) });
  const sizes = data ?? {};
  const set = async (id: TileId, size: TileSize) => {
    const next = { ...sizes, [id]: snap(size) };
    qc.setQueryData(SIZE_KEY, next);
    await ipc.prefsSet("ui.overview_sizes", next);
  };
  const reset = async () => {
    qc.setQueryData(SIZE_KEY, {});
    await ipc.prefsSet("ui.overview_sizes", {});
  };
  return { sizes, set, reset };
}

/** `wide`: the tile can be resized. Height follows the content unless you set rows. */
interface TileSpec { wide?: boolean; title: string; node: ReactNode }

function Handle({ title, ...props }: { title: string } & Record<string, unknown>) {
  return (
    <button
      type="button" aria-label={`Move ${title}`} title="Drag to move (or focus and press Space, then the arrow keys)"
      {...props}
      className="grid size-6 cursor-grab touch-none place-items-center rounded text-muted-foreground/60 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  );
}

/** The corner grip: drag to resize (snaps to columns and rows), or focus it and use the arrow keys. */
function ResizeGrip({ title, size, box, onDraft, onCommit }: {
  title: string; size: TileSize; box: React.RefObject<HTMLDivElement | null>; onDraft: (s: TileSize | null) => void; onCommit: (s: TileSize) => void;
}) {
  const start = useRef<{ x: number; y: number; w: number; h: number; colW: number; rowH: number; last: TileSize } | null>(null);
  const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const rows = size.r;
  const label = `Resize ${title}: ${size.c} of 12 columns${rows ? `, ${rows} ${rows === 1 ? "row" : "rows"}` : ""}. Drag, or use the arrow keys.`;
  return (
    <span
      role="button" tabIndex={0} aria-label={label} title="Drag to resize (or focus and use the arrow keys)"
      onPointerDown={(e) => {
        const el = box.current;
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const grid = el.parentElement?.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const px = rootPx();
        start.current = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, colW: ((grid?.width ?? r.width * 2) + GAP_REM * px) / 12, rowH: (ROW_REM + GAP_REM) * px, last: size };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        const gap = GAP_REM * rootPx();
        const next = snap({ c: (s.w + (e.clientX - s.x) + gap) / s.colW, r: (s.h + (e.clientY - s.y) + gap) / s.rowH });
        s.last = next;
        onDraft(next);
      }}
      onPointerUp={() => { const s = start.current; start.current = null; onDraft(null); if (s) onCommit(s.last); }}
      onPointerCancel={() => { start.current = null; onDraft(null); }}
      onKeyDown={(e) => {
        const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const step = d[e.key];
        if (!step) return;
        e.preventDefault();
        onCommit(snap(step[1] || size.r ? { c: size.c + step[0], r: (size.r ?? 2) + step[1] } : { c: size.c + step[0] }));
      }}
      className="absolute bottom-1 right-1 z-10 hidden size-6 cursor-nwse-resize touch-none place-items-center rounded text-muted-foreground/60 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:grid"
    >
      <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 4 4 10M10 8l-2 2" /></svg>
    </span>
  );
}

function SortableTile({ id, spec, size, onSize }: { id: TileId; spec: TileSpec; size: TileSize; onSize: (s: TileSize) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const box = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<TileSize | null>(null);
  const shown = draft ?? size;
  return (
    <div
      ref={(el) => { box.current = el; setNodeRef(el); }}
      data-cols={shown.c}
      style={{ transform: CSS.Transform.toString(transform), transition, "--c": shown.c, ...(shown.r ? { "--h": `${rowsRem(shown.r)}rem` } : {}) } as React.CSSProperties}
      className={cn("relative flex min-h-60 min-w-0 flex-col lg:[grid-column:span_var(--c)] lg:min-h-[var(--h,15rem)] [&>*]:flex-1", isDragging && "z-10 opacity-90 shadow-2xl ring-1 ring-primary/50")}
    >
      <TileHandleContext.Provider value={<div className="flex items-center gap-0.5"><Handle title={spec.title} {...attributes} {...listeners} /></div>}>
        {spec.node}
      </TileHandleContext.Provider>
      {spec.wide && <ResizeGrip title={spec.title} size={shown} box={box} onDraft={setDraft} onCommit={onSize} />}
    </div>
  );
}

/** Overview tiles on a 12-column grid, in your order, each as wide and tall as you set it. Drag a tile by its grip (or use the keyboard) to reorder; the order is remembered. */
export function MovableTiles({ tiles }: { tiles: Record<TileId, TileSpec> }) {
  const { order, save, isDefault } = useTileOrder();
  const sizes = useTileSizes();
  const resized = Object.keys(sizes.sizes).length > 0;
  const [active, setActive] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onEnd = (e: DragEndEvent) => {
    setActive(false);
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    void save(arrayMove(order, order.indexOf(a.id as TileId), order.indexOf(over.id as TileId)));
  };
  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => setActive(true)} onDragCancel={() => setActive(false)} onDragEnd={onEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className={cn("grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch", active && "select-none")}>
            {order.map((id) => <SortableTile key={id} id={id} spec={tiles[id]} size={sizes.sizes[id] ?? { c: defaultCols(id) }} onSize={(v) => void sizes.set(id, v)} />)}
          </div>
        </SortableContext>
      </DndContext>
      {(!isDefault || resized) && (
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => void Promise.all([save(DEFAULT_ORDER), sizes.reset()])}><RotateCcw />Reset layout</Button>
        </div>
      )}
    </div>
  );
}
