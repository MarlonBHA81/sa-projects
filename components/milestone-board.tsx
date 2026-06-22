"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

export type MilestoneCard = {
  id: string;
  title: string;
  milestoneId: string | null; // null = no milestone column
  statusLabel: string;
  statusClass: string;
  href: string;
};
export type MilestoneColumn = { id: string; name: string; color: string | null };

type MoveAction = (
  projectId: string,
  taskId: string,
  milestoneId: string | null,
) => Promise<void>;

const NONE = "__none__";

// Milestone Kanban: dragging a task between milestone columns changes only the
// task's milestone (and order). It never changes a task status or a BRS gate,
// mirroring the planning board's lane-only moves.
export function MilestoneBoard({
  projectId,
  columns,
  cards,
  onMove,
}: {
  projectId: string;
  columns: MilestoneColumn[];
  cards: MilestoneCard[];
  onMove: MoveAction;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const col = String(event.over.id);
    const milestoneId = col === NONE ? null : col;
    const card = cards.find((c) => c.id === event.active.id);
    if (!card || card.milestoneId === milestoneId) return;
    startTransition(async () => {
      await onMove(projectId, card.id, milestoneId);
      router.refresh();
    });
  }

  const allColumns = [...columns, { id: NONE, name: "No milestone", color: null }];

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {allColumns.map((col) => (
          <Column
            key={col.id}
            column={col}
            cards={cards.filter((c) => (c.milestoneId ?? NONE) === col.id)}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({ column, cards }: { column: MilestoneColumn; cards: MilestoneCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div className="w-64 shrink-0">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="flex items-center gap-1 text-sm font-medium text-zinc-700">
          {column.color ? (
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} />
          ) : null}
          {column.name}
        </span>
        <span className="text-xs text-zinc-400">{cards.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-col gap-2 rounded-lg p-1 transition-colors ${
          isOver ? "bg-blue-50" : "bg-zinc-50/60"
        }`}
      >
        {cards.map((c) => (
          <CardItem key={c.id} card={c} />
        ))}
        {cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 p-3 text-xs text-zinc-300">Empty</div>
        ) : null}
      </div>
    </div>
  );
}

function CardItem({ card }: { card: MilestoneCard }) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id: card.id });
  const style: React.CSSProperties = {
    touchAction: "none",
    ...(transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : {}),
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm active:cursor-grabbing ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <div className="font-medium text-zinc-900">{card.title}</div>
      <div className="mt-1 flex items-center justify-between">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${card.statusClass}`}>
          {card.statusLabel}
        </span>
        <span onPointerDown={(e) => e.stopPropagation()}>
          <Link href={card.href} className="text-xs text-zinc-600 hover:text-zinc-900">
            Open
          </Link>
        </span>
      </div>
    </div>
  );
}
