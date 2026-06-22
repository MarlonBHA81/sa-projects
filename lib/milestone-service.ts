// Milestone service. Milestones belong to a project; tasks attach via the
// task's milestone FK. The milestone Kanban drag only changes a task's
// milestone/milestoneOrder (mirrors the planning board's lane-only moves) and
// never a task status or a BRS gate.

import { prisma } from "./db";
import { type SessionUser } from "./auth-helpers";
import { softDelete, notDeleted } from "./soft-delete";
import { recordProjectActivity } from "./project-service";
import { progressFromTasks, countCompleted } from "./projects-pm";

export class MilestoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MilestoneError";
  }
}

export type CreateMilestoneInput = {
  projectId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  startDate?: Date | null;
  dueDate?: Date | null;
};

export async function createMilestone(
  input: CreateMilestoneInput,
  actor: SessionUser,
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new MilestoneError("Add a milestone name");
  const last = await prisma.milestone.findFirst({
    where: { projectId: input.projectId, ...notDeleted },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const milestone = await prisma.milestone.create({
    data: {
      projectId: input.projectId,
      name,
      description: input.description?.trim() || null,
      color: input.color?.trim() || null,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      order: (last?.order ?? -1) + 1,
    },
  });
  await recordProjectActivity({
    projectId: input.projectId,
    actorId: actor.id,
    type: "MILESTONE_CREATED",
    summary: `Created milestone "${name}"`,
    entityType: "milestone",
    entityId: milestone.id,
  });
  return milestone.id;
}

export async function updateMilestone(
  id: string,
  fields: {
    name?: string;
    description?: string | null;
    color?: string | null;
    startDate?: Date | null;
    dueDate?: Date | null;
    order?: number;
    descriptionVisibleToCustomer?: boolean;
    hideFromCustomer?: boolean;
  },
  actor: SessionUser,
): Promise<void> {
  const milestone = await prisma.milestone.findFirst({
    where: { id, ...notDeleted },
    select: { projectId: true, name: true },
  });
  if (!milestone) throw new MilestoneError("Milestone not found");
  await prisma.milestone.update({
    where: { id },
    data: {
      name: fields.name?.trim() || undefined,
      description:
        fields.description === undefined ? undefined : fields.description?.trim() || null,
      color: fields.color === undefined ? undefined : fields.color?.trim() || null,
      startDate: fields.startDate === undefined ? undefined : fields.startDate,
      dueDate: fields.dueDate === undefined ? undefined : fields.dueDate,
      order: fields.order,
      descriptionVisibleToCustomer: fields.descriptionVisibleToCustomer,
      hideFromCustomer: fields.hideFromCustomer,
    },
  });
  await recordProjectActivity({
    projectId: milestone.projectId,
    actorId: actor.id,
    type: "MILESTONE_UPDATED",
    summary: `Updated milestone "${milestone.name}"`,
    entityType: "milestone",
    entityId: id,
  });
}

export async function deleteMilestone(id: string, actor: SessionUser): Promise<void> {
  const milestone = await prisma.milestone.findFirst({
    where: { id, ...notDeleted },
    select: { projectId: true },
  });
  if (!milestone) throw new MilestoneError("Milestone not found");
  // Detach tasks first so they are not orphaned under a deleted milestone.
  await prisma.task.updateMany({ where: { milestoneId: id }, data: { milestoneId: null } });
  await softDelete("milestone", id, actor);
}

export type MilestoneProgress = { total: number; completed: number; progress: number };

/** Computed (not stored) progress for one milestone: finished / total. */
export async function milestoneProgress(id: string): Promise<MilestoneProgress> {
  const tasks = await prisma.task.findMany({
    where: { milestoneId: id, ...notDeleted },
    select: { status: true },
  });
  const counts = countCompleted(tasks.map((t) => t.status));
  return { ...counts, progress: progressFromTasks(counts) };
}
