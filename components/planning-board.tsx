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
import type { Department, PlanningLane } from "@prisma/client";

export type BoardCard = {
  dndId: string;
  kind: "deliverable" | "task";
  id: string;
  title: string;
  lane: PlanningLane;
  departmentKey: string; // Department or "GENERAL"
  departmentLabel: string;
  departmentClass: string;
  statusLabel: string;
  statusClass: string;
  meta: string;
  blockers: string[];
  href: string | null;
  sprintId: string | null;
};
export type BoardLane = { key: PlanningLane; label: string };
export type BoardRow = { key: string; label: string };
export type BoardSprint = { id: string; name: string };

type MoveAction = (
  kind: "deliverable" | "task",
  id: string,
  lane: PlanningLane,
  department: Department | null,
) => Promise<void>;
type FormAction = (fd: FormData) => void | Promise<void>;

const LANE_OPTIONS: { value: PlanningLane; label: string }[] = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "To do" },
  { value: "DOING", label: "Doing" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "DONE", label: "Done" },
];
const DEPT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "General" },
  { value: "STRATEGY", label: "Strategy" },
  { value: "COPY", label: "Copy" },
  { value: "DESIGN", label: "Design" },
  { value: "DEV", label: "Web dev" },
  { value: "SALES", label: "Sales" },
];

export function PlanningBoard({
  buildId,
  lanes,
  rows,
  cards,
  sprints,
  onMove,
  moveForm,
  assignSprint,
  deleteTask,
}: {
  buildId: string;
  lanes: BoardLane[];
  rows: BoardRow[];
  cards: BoardCard[];
  sprints: BoardSprint[];
  onMove: MoveAction;
  moveForm: FormAction;
  assignSprint: FormAction;
  deleteTask: FormAction;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const [rowKey, laneKey] = String(event.over.id).split(":");
    const card = cards.find((c) => c.dndId === event.active.id);
    if (!card || !rowKey || !laneKey) return;
    if (card.lane === laneKey && card.departmentKey === rowKey) return;
    const department = rowKey === "GENERAL" ? null : (rowKey as Department);
    startTransition(async () => {
      await onMove(card.kind, card.id, laneKey as PlanningLane, department);
      router.refresh();
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-4">
        {/* Lane headers */}
        <div className="flex gap-3 pl-32">
          {lanes.map((l) => (
            <div key={l.key} className="w-56 shrink-0 px-1 text-sm font-medium text-zinc-700">
              {l.label}
            </div>
          ))}
        </div>

        {rows.map((row) => (
          <div key={row.key} className="mt-2 flex gap-3">
            <div className="flex w-32 shrink-0 items-start pt-2">
              <span className="text-xs font-semibold text-zinc-600">{row.label}</span>
            </div>
            {lanes.map((lane) => (
              <Cell
                key={`${row.key}:${lane.key}`}
                rowKey={row.key}
                laneKey={lane.key}
                cards={cards.filter((c) => c.departmentKey === row.key && c.lane === lane.key)}
                buildId={buildId}
                sprints={sprints}
                moveForm={moveForm}
                assignSprint={assignSprint}
                deleteTask={deleteTask}
              />
            ))}
          </div>
        ))}
      </div>
    </DndContext>
  );
}

function Cell({
  rowKey,
  laneKey,
  cards,
  buildId,
  sprints,
  moveForm,
  assignSprint,
  deleteTask,
}: {
  rowKey: string;
  laneKey: string;
  cards: BoardCard[];
  buildId: string;
  sprints: BoardSprint[];
  moveForm: FormAction;
  assignSprint: FormAction;
  deleteTask: FormAction;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${rowKey}:${laneKey}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-20 w-56 shrink-0 flex-col gap-2 rounded-lg p-1 transition-colors ${
        isOver ? "bg-blue-50" : "bg-zinc-50/60"
      }`}
    >
      {cards.map((c) => (
        <Card
          key={c.dndId}
          card={c}
          buildId={buildId}
          sprints={sprints}
          moveForm={moveForm}
          assignSprint={assignSprint}
          deleteTask={deleteTask}
        />
      ))}
    </div>
  );
}

function Card({
  card,
  buildId,
  sprints,
  moveForm,
  assignSprint,
  deleteTask,
}: {
  card: BoardCard;
  buildId: string;
  sprints: BoardSprint[];
  moveForm: FormAction;
  assignSprint: FormAction;
  deleteTask: FormAction;
}) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id: card.dndId });
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
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${card.departmentClass}`}>
          {card.departmentLabel}
        </span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${card.statusClass}`}>
          {card.statusLabel}
        </span>
      </div>
      {card.meta ? <div className="mt-1 text-xs text-zinc-500">{card.meta}</div> : null}
      {card.blockers.length ? (
        <div className="mt-1 text-xs text-orange-700">blocked by: {card.blockers.join(", ")}</div>
      ) : null}
      {/* Controls: stop pointer events from starting a drag so they stay clickable. */}
      <div
        className="mt-2 flex flex-wrap items-center gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <form action={moveForm} className="flex items-center gap-1">
          <input type="hidden" name="buildId" value={buildId} />
          <input type="hidden" name="kind" value={card.kind} />
          <input type="hidden" name="id" value={card.id} />
          <select
            name="lane"
            defaultValue={card.lane}
            aria-label="Lane"
            className="rounded border border-zinc-300 px-1 py-0.5 text-xs"
          >
            {LANE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {card.kind === "task" ? (
            <select
              name="department"
              defaultValue={card.departmentKey === "GENERAL" ? "" : card.departmentKey}
              aria-label="Team"
              className="rounded border border-zinc-300 px-1 py-0.5 text-xs"
            >
              {DEPT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : null}
          <button className="text-xs text-zinc-600 hover:text-zinc-900">Move</button>
        </form>
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
