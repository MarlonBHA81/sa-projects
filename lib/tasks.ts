// Projects and tasks: the general tracker plus ad-hoc tasks on a build. These
// are free-form and never touch the BRS gate state machine. Planning lane and
// sprint are set here; the gated deliverables live separately.

import { prisma } from "./db";
import { AuthError, isAdmin, type SessionUser } from "./auth-helpers";
import { recordActivity } from "./activity";
import { softDelete } from "./soft-delete";
import type { Department, PlanningLane, TaskStatus } from "@prisma/client";

export class TaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskError";
  }
}

const taskOwnerInclude = {
  project: { select: { ownerId: true } },
} as const;

async function loadTask(id: string) {
  const task = await prisma.task.findFirst({
    where: { id, deletedAt: null },
    include: taskOwnerInclude,
  });
  if (!task) throw new TaskError("Task not found");
  return task;
}

/** Anyone may create, edit, and move tasks; delete is for the assignee, the project owner, or an admin. */
function canDeleteTask(
  actor: SessionUser,
  task: { assigneeId: string | null; project: { ownerId: string } | null },
): boolean {
  return isAdmin(actor) || task.assigneeId === actor.id || task.project?.ownerId === actor.id;
}

export async function createProject(
  input: { name: string; description?: string },
  actor: SessionUser,
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new TaskError("Add a project name");
  const project = await prisma.project.create({
    data: { name, description: input.description?.trim() || null, ownerId: actor.id },
  });
  await recordActivity({
    type: "PROJECT_CREATED",
    actorId: actor.id,
    entityType: "project",
    entityId: project.id,
    summary: `Created project ${name}`,
  });
  return project.id;
}

export type CreateTaskInput = {
  title: string;
  description?: string;
  projectId?: string | null;
  funnelBuildId?: string | null;
  sprintId?: string | null;
  assigneeId?: string | null;
  estimateMinutes?: number | null;
  dueDate?: Date | null;
  planningLane?: PlanningLane;
  department?: Department | null;
};

export async function createTask(input: CreateTaskInput, actor: SessionUser): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new TaskError("Add a task title");
  if (!input.projectId && !input.funnelBuildId) {
    throw new TaskError("A task needs a project or a build");
  }
  const last = await prisma.task.findFirst({
    where: {
      deletedAt: null,
      projectId: input.projectId ?? undefined,
      funnelBuildId: input.funnelBuildId ?? undefined,
    },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const task = await prisma.task.create({
    data: {
      title,
      description: input.description?.trim() || null,
      projectId: input.projectId ?? null,
      funnelBuildId: input.funnelBuildId ?? null,
      sprintId: input.sprintId ?? null,
      assigneeId: input.assigneeId ?? null,
      estimateMinutes: input.estimateMinutes ?? null,
      dueDate: input.dueDate ?? null,
      planningLane: input.planningLane ?? "TODO",
      department: input.department ?? null,
      order: (last?.order ?? -1) + 1,
    },
  });
  await recordActivity({
    type: "TASK_CREATED",
    actorId: actor.id,
    funnelBuildId: input.funnelBuildId ?? undefined,
    entityType: "task",
    entityId: task.id,
    summary: `Created task "${title}"`,
  });
  return task.id;
}

export async function updateTask(
  id: string,
  fields: {
    title?: string;
    description?: string | null;
    assigneeId?: string | null;
    estimateMinutes?: number | null;
    dueDate?: Date | null;
    status?: TaskStatus;
  },
  actor: SessionUser,
): Promise<void> {
  const task = await loadTask(id);
  await prisma.task.update({
    where: { id },
    data: {
      title: fields.title?.trim() || undefined,
      description: fields.description === undefined ? undefined : fields.description?.trim() || null,
      assigneeId: fields.assigneeId === undefined ? undefined : fields.assigneeId,
      estimateMinutes: fields.estimateMinutes === undefined ? undefined : fields.estimateMinutes,
      dueDate: fields.dueDate === undefined ? undefined : fields.dueDate,
      status: fields.status,
    },
  });
  await recordActivity({
    type: "TASK_UPDATED",
    actorId: actor.id,
    funnelBuildId: task.funnelBuildId ?? undefined,
    entityType: "task",
    entityId: id,
    summary: `Updated task "${task.title}"`,
  });
}

/** Move a card between planning lanes and/or sprints. Never touches gate status. */
export async function moveTask(
  id: string,
  change: {
    planningLane?: PlanningLane;
    sprintId?: string | null;
    status?: TaskStatus;
    department?: Department | null;
  },
  actor: SessionUser,
): Promise<void> {
  const task = await loadTask(id);
  await prisma.task.update({
    where: { id },
    data: {
      planningLane: change.planningLane,
      sprintId: change.sprintId === undefined ? undefined : change.sprintId,
      status: change.status,
      department: change.department === undefined ? undefined : change.department,
    },
  });
  await recordActivity({
    type: "TASK_MOVED",
    actorId: actor.id,
    funnelBuildId: task.funnelBuildId ?? undefined,
    entityType: "task",
    entityId: id,
    summary: `Moved task "${task.title}"${change.planningLane ? ` to ${change.planningLane}` : ""}`,
  });
}

export async function deleteTask(id: string, actor: SessionUser): Promise<void> {
  const task = await loadTask(id);
  if (!canDeleteTask(actor, task)) throw new AuthError("You can only delete your own tasks");
  await softDelete("task", id, actor);
}

export async function setTaskDependency(
  dependentId: string,
  prerequisiteId: string,
  actor: SessionUser,
): Promise<void> {
  if (dependentId === prerequisiteId) throw new TaskError("A task cannot depend on itself");
  await loadTask(dependentId);
  await loadTask(prerequisiteId);
  await prisma.taskDependency.upsert({
    where: { dependentId_prerequisiteId: { dependentId, prerequisiteId } },
    create: { dependentId, prerequisiteId },
    update: {},
  });
  await recordActivity({
    type: "TASK_UPDATED",
    actorId: actor.id,
    entityType: "task",
    entityId: dependentId,
    summary: "Added a task dependency",
  });
}

export async function removeTaskDependency(
  dependentId: string,
  prerequisiteId: string,
): Promise<void> {
  await prisma.taskDependency
    .delete({ where: { dependentId_prerequisiteId: { dependentId, prerequisiteId } } })
    .catch(() => {});
}
