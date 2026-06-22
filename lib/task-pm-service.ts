// Perfex-style task service for project tasks: the 5-status board, priority,
// dates, billable/rate, multiple assignees, followers, checklist items and
// comments. Status changes here are the Perfex task board state and never a BRS
// gate. Moving a task on the milestone Kanban only changes milestone/order.

import { prisma } from "./db";
import { AuthError, isAdmin, type SessionUser } from "./auth-helpers";
import { softDelete, notDeleted } from "./soft-delete";
import { recordProjectActivity } from "./project-service";
import { recomputeProjectProgress } from "./project-service";
import { taskFieldsLocked } from "./projects-pm";
import type { TaskPriority, TaskStatus } from "@prisma/client";

export class TaskPmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskPmError";
  }
}

async function loadTask(id: string) {
  const task = await prisma.task.findFirst({
    where: { id, ...notDeleted },
    select: {
      id: true,
      title: true,
      projectId: true,
      assigneeId: true,
      billed: true,
      status: true,
      milestoneId: true,
    },
  });
  if (!task) throw new TaskPmError("Task not found");
  return task;
}

/** Re-sync the parent project's auto progress after a task status change. */
async function syncProgress(projectId: string | null): Promise<void> {
  if (projectId) await recomputeProjectProgress(projectId);
}

async function logTaskActivity(
  projectId: string | null,
  actorId: string,
  type: Parameters<typeof recordProjectActivity>[0]["type"],
  summary: string,
  taskId: string,
): Promise<void> {
  if (projectId) {
    await recordProjectActivity({
      projectId,
      actorId,
      type,
      summary,
      entityType: "task",
      entityId: taskId,
    });
  }
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

export type CreateProjectTaskInput = {
  projectId: string;
  title: string;
  description?: string | null;
  milestoneId?: string | null;
  priority?: TaskPriority | null;
  status?: TaskStatus;
  startDate?: Date | null;
  dueDate?: Date | null;
  hourlyRate?: number | null;
  billable?: boolean;
  estimateMinutes?: number | null;
  visibleToClient?: boolean;
  assigneeIds?: string[];
};

export async function createProjectTask(
  input: CreateProjectTaskInput,
  actor: SessionUser,
): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new TaskPmError("Add a task title");

  const [lastKanban, lastMilestone, lastOrder] = await Promise.all([
    prisma.task.findFirst({
      where: { projectId: input.projectId, status: input.status ?? "NOT_STARTED", ...notDeleted },
      orderBy: { kanbanOrder: "desc" },
      select: { kanbanOrder: true },
    }),
    input.milestoneId
      ? prisma.task.findFirst({
          where: { milestoneId: input.milestoneId, ...notDeleted },
          orderBy: { milestoneOrder: "desc" },
          select: { milestoneOrder: true },
        })
      : Promise.resolve(null),
    prisma.task.findFirst({
      where: { projectId: input.projectId, ...notDeleted },
      orderBy: { order: "desc" },
      select: { order: true },
    }),
  ]);

  const task = await prisma.task.create({
    data: {
      title,
      description: input.description?.trim() || null,
      projectId: input.projectId,
      milestoneId: input.milestoneId || null,
      priority: input.priority ?? null,
      status: input.status ?? "NOT_STARTED",
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      hourlyRate: input.hourlyRate ?? 0,
      billable: input.billable ?? false,
      estimateMinutes: input.estimateMinutes ?? null,
      visibleToClient: input.visibleToClient ?? false,
      // First assignee also fills the legacy single-assignee field (board/workload).
      assigneeId: input.assigneeIds?.[0] ?? null,
      order: (lastOrder?.order ?? -1) + 1,
      kanbanOrder: (lastKanban?.kanbanOrder ?? -1) + 1,
      milestoneOrder: (lastMilestone?.milestoneOrder ?? -1) + 1,
      assignees: input.assigneeIds?.length
        ? { create: input.assigneeIds.map((userId) => ({ userId })) }
        : undefined,
    },
  });

  await logTaskActivity(input.projectId, actor.id, "TASK_CREATED", `Created task "${title}"`, task.id);
  await syncProgress(input.projectId);
  return task.id;
}

