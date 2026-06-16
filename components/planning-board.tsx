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
import type { PlanningLane } from "@prisma/client";

export type BoardCard = {
  dndId: string;
  kind: "deliverable" | "task";
  id: string;
  title: string;
  lane: PlanningLane;
  statusLabel: string;
  statusClass: string;
  meta: string;
  blockers: string[];
  href: string | null;
  sprintId: string | null;
};
export type BoardLane = { key: PlanningLane; label: string };
export type BoardSprint = { id: string; name: string };

type MoveAction = (kind: "deliverable" | "task", id: string, lane: PlanningLane) => Promise<void>;
type FormAction = (fd: FormData) => void | Promise<void>;

export function PlanningBoard({
  buildId,
  lanes,
  cards,
  sprints,
  onMove,
  assignSprint,
  deleteTask,
}: {
  buildId: string;
  lanes: BoardLane[];
  cards: BoardCard[];
  sprints: BoardSprint[];
  onMove: MoveAction;
  assignSprint: FormAction;
  deleteTask: FormAction;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const lane = event.over?.id as PlanningLane | undefined;
    if (!lane) return;
    const card = cards.find((c) => c.dndId === event.active.id);
    if (!card || card.lane === lane) return;
    startTransition(async () => {
      await onMove(card.kind, card.id, lane);
      router.refresh();
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {lanes.map((lane) => (
          <Lane key={lane.key} lane={lane} count={cards.filter((c) => c.lane === lane.key).length}>
            {cards
              .filter((c) => c.lane === lane.key)
              .map((c) => (
                <Card
                  key={c.dndId}
                  card={c}
                  buildId={buildId}
                  sprints={sprints}
                  assignSprint={assignSprint}
                  deleteTask={deleteTask}
                />
              ))}
          </Lane>
        ))}
      </div>
    </DndContext>
  );
}

function Lane({
  lane,
  count,
  children,
}: {
  lane: BoardLane;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.key });
  return (
    <div className="w-64 shrink-0">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700">{lane.label}</span>
        <span className="text-xs text-zinc-400">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-col gap-2 rounded-lg p-1 transition-colors ${isOver ? "bg-blue-50" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

function Card({
  card,
  buildId,
  sprints,
  assignSprint,
  deleteTask,
}: {
  card: BoardCard;
  buildId: string;
  sprints: BoardSprint[];
  assignSprint: FormAction;
  deleteTask: FormAction;
}) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id: card.dndId });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm ${isDragging ? "opacity-60" : ""}`}
    >
      <div {...listeners} {...attributes} className="cursor-grab touch-none font-medium text-zinc-900">
        {card.title}
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${card.statusClass}`}>
          {card.statusLabel}
        </span>
        <span className="text-zinc-500">{card.meta}</span>
      </div>
      {card.blockers.length ? (
        <div className="mt-1 text-xs text-orange-700">blocked by: {card.blockers.join(", ")}</div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {card.href ? (
          <Link href={card.href} className="text-xs text-zinc-600 hover:text-zinc-900">
            Open
          </Link>
        ) : null}
        <form action={assignSprint} className="flex items-center gap-1">
          <input type="hidden" name="buildId" value={buildId} />
          <input type="hidden" name="kind" value={card.kind} />
          <input type="hidden" name="id" value={card.id} />
          <select
            name="sprintId"
            defaultValue={card.sprintId ?? ""}
            className="rounded border border-zinc-300 px-1 py-0.5 text-xs"
          >
            <option value="">No sprint</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="text-xs text-zinc-500 hover:text-zinc-900">Set</button>
        </form>
        {card.kind === "task" ? (
          <form action={deleteTask}>
            <input type="hidden" name="buildId" value={buildId} />
            <input type="hidden" name="id" value={card.id} />
            <button className="text-xs text-red-600 hover:text-red-800">Delete</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
