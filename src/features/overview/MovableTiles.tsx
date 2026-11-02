import { useState, type ReactNode } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Maximize2, Minimize2, RotateCcw } from "lucide-react";
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

/** Two sizes only (owner 2026-10-27): the usual one, and the full width of the page. */
export type TileSize = "n" | "w";
const SIZE_KEY = ["prefs", "ui.overview_sizes"] as const;
const SIZE_NAME: Record<TileSize, string> = { n: "normal", w: "full width" };

/** Stored sizes, with anything unknown dropped. The old "large" is full width; small and medium are normal. */
export function cleanSizes(stored: unknown): Partial<Record<TileId, TileSize>> {
  const out: Partial<Record<TileId, TileSize>> = {};
  if (stored && typeof stored === "object") {
    for (const id of DEFAULT_ORDER) {
      const v = (stored as Record<string, unknown>)[id];
      if (v === "w" || v === "l") out[id] = "w";
      else if (v === "n" || v === "s" || v === "m") out[id] = "n";
    }
  }
  return out;
}

export function useTileSizes() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: SIZE_KEY, queryFn: async () => cleanSizes(await ipc.prefsGet("ui.overview_sizes")) });
  const sizes = data ?? {};
  const set = async (id: TileId, size: TileSize) => {
    const next = { ...sizes, [id]: size };
    qc.setQueryData(SIZE_KEY, next);
    await ipc.prefsSet("ui.overview_sizes", next);
  };
  const reset = async () => {
    qc.setQueryData(SIZE_KEY, {});
    await ipc.prefsSet("ui.overview_sizes", {});
  };
  return { sizes, set, reset };
}

/**
 * Tiles in rows, in your order: a full-width tile has a row to itself; a row with a big tile
 * (Today, Time) holds two, a row of small ones three. Tiles in a row share it equally, so a tile
 * moved beside Today takes half and Today the other half (owner 2026-11-02).
 */
export function packRows(order: TileId[], sizes: Partial<Record<TileId, TileSize>>): TileId[][] {
  const rows: TileId[][] = [];
  let row: TileId[] = [];
  for (const id of order) {
    if (sizes[id] === "w") {
      if (row.length) rows.push(row);
      rows.push([id]);
      row = [];
      continue;
    }
    const cap = row.some((x) => BIG.includes(x)) || BIG.includes(id) ? 2 : 3;
    if (row.length >= cap) {
      rows.push(row);
      row = [];
    }
    row.push(id);
  }
  if (row.length) rows.push(row);
  return rows;
}

/** `wide`: the tile can be made full width. Height always follows the content. */
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

function ResizeButton({ title, size, onChange }: { title: string; size: TileSize; onChange: (s: TileSize) => void }) {
  const next: TileSize = size === "n" ? "w" : "n";
  return (
    <button
      type="button" aria-label={`Resize ${title}: ${SIZE_NAME[size]}, make it ${SIZE_NAME[next]}`} title={`Size: ${SIZE_NAME[size]}. Click for ${SIZE_NAME[next]}.`}
      onClick={() => onChange(next)}
      className="hidden size-6 place-items-center rounded text-muted-foreground/60 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:grid"
    >
      {size === "w" ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
    </button>
  );
}

function SortableTile({ id, spec, size, onSize }: { id: TileId; spec: TileSpec; size: TileSize; onSize: (s: TileSize) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex min-h-60 min-w-0 flex-1 basis-0 flex-col [&>*]:flex-1", isDragging && "relative z-10 opacity-90 shadow-2xl ring-1 ring-primary/50")}
    >
      <TileHandleContext.Provider value={<div className="flex items-center gap-0.5">{spec.wide && <ResizeButton title={spec.title} size={size} onChange={onSize} />}<Handle title={spec.title} {...attributes} {...listeners} /></div>}>
        {spec.node}
      </TileHandleContext.Provider>
    </div>
  );
}

/** Overview tiles in rows that fit their content (see `packRows`). Drag a tile by its grip (or use the keyboard) to reorder; the order is remembered. */
export function MovableTiles({ tiles }: { tiles: Record<TileId, TileSpec> }) {
  const { order, save, isDefault } = useTileOrder();
  const sizes = useTileSizes();
  const resized = Object.values(sizes.sizes).some((v) => v === "w");
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
          <div className={cn("flex flex-col gap-5", active && "select-none")}>
            {packRows(order, sizes.sizes).map((row) => (
              <div key={row.join("|")} className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
                {row.map((id) => <SortableTile key={id} id={id} spec={tiles[id]} size={sizes.sizes[id] ?? "n"} onSize={(v) => void sizes.set(id, v)} />)}
              </div>
            ))}
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
