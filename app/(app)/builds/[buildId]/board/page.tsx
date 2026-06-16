import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { Card, PageHeader } from "@/components/ui";
import { formatHours } from "@/lib/format";
import {
  deliverableStatusClass,
  deliverableStatusLabel,
  departmentClass,
  departmentLabel,
  generalChipClass,
} from "@/lib/labels";
import { listSprints, sprintCapacity } from "@/lib/sprints";
import {
  PlanningBoard,
  type BoardCard,
  type BoardLane,
  type BoardRow,
} from "@/components/planning-board";
import {
  addTaskAction,
  assignCardSprintAction,
  createSprintAction,
  deleteBoardTaskAction,
  moveCardAction,
  moveCardFormAction,
} from "./actions";
import type { Department } from "@prisma/client";

const LANES: BoardLane[] = [
  { key: "BACKLOG", label: "Backlog" },
  { key: "TODO", label: "To do" },
  { key: "DOING", label: "Doing" },
  { key: "BLOCKED", label: "Blocked" },
  { key: "DONE", label: "Done" },
];
const DEPARTMENTS: Department[] = ["STRATEGY", "COPY", "DESIGN", "DEV", "SALES"];
const field = "rounded-lg border border-zinc-300 px-2 py-1 text-sm";

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildId: string }>;
  searchParams: Promise<{ dept?: string; sprint?: string; error?: string }>;
}) {
  const { buildId } = await params;
  const { dept, sprint, error } = await searchParams;
  await requireUser();
  const activeDept = DEPARTMENTS.includes(dept as Department) ? (dept as Department) : null;

  const build = await prisma.funnelBuild.findFirst({
    where: { id: buildId, deletedAt: null },
    select: { name: true },
  });
  if (!build) notFound();

  const sprints = await listSprints(buildId);
  const activeSprint = sprints.find((s) => s.id === sprint) ?? null;

  const deliverables = await prisma.deliverable.findMany({
    where: {
      funnelBuildId: buildId,
      deletedAt: null,
      ...(activeDept ? { department: activeDept } : {}),
      ...(activeSprint ? { sprintId: activeSprint.id } : {}),
    },
    orderBy: { order: "asc" },
    include: {
      assignee: { select: { name: true } },
      dependsOn: { include: { prerequisite: { select: { title: true, status: true, deletedAt: true } } } },
    },
  });

  const tasks = await prisma.task.findMany({
    where: {
      funnelBuildId: buildId,
      deletedAt: null,
      ...(activeSprint ? { sprintId: activeSprint.id } : {}),
    },
    orderBy: { order: "asc" },
    include: {
      assignee: { select: { name: true } },
      dependsOn: { include: { prerequisite: { select: { title: true, deletedAt: true } } } },
    },
  });

  const users = await prisma.user.findMany({
    where: { department: { not: null } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const cards: BoardCard[] = [
    ...deliverables.map((d) => ({
      dndId: `deliverable:${d.id}`,
      kind: "deliverable" as const,
      id: d.id,
      title: d.title,
      lane: d.planningLane,
      departmentKey: d.department,
      departmentLabel: departmentLabel[d.department],
      departmentClass: departmentClass[d.department],
      statusLabel: deliverableStatusLabel[d.status],
      statusClass: deliverableStatusClass[d.status],
      meta: d.assignee?.name ?? "Unassigned",
      blockers: d.dependsOn
        .filter((dep) => dep.prerequisite.deletedAt === null && dep.prerequisite.status !== "APPROVED")
        .map((dep) => dep.prerequisite.title),
      href: `/builds/${buildId}/deliverables/${d.id}`,
      sprintId: d.sprintId,
    })),
    ...tasks.map((t) => ({
      dndId: `task:${t.id}`,
      kind: "task" as const,
      id: t.id,
      title: t.title,
      lane: t.planningLane,
      departmentKey: t.department ?? "GENERAL",
      departmentLabel: t.department ? departmentLabel[t.department] : "General",
      departmentClass: t.department ? departmentClass[t.department] : generalChipClass,
      statusLabel: "Task",
      statusClass: "bg-zinc-100 text-zinc-600",
      meta: t.assignee?.name ?? "Unassigned",
      blockers: t.dependsOn
        .filter((dep) => dep.prerequisite.deletedAt === null)
        .map((dep) => dep.prerequisite.title),
      href: null,
      sprintId: t.sprintId,
    })),
  ];

  const visibleCards = activeDept ? cards.filter((c) => c.departmentKey === activeDept) : cards;
  const hasGeneral = visibleCards.some((c) => c.departmentKey === "GENERAL");
  const rows: BoardRow[] = activeDept
    ? [{ key: activeDept, label: departmentLabel[activeDept] }]
    : [
        ...DEPARTMENTS.map((d) => ({ key: d as string, label: departmentLabel[d] })),
        ...(hasGeneral ? [{ key: "GENERAL", label: "General" }] : []),
      ];

  const capacity = activeSprint ? await sprintCapacity(activeSprint.id) : [];
  const tab = (active: boolean) =>
    `rounded-lg px-3 py-1 text-sm ${active ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`;
  const q = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (next.dept ?? activeDept) sp.set("dept", next.dept ?? activeDept ?? "");
    if (next.sprint ?? activeSprint?.id) sp.set("sprint", next.sprint ?? activeSprint?.id ?? "");
    const s = sp.toString();
    return `/builds/${buildId}/board${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <div className="mb-4 text-sm text-zinc-500">
        <Link href={`/builds/${buildId}`} className="hover:text-zinc-900">
          {build.name}
        </Link>
      </div>
      <PageHeader title="Board" subtitle="Drag cards between lanes. Lanes are for planning; they never change a gate." />

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {/* Department filter */}
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href={q({ dept: "" })} className={tab(!activeDept)}>
          All teams
        </Link>
        {DEPARTMENTS.map((d) => (
          <Link key={d} href={q({ dept: d })} className={tab(activeDept === d)}>
            {departmentLabel[d]}
          </Link>
        ))}
      </div>

      {/* Sprint filter + create */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={q({ sprint: "" })} className={tab(!activeSprint)}>
          All work
        </Link>
        {sprints.map((s) => (
          <Link key={s.id} href={q({ sprint: s.id })} className={tab(activeSprint?.id === s.id)}>
            {s.name}
          </Link>
        ))}
        <form action={createSprintAction} className="flex items-center gap-1">
          <input type="hidden" name="buildId" value={buildId} />
          <input name="name" placeholder="New sprint" className={field} />
          <button className="text-sm text-zinc-600 hover:text-zinc-900">Add sprint</button>
        </form>
      </div>

      {activeSprint && capacity.length ? (
        <Card className="mb-5">
          <div className="text-xs font-semibold text-zinc-500">{activeSprint.name} capacity</div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-zinc-700">
            {capacity.map((c) => (
              <span key={c.name}>
                {c.name}: {formatHours(c.committedMinutes)}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Add ad-hoc task */}
      <Card className="mb-5">
        <form action={addTaskAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="buildId" value={buildId} />
          <input name="title" required placeholder="New ad-hoc task" className={`flex-1 ${field}`} />
          <select name="planningLane" defaultValue="TODO" className={field}>
            {LANES.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
          <select name="department" defaultValue={activeDept ?? ""} className={field}>
            <option value="">General</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {departmentLabel[d]}
              </option>
            ))}
          </select>
          <select name="assigneeId" defaultValue="" className={field}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          {activeSprint ? <input type="hidden" name="sprintId" value={activeSprint.id} /> : null}
          <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            Add task
          </button>
        </form>
      </Card>

      <PlanningBoard
        buildId={buildId}
        lanes={LANES}
        rows={rows}
        cards={visibleCards}
        sprints={sprints.map((s) => ({ id: s.id, name: s.name }))}
        onMove={moveCardAction.bind(null, buildId)}
        moveForm={moveCardFormAction}
        assignSprint={assignCardSprintAction}
        deleteTask={deleteBoardTaskAction}
      />
    </div>
  );
}
