// Perfex-style project service. Loads data, runs the pure computations in
// lib/projects-pm.ts, and writes through here so every mutation records an
// Activity (global audit log) and a per-project ProjectActivity, and respects
// soft delete. This is the primary projects domain and is independent of the
// BRS gate state machine.

import { prisma } from "./db";
import { AuthError, isAdmin, type SessionUser } from "./auth-helpers";
import { recordActivity } from "./activity";
import { softDelete, notDeleted } from "./soft-delete";
import {
  billableAmount,
  billingTypeLocked,
  clampProgress,
  countCompleted,
  loggedMinutes,
  progressFromTasks,
  projectHours,
  type BillingType,
  type TaskLogged,
} from "./projects-pm";
import { toNumber } from "./format";
import type { ActivityType, Prisma, ProjectBillingType, ProjectStatus } from "@prisma/client";

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

// ---------------------------------------------------------------------------
// Per-project activity (the Activity tab) + the global audit log together.
// ---------------------------------------------------------------------------

export async function recordProjectActivity(input: {
  projectId: string;
  actorId: string;
  summary: string;
  type: ActivityType;
  visibleToCustomer?: boolean;
  meta?: Prisma.InputJsonValue;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  await prisma.$transaction([
    prisma.projectActivity.create({
      data: {
        projectId: input.projectId,
        actorId: input.actorId,
        summary: input.summary,
        visibleToCustomer: input.visibleToCustomer ?? false,
        meta: input.meta,
      },
    }),
    prisma.activity.create({
      data: {
        type: input.type,
        actorId: input.actorId,
        summary: input.summary,
        entityType: input.entityType ?? "project",
        entityId: input.entityId ?? input.projectId,
        meta: input.meta,
      },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

export type CreateProjectInput = {
  name: string;
  description?: string | null;
  clientId?: string | null;
  status?: ProjectStatus;
  billingType?: ProjectBillingType;
  progressFromTasks?: boolean;
  projectCost?: number | null;
  ratePerHour?: number | null;
  estimatedHours?: number | null;
  startDate?: Date | null;
  deadline?: Date | null;
  currency?: string;
  memberIds?: string[];
};

export async function createProject(input: CreateProjectInput, actor: SessionUser): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new ProjectError("Add a project name");

  const project = await prisma.project.create({
    data: {
      name,
      description: input.description?.trim() || null,
      ownerId: actor.id,
      clientId: input.clientId || null,
      status: input.status ?? "NOT_STARTED",
      billingType: input.billingType ?? "FIXED_RATE",
      progressFromTasks: input.progressFromTasks ?? true,
      projectCost: input.projectCost ?? null,
      ratePerHour: input.ratePerHour ?? null,
      estimatedHours: input.estimatedHours ?? null,
      startDate: input.startDate ?? null,
      deadline: input.deadline ?? null,
      currency: input.currency ?? "ZAR",
      // Sensible Perfex-like defaults: a typed settings row, customer surface off.
      settings: { create: {} },
      members: input.memberIds?.length
        ? { create: input.memberIds.map((userId) => ({ userId })) }
        : undefined,
    },
  });

  await recordProjectActivity({
    projectId: project.id,
    actorId: actor.id,
    type: "PROJECT_CREATED",
    summary: `Created project ${name}`,
  });
  return project.id;
}

async function loadProject(id: string) {
  const project = await prisma.project.findFirst({ where: { id, ...notDeleted } });
  if (!project) throw new ProjectError("Project not found");
  return project;
}

export type UpdateProjectFields = {
  name?: string;
  description?: string | null;
  clientId?: string | null;
  status?: ProjectStatus;
  billingType?: ProjectBillingType;
  progressFromTasks?: boolean;
  progress?: number;
  projectCost?: number | null;
  ratePerHour?: number | null;
  estimatedHours?: number | null;
  startDate?: Date | null;
  deadline?: Date | null;
  currency?: string;
};

export async function updateProject(
  id: string,
  fields: UpdateProjectFields,
  actor: SessionUser,
): Promise<void> {
  const project = await loadProject(id);

  // Billing type is locked once any task on the project has been billed.
  if (fields.billingType && fields.billingType !== project.billingType) {
    const billedTasks = await prisma.task.findMany({
      where: { projectId: id, ...notDeleted },
      select: { billed: true },
    });
    if (billingTypeLocked(billedTasks)) {
      throw new ProjectError("Billing type is locked once a task has been billed");
    }
  }

  // Marking finished stamps dateFinished; moving away from finished clears it.
  const becomingFinished = fields.status === "FINISHED" && project.status !== "FINISHED";
  const leavingFinished =
    fields.status && fields.status !== "FINISHED" && project.status === "FINISHED";

  await prisma.project.update({
    where: { id },
    data: {
      name: fields.name?.trim() || undefined,
      description:
        fields.description === undefined ? undefined : fields.description?.trim() || null,
      clientId: fields.clientId === undefined ? undefined : fields.clientId || null,
      status: fields.status,
      billingType: fields.billingType,
      progressFromTasks: fields.progressFromTasks,
      progress: fields.progress === undefined ? undefined : clampProgress(fields.progress),
      projectCost: fields.projectCost === undefined ? undefined : fields.projectCost,
      ratePerHour: fields.ratePerHour === undefined ? undefined : fields.ratePerHour,
      estimatedHours: fields.estimatedHours === undefined ? undefined : fields.estimatedHours,
      startDate: fields.startDate === undefined ? undefined : fields.startDate,
      deadline: fields.deadline === undefined ? undefined : fields.deadline,
      currency: fields.currency,
      dateFinished: becomingFinished ? new Date() : leavingFinished ? null : undefined,
    },
  });

  await recordProjectActivity({
    projectId: id,
    actorId: actor.id,
    type: becomingFinished ? "PROJECT_FINISHED" : "PROJECT_UPDATED",
    summary: becomingFinished ? `Marked "${project.name}" finished` : `Updated "${project.name}"`,
  });

  // If progress is auto, keep it in sync after any change.
  if (fields.progressFromTasks !== false) await recomputeProjectProgress(id);
}

/** Mark a project finished, stamping dateFinished. */
export async function markProjectFinished(id: string, actor: SessionUser): Promise<void> {
  await updateProject(id, { status: "FINISHED" }, actor);
}

/** Recompute and persist progress from task completion when progressFromTasks. */
export async function recomputeProjectProgress(id: string): Promise<number> {
  const project = await prisma.project.findFirst({
    where: { id, ...notDeleted },
    select: { progressFromTasks: true },
  });
  if (!project || !project.progressFromTasks) {
    const cur = await prisma.project.findUnique({ where: { id }, select: { progress: true } });
    return cur?.progress ?? 0;
  }
  const tasks = await prisma.task.findMany({
    where: { projectId: id, ...notDeleted },
    select: { status: true },
  });
  const progress = progressFromTasks(countCompleted(tasks.map((t) => t.status)));
  await prisma.project.update({ where: { id }, data: { progress } });
  return progress;
}

// ---------------------------------------------------------------------------
// Settings (admin-only customer-visibility toggles)
// ---------------------------------------------------------------------------

export type ProjectSettingsFields = Partial<{
  viewTasks: boolean;
  createTasks: boolean;
  editTasks: boolean;
  commentOnTasks: boolean;
  viewTaskComments: boolean;
  viewTaskAttachments: boolean;
  viewTaskChecklistItems: boolean;
  uploadOnTasks: boolean;
  viewTaskTotalLoggedTime: boolean;
  viewFinanceOverview: boolean;
  uploadFiles: boolean;
  openDiscussions: boolean;
  viewMilestones: boolean;
  viewGantt: boolean;
  viewTimesheets: boolean;
  viewActivityLog: boolean;
  viewTeamMembers: boolean;
  hideTasksOnMainTable: boolean;
}>;

export async function updateProjectSettings(
  projectId: string,
  fields: ProjectSettingsFields,
  actor: SessionUser,
): Promise<void> {
  if (!isAdmin(actor)) throw new AuthError("Only an approver can change customer visibility");
  await loadProject(projectId);
  await prisma.projectSettings.upsert({
    where: { projectId },
    create: { projectId, ...fields },
    update: fields,
  });
  await recordProjectActivity({
    projectId,
    actorId: actor.id,
    type: "PROJECT_UPDATED",
    summary: "Updated customer visibility settings",
  });
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function addProjectMember(
  projectId: string,
  userId: string,
  actor: SessionUser,
): Promise<void> {
  await loadProject(projectId);
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId },
    update: {},
  });
  await recordProjectActivity({
    projectId,
    actorId: actor.id,
    type: "PROJECT_MEMBER_ADDED",
    summary: "Added a project member",
  });
}

export async function removeProjectMember(
  projectId: string,
  userId: string,
  actor: SessionUser,
): Promise<void> {
  await prisma.projectMember
    .delete({ where: { projectId_userId: { projectId, userId } } })
    .catch(() => {});
  await recordProjectActivity({
    projectId,
    actorId: actor.id,
    type: "PROJECT_MEMBER_REMOVED",
    summary: "Removed a project member",
  });
}

// ---------------------------------------------------------------------------
// Delete (soft) — owner or approver
// ---------------------------------------------------------------------------

export async function deleteProject(id: string, actor: SessionUser): Promise<void> {
  const project = await loadProject(id);
  if (!isAdmin(actor) && project.ownerId !== actor.id) {
    throw new AuthError("Only the owner or an approver can delete this project");
  }
  await softDelete("project", id, actor);
}

// ---------------------------------------------------------------------------
// Notes / Files / Discussions
// ---------------------------------------------------------------------------

export async function addProjectNote(
  projectId: string,
  content: string,
  actor: SessionUser,
): Promise<void> {
  const text = content.trim();
  if (!text) throw new ProjectError("Write a note first");
  await loadProject(projectId);
  await prisma.projectNote.create({ data: { projectId, content: text, authorId: actor.id } });
  await recordProjectActivity({
    projectId,
    actorId: actor.id,
    type: "PROJECT_NOTE_ADDED",
    summary: "Added a note",
  });
}

export async function addProjectFileLink(
  projectId: string,
  input: { subject: string; url: string; description?: string | null; visibleToCustomer?: boolean },
  actor: SessionUser,
): Promise<void> {
  const subject = input.subject.trim();
  const url = input.url.trim();
  if (!subject || !url) throw new ProjectError("Add a name and a link");
  await loadProject(projectId);
  await prisma.projectFile.create({
    data: {
      projectId,
      fileName: subject,
      subject,
      description: input.description?.trim() || null,
      external: "link",
      externalLink: url,
      url,
      visibleToCustomer: input.visibleToCustomer ?? false,
      uploadedById: actor.id,
    },
  });
  await recordProjectActivity({
    projectId,
    actorId: actor.id,
    type: "PROJECT_FILE_ADDED",
    summary: `Added file "${subject}"`,
  });
}

export async function createDiscussion(
  projectId: string,
  input: { subject: string; description?: string | null; showToCustomer?: boolean },
  actor: SessionUser,
): Promise<string> {
  const subject = input.subject.trim();
  if (!subject) throw new ProjectError("Add a discussion subject");
  await loadProject(projectId);
  const d = await prisma.projectDiscussion.create({
    data: {
      projectId,
      subject,
      description: input.description?.trim() || null,
      showToCustomer: input.showToCustomer ?? false,
      authorId: actor.id,
      lastActivityAt: new Date(),
    },
  });
  await recordProjectActivity({
    projectId,
    actorId: actor.id,
    type: "PROJECT_DISCUSSION_CREATED",
    summary: `Opened discussion "${subject}"`,
  });
  return d.id;
}

export async function addDiscussionComment(
  discussionId: string,
  content: string,
  actor: SessionUser,
): Promise<void> {
  const text = content.trim();
  if (!text) throw new ProjectError("Write a reply first");
  const discussion = await prisma.projectDiscussion.findUnique({
    where: { id: discussionId },
    select: { projectId: true, subject: true },
  });
  if (!discussion) throw new ProjectError("Discussion not found");
  await prisma.$transaction([
    prisma.discussionComment.create({ data: { discussionId, content: text, authorId: actor.id } }),
    prisma.projectDiscussion.update({
      where: { id: discussionId },
      data: { lastActivityAt: new Date() },
    }),
  ]);
  await recordProjectActivity({
    projectId: discussion.projectId,
    actorId: actor.id,
    type: "PROJECT_DISCUSSION_COMMENTED",
    summary: `Replied on "${discussion.subject}"`,
  });
}

// ---------------------------------------------------------------------------
// Finance + hours overview (loads then runs the pure functions)
// ---------------------------------------------------------------------------

export type ProjectFinance = {
  billingType: BillingType;
  loggedMinutes: number;
  billableMinutes: number;
  billedMinutes: number;
  unbilledMinutes: number;
  amount: number;
  currency: string;
  showAmount: boolean; // hidden for Fixed Cost in Perfex finance overview
};

/** Logged minutes per task across the project, then the hour + amount rollups. */
export async function projectFinance(projectId: string): Promise<ProjectFinance> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...notDeleted },
    select: { billingType: true, projectCost: true, ratePerHour: true, currency: true },
  });
  if (!project) throw new ProjectError("Project not found");

  const tasks = await prisma.task.findMany({
    where: { projectId, ...notDeleted },
    select: {
      hourlyRate: true,
      billable: true,
      billed: true,
      timesheets: { select: { startTime: true, endTime: true } },
    },
  });

  const taskLogged: TaskLogged[] = tasks.map((t) => ({
    loggedMinutes: loggedMinutes(t.timesheets),
    hourlyRate: toNumber(t.hourlyRate),
    billable: t.billable,
    billed: t.billed,
  }));

  const hours = projectHours(taskLogged);
  const amount = billableAmount({
    billingType: project.billingType,
    projectCost: toNumber(project.projectCost),
    ratePerHour: toNumber(project.ratePerHour),
    tasks: taskLogged,
  });

  return {
    billingType: project.billingType,
    ...hours,
    amount,
    currency: project.currency,
    showAmount: project.billingType !== "FIXED_RATE",
  };
}