export type UpdateProjectTaskFields = {
  title?: string;
  description?: string | null;
  milestoneId?: string | null;
  priority?: TaskPriority | null;
  status?: TaskStatus;
  startDate?: Date | null;
  dueDate?: Date | null;
  hourlyRate?: number | null;
  billable?: boolean;
  estimateMinutes?: number | null;
  visibleToClient?: boolean;
};

export async function updateProjectTask(
  id: string,
  fields: UpdateProjectTaskFields,
  actor: SessionUser,
): Promise<void> {
  const task = await loadTask(id);

  // Once billed, a task is locked Complete and its rate/billable cannot change.
  if (taskFieldsLocked(task) && (fields.hourlyRate !== undefined || fields.billable !== undefined)) {
    throw new TaskPmError("This task has been billed and is locked");
  }

  const becomingComplete = fields.status === "COMPLETE" && task.status !== "COMPLETE";
  const leavingComplete = fields.status && fields.status !== "COMPLETE" && task.status === "COMPLETE";

  await prisma.task.update({
    where: { id },
    data: {
      title: fields.title?.trim() || undefined,
      description:
        fields.description === undefined ? undefined : fields.description?.trim() || null,
      milestoneId: fields.milestoneId === undefined ? undefined : fields.milestoneId || null,
      priority: fields.priority === undefined ? undefined : fields.priority,
      status: fields.status,
      startDate: fields.startDate === undefined ? undefined : fields.startDate,
      dueDate: fields.dueDate === undefined ? undefined : fields.dueDate,
      hourlyRate: fields.hourlyRate === undefined ? undefined : (fields.hourlyRate ?? 0),
      billable: fields.billable,
      estimateMinutes: fields.estimateMinutes === undefined ? undefined : fields.estimateMinutes,
      visibleToClient: fields.visibleToClient,
      dateFinished: becomingComplete ? new Date() : leavingComplete ? null : undefined,
    },
  });

  await logTaskActivity(task.projectId, actor.id, "TASK_UPDATED", `Updated task "${task.title}"`, id);
  if (fields.status !== undefined) await syncProgress(task.projectId);
}

/** Move a task on the status Kanban: set status + position within the column. */
export async function setTaskStatus(
  id: string,
  status: TaskStatus,
  kanbanOrder: number | undefined,
  actor: SessionUser,
): Promise<void> {
  const task = await loadTask(id);
  const becomingComplete = status === "COMPLETE" && task.status !== "COMPLETE";
  const leavingComplete = status !== "COMPLETE" && task.status === "COMPLETE";
  await prisma.task.update({
    where: { id },
    data: {
      status,
      kanbanOrder: kanbanOrder ?? undefined,
      dateFinished: becomingComplete ? new Date() : leavingComplete ? null : undefined,
    },
  });
  await logTaskActivity(task.projectId, actor.id, "TASK_MOVED", `Moved "${task.title}" to ${status}`, id);
  await syncProgress(task.projectId);
}

/** Move a task on the milestone Kanban: change milestone + order only. Never a status. */
export async function setTaskMilestone(
  id: string,
  milestoneId: string | null,
  milestoneOrder: number | undefined,
  actor: SessionUser,
): Promise<void> {
  const task = await loadTask(id);
  await prisma.task.update({
    where: { id },
    data: { milestoneId, milestoneOrder: milestoneOrder ?? undefined },
  });
  await logTaskActivity(
    task.projectId,
    actor.id,
    "MILESTONE_MOVED",
    milestoneId ? `Moved "${task.title}" to a milestone` : `Removed "${task.title}" from its milestone`,
    id,
  );
}

export async function deleteProjectTask(id: string, actor: SessionUser): Promise<void> {
  const task = await loadTask(id);
  if (!isAdmin(actor) && task.assigneeId !== actor.id) {
    // Owners can also delete; check the project owner.
    const project = task.projectId
      ? await prisma.project.findUnique({ where: { id: task.projectId }, select: { ownerId: true } })
      : null;
    if (project?.ownerId !== actor.id) {
      throw new AuthError("You can only delete tasks you own");
    }
  }
  await softDelete("task", id, actor);
  await syncProgress(task.projectId);
}

