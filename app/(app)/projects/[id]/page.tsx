import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth-helpers";
import { Card, PageHeader } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import type { PlanningLane } from "@prisma/client";
import {
  createTaskAction,
  deleteProjectAction,
  deleteTaskAction,
  moveTaskAction,
  setDependencyAction,
} from "../actions";

const LANES: { key: PlanningLane; label: string }[] = [
  { key: "BACKLOG", label: "Backlog" },
  { key: "TODO", label: "To do" },
  { key: "DOING", label: "Doing" },
  { key: "BLOCKED", label: "Blocked" },
  { key: "DONE", label: "Done" },
];

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireUser();

  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: {
      owner: { select: { name: true } },
      tasks: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        include: {
          assignee: { select: { name: true } },
          dependsOn: { include: { prerequisite: { select: { title: true, deletedAt: true } } } },
        },
      },
    },
  });
  if (!project) notFound();

  const users = await prisma.user.findMany({
    where: { department: { not: null } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const field = "rounded-lg border border-zinc-300 px-2 py-1 text-sm";

  return (
    <div>
      <div className="mb-4 text-sm text-zinc-500">
        <Link href="/projects" className="hover:text-zinc-900">
          Projects
        </Link>
      </div>
      <PageHeader title={project.name} subtitle={project.description ?? `Owner: ${project.owner.name}`}>
        {isAdmin(user) || project.ownerId === user.id ? (
          <form action={deleteProjectAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <button className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
              Delete project
            </button>
          </form>
        ) : null}
      </PageHeader>
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="mb-6">
        <form action={createTaskAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="projectId" value={project.id} />
          <input name="title" required placeholder="New task" className={`flex-1 ${field}`} />
          <select name="planningLane" defaultValue="TODO" className={field}>
            {LANES.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
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
          <input name="estimateMinutes" type="number" min="0" placeholder="mins" className={`w-20 ${field}`} />
          <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            Add task
          </button>
        </form>
      </Card>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {LANES.map((lane) => {
          const tasks = project.tasks.filter((t) => t.planningLane === lane.key);
          return (
            <div key={lane.key} className="w-64 shrink-0">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700">{lane.label}</span>
                <span className="text-xs text-zinc-400">{tasks.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {tasks.map((t) => {
                  const blockers = t.dependsOn
                    .filter((d) => d.prerequisite.deletedAt === null)
                    .map((d) => d.prerequisite.title);
                  return (
                    <div key={t.id} className="rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm">
                      <div className="font-medium text-zinc-900">{t.title}</div>
                      <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                        <span>{t.assignee?.name ?? "Unassigned"}</span>
                        <span>{formatMinutes(t.estimateMinutes)}</span>
                      </div>
                      {blockers.length ? (
                        <div className="mt-1 text-xs text-orange-700">blocked by: {blockers.join(", ")}</div>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2">
                        <form action={moveTaskAction} className="flex items-center gap-1">
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="taskId" value={t.id} />
                          <select name="planningLane" defaultValue={t.planningLane} className="rounded border border-zinc-300 px-1 py-0.5 text-xs">
                            {LANES.map((l) => (
                              <option key={l.key} value={l.key}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                          <button className="text-xs text-zinc-500 hover:text-zinc-900">Move</button>
                        </form>
                        <form action={deleteTaskAction}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="taskId" value={t.id} />
                          <button className="text-xs text-red-600 hover:text-red-800">Delete</button>
                        </form>
                      </div>
                    </div>
                  );
                })}
                {tasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-200 p-3 text-xs text-zinc-300">Empty</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {project.tasks.length > 1 ? (
        <Card className="mt-6 max-w-xl">
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">Add a dependency</h3>
          <form action={setDependencyAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <select name="dependentId" required defaultValue="" className={field}>
              <option value="" disabled>
                Task…
              </option>
              {project.tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <span className="text-sm text-zinc-500">depends on</span>
            <select name="prerequisiteId" required defaultValue="" className={field}>
              <option value="" disabled>
                Task…
              </option>
              {project.tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Link
            </button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
