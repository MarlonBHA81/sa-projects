// Create a Project from a ProjectTemplate. In a single transaction this seeds
// the Project (+ ProjectSettings) -> Milestones (resolving offsets / sprint
// windows, colour, order, sprint metadata) -> Tasks (resolving dates, priority,
// billable/rate/estimate, resolving defaultAssigneeRole to a real user,
// creating a TaskAssignee, copying checklist items, setting kanban/milestone
// order). It then records a per-project ProjectActivity and the global Activity.
//
// These are plain Perfex tasks/milestones: the BRS gate state machine is never
// touched. Date maths is the pure code in lib/project-templates.ts.

import { prisma } from "./db";
import { ProjectError } from "./project-service";
import { notDeleted } from "./soft-delete";
import { type SessionUser } from "./auth-helpers";
import {
  resolveMilestoneDueDate,
  resolveOffsetDate,
  resolveTaskDates,
} from "./project-templates";
import type {
  Department,
  Prisma,
  ProjectBillingType,
  ProjectStatus,
} from "@prisma/client";

export type CreateProjectFromTemplateInput = {
  templateId: string;
  name: string;
  description?: string | null;
  clientId?: string | null;
  status?: ProjectStatus;
  // Overrides the template's defaultBillingType when given.
  billingType?: ProjectBillingType;
  startDate?: Date | null;
  deadline?: Date | null;
  currency?: string;
  memberIds?: string[];
};

type LoadedTemplate = Prisma.ProjectTemplateGetPayload<{
  include: {
    milestones: { include: { tasks: { include: { checklistItems: true } } } };
    tasks: { include: { checklistItems: true } };
  };
}>;

/**
 * One active user per department, used to resolve a task's defaultAssigneeRole
 * to a real assignee. Picks the earliest-created member of each department so
 * the choice is stable. Users with no department (e.g. the approver) are not
 * candidates because template tasks address departments.
 */
async function departmentAssigneeMap(): Promise<Map<Department, string>> {
  const users = await prisma.user.findMany({
    where: { department: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, department: true },
  });
  const map = new Map<Department, string>();
  for (const u of users) {
    if (u.department && !map.has(u.department)) map.set(u.department, u.id);
  }
  return map;
}

/**
 * Create a project from a template. Returns the new project id. UNSTRUCTURED
 * templates simply create the project + settings (no milestones/tasks).
 */