/** Bill a task: lock it, mark Complete, stamp dateFinished. */
export async function billTask(id: string, actor: SessionUser): Promise<void> {
  if (!isAdmin(actor)) throw new AuthError("Only an approver can bill a task");
  const task = await loadTask(id);
  if (task.billed) return;
  await prisma.task.update({
    where: { id },
    data: { billed: true, status: "COMPLETE", dateFinished: new Date() },
  });
  await logTaskActivity(task.projectId, actor.id, "TASK_BILLED", `Billed task "${task.title}"`, id);
  await syncProgress(task.projectId);
}

// ---------------------------------------------------------------------------
// Assignees / followers
// ---------------------------------------------------------------------------

export async function setTaskAssignees(
  id: string,
  userIds: string[],
  actor: SessionUser,
): Promise<void> {
  const task = await loadTask(id);
  await prisma.$transaction(async (tx) => {
    await tx.taskAssignee.deleteMany({ where: { taskId: id } });
    if (userIds.length) {
      await tx.taskAssignee.createMany({
        data: userIds.map((userId) => ({ taskId: id, userId })),
        skipDuplicates: true,
      });
    }
    // Keep the legacy single-assignee field aligned (board, sprints, workload).
    await tx.task.update({ where: { id }, data: { assigneeId: userIds[0] ?? null } });
  });
  await logTaskActivity(task.projectId, actor.id, "TASK_ASSIGNED", `Reassigned "${task.title}"`, id);
}

export async function addTaskFollower(
  id: string,
  userId: string,
  actor: SessionUser,
): Promise<void> {
  await loadTask(id);
  await prisma.taskFollower.upsert({
    where: { taskId_userId: { taskId: id, userId } },
    create: { taskId: id, userId },
    update: {},
  });
  void actor;
}

export async function removeTaskFollower(id: string, userId: string): Promise<void> {
  await prisma.taskFollower
    .delete({ where: { taskId_userId: { taskId: id, userId } } })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export async function addChecklistItem(
  taskId: string,
  description: string,
  actor: SessionUser,
): Promise<void> {
  const text = description.trim();
  if (!text) throw new TaskPmError("Add a checklist item");
  const task = await loadTask(taskId);
  const last = await prisma.taskChecklistItem.findFirst({
    where: { taskId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  await prisma.taskChecklistItem.create({
    data: { taskId, description: text, order: (last?.order ?? -1) + 1 },
  });
  await logTaskActivity(task.projectId, actor.id, "CHECKLIST_ITEM_ADDED", "Added a checklist item", taskId);
}

export async function toggleChecklistItem(
  itemId: string,
  finished: boolean,
  actor: SessionUser,
): Promise<void> {
  const item = await prisma.taskChecklistItem.findUnique({
    where: { id: itemId },
    select: { taskId: true, task: { select: { projectId: true } } },
  });
  if (!item) throw new TaskPmError("Checklist item not found");
  await prisma.taskChecklistItem.update({
    where: { id: itemId },
    data: {
      finished,
      finishedAt: finished ? new Date() : null,
      finishedById: finished ? actor.id : null,
    },
  });
  await logTaskActivity(
    item.task.projectId,
    actor.id,
    "CHECKLIST_ITEM_TOGGLED",
    finished ? "Ticked a checklist item" : "Unticked a checklist item",
    item.taskId,
  );
}

export async function deleteChecklistItem(itemId: string): Promise<void> {
  await prisma.taskChecklistItem.delete({ where: { id: itemId } }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addTaskComment(
  taskId: string,
  content: string,
  actor: SessionUser,
): Promise<void> {
  const text = content.trim();
  if (!text) throw new TaskPmError("Write a comment first");
  const task = await loadTask(taskId);
  await prisma.taskComment.create({ data: { taskId, authorId: actor.id, content: text } });
  await logTaskActivity(task.projectId, actor.id, "TASK_COMMENTED", `Commented on "${task.title}"`, taskId);
}
