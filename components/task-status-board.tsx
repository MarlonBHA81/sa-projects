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
import type { TaskStatus } from "@prisma/client";

export type StatusCard = {
  id: string;
  title: string;
  status: TaskStatus;
  priorityLabel: string | null;
  priorityClass: string;
  assignee: string;
  href: string;
};
export type StatusColumn = { key: TaskStatus; label: string };

type MoveAction = (projectId: string, taskId: string, status: TaskStatus) => Promise<void>;

// The Perfex task Kanban. Dragging a card sets the task status + kanban order; it
// is the project task board state and never a BRS gate.
export function TaskStatusBoard({
  projectId,
  columns,
  cards,
  onMove,
}: {
  projectId: string;
  columns: StatusColumn[];
  cards: StatusCard[];
  onMove: MoveAction;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const status = String(event.over.id) as TaskStatus;
    const card = cards.find((c) => c.id === event.active.id);
    if (!card || card.status === status) return;
    startTransition(async () => {
      await onMove(projectId, card.id, status);
      router.refresh();
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => (
          <Column key={col.key} column={col} cards={cards.filter((c) => c.status === col.key)} />
        ))}
      </div>
    </DndContext>
  );
}

function Column({ column, cards }: { column: StatusColumn; cards: StatusCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  return (
    <div className="w-64 shrink-0">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-sm font-medium text-zinc-700">{column.label}</span>
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

function CardItem({ card }: { card: StatusCard }) {
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
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {card.priorityLabel ? (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${card.priorityClass}`}>
            {card.priorityLabel}
          </span>
        ) : null}
        <span className="text-xs text-zinc-500">{card.assignee}</span>
      </div>
      <div className="mt-2" onPointerDown={(e) => e.stopPropagation()}>
        <Link href={card.href} className="text-xs text-zinc-600 hover:text-zinc-900">
          Open
        </Link>
      </div>
    </div>
  );
}