export async function createProjectFromTemplate(
  input: CreateProjectFromTemplateInput,
  actor: SessionUser,
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new ProjectError("Add a project name");

  const template = (await prisma.projectTemplate.findFirst({
    where: { id: input.templateId, ...notDeleted },
    include: {
      milestones: {
        orderBy: { order: "asc" },
        include: {
          tasks: { orderBy: { order: "asc" }, include: { checklistItems: { orderBy: { order: "asc" } } } },
        },
      },
      tasks: {
        orderBy: { order: "asc" },
        include: { checklistItems: { orderBy: { order: "asc" } } },
      },
    },
  })) as LoadedTemplate | null;
  if (!template) throw new ProjectError("Template not found");

  const start = input.startDate ?? null;
  const billingType = input.billingType ?? template.defaultBillingType ?? "FIXED_RATE";
  const deptAssignee = await departmentAssigneeMap();

  const projectId = await prisma.$transaction(
    async (tx) => {
      const project = await tx.project.create({
        data: {
          name,
          description: input.description?.trim() || null,
          ownerId: actor.id,
          clientId: input.clientId || null,
          status: input.status ?? "NOT_STARTED",
          billingType,
          progressFromTasks: true,
          startDate: start,
          deadline: input.deadline ?? null,
          currency: input.currency ?? "ZAR",
          settings: { create: {} },
          members: input.memberIds?.length
            ? { create: input.memberIds.map((userId) => ({ userId })) }
            : undefined,
        },
      });

      // Milestones (whole-template tree for PROCESS, sprints-as-milestones for
      // SPRINT). Keep a map from the template milestone id to the created one so
      // tasks attach to the right milestone.
      const milestoneIdByTemplateId = new Map<string, string>();
      for (const [i, tm] of template.milestones.entries()) {
        const dueDate = resolveMilestoneDueDate(start, {
          dueOffsetDays: tm.dueOffsetDays,
          durationDays: tm.durationDays,
          sprintIndex: tm.sprintIndex,
        });
        // A SPRINT milestone's start is the sprint window start; a plain
        // milestone has no separate start unless it is dated by its sprint.
        const milestoneStart =
          tm.durationDays != null && tm.sprintIndex != null
            ? resolveOffsetDate(start, (tm.sprintIndex ?? 0) * (tm.durationDays ?? 0))
            : null;
        const created = await tx.milestone.create({
          data: {
            projectId: project.id,
            name: tm.name,
            description: tm.description,
            color: tm.color,
            startDate: milestoneStart,
            dueDate,
            order: tm.order ?? i,
          },
        });
        milestoneIdByTemplateId.set(tm.id, created.id);
      }

      // Tasks: those under a milestone (in milestone order) plus any
      // template-level tasks with no milestone. We track kanban order per
      // status column and milestone order per milestone so the boards seed tidy.
      const allTasks = [
        ...template.milestones.flatMap((m) => m.tasks),
        ...template.tasks.filter((t) => t.templateMilestoneId == null),
      ];

      const kanbanOrderByStatus = new Map<string, number>();
      const milestoneOrderByMilestone = new Map<string, number>();
      let projectOrder = 0;

      for (const tt of allTasks) {
        const dates = resolveTaskDates(start, tt.startOffsetDays, tt.dueOffsetDays);
        const milestoneId = tt.templateMilestoneId
          ? milestoneIdByTemplateId.get(tt.templateMilestoneId) ?? null
          : null;

        // Default Perfex board state: NOT_STARTED.
        const status = "NOT_STARTED";
        const kanbanOrder = kanbanOrderByStatus.get(status) ?? 0;
        kanbanOrderByStatus.set(status, kanbanOrder + 1);

        const milestoneOrder = milestoneId
          ? milestoneOrderByMilestone.get(milestoneId) ?? 0
          : 0;
        if (milestoneId) milestoneOrderByMilestone.set(milestoneId, milestoneOrder + 1);

        const assigneeId = tt.defaultAssigneeRole
          ? deptAssignee.get(tt.defaultAssigneeRole) ?? null
          : null;

        await tx.task.create({
          data: {
            title: tt.title,
            description: tt.description,
            projectId: project.id,
            milestoneId,
            department: tt.defaultAssigneeRole ?? null,
            status,
            priority: tt.priority ?? null,
            startDate: dates.startDate,
            dueDate: dates.dueDate,
            hourlyRate: tt.hourlyRate ?? 0,
            billable: tt.billable,
            estimateMinutes: tt.estimateMinutes ?? null,
            assigneeId,
            order: projectOrder++,
            kanbanOrder,
            milestoneOrder,
            assignees: assigneeId ? { create: [{ userId: assigneeId }] } : undefined,
            checklistItems: tt.checklistItems.length
              ? {
                  create: tt.checklistItems.map((c, ci) => ({
                    description: c.description,
                    order: c.order ?? ci,
                  })),
                }
              : undefined,
          },
        });
      }

      return project.id;
    },
    { timeout: 30000, maxWait: 10000 },
  );

  // Record activity outside the tree transaction (recordProjectActivity wraps
  // its own transaction), mirroring createProject / createFunnelBuildFromTemplate.
  const summary = `Created project "${name}" from template "${template.name}"`;
  await prisma.$transaction([
    prisma.projectActivity.create({
      data: { projectId, actorId: actor.id, summary },
    }),
    prisma.activity.create({
      data: {
        type: "PROJECT_CREATED_FROM_TEMPLATE",
        actorId: actor.id,
        summary,
        entityType: "project",
        entityId: projectId,
        meta: { templateId: template.id, templateKind: template.kind },
      },
    }),
  ]);

  return projectId;
}
