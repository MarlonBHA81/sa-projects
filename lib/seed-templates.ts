// Seed the three project templates idempotently:
//  - PROCESS:      the BRS process expressed in Perfex terms (phases/stages ->
//                  milestones, deliverables -> tasks with checklist items and
//                  estimates). Derived from lib/brs-template.ts. Plain Perfex
//                  tasks/milestones; no BRS gate state.
//  - SPRINT:       a two-week delivery sprint, each sprint a milestone carrying
//                  durationDays/sprintIndex, seeded with a starter backlog.
//  - UNSTRUCTURED: project + settings only, no milestones/tasks.
//
// Idempotent: upsert each template by name, then rebuild its milestone/task
// tree so re-seeding reflects template changes without duplicating rows.

import type { PrismaClient, Department, TaskPriority } from "@prisma/client";
import { BRS_STANDARD, type BrsTemplate } from "./brs-template";
import { phaseLabel } from "./labels";

// ---------------------------------------------------------------------------
// Template data shape (plain data, instantiated by the seed writer below)
// ---------------------------------------------------------------------------

type TemplateChecklistData = { description: string; order: number };

type TemplateTaskData = {
  title: string;
  description?: string | null;
  priority?: TaskPriority | null;
  billable?: boolean;
  hourlyRate?: number | null;
  estimateMinutes?: number | null;
  startOffsetDays?: number | null;
  dueOffsetDays?: number | null;
  defaultAssigneeRole?: Department | null;
  order: number;
  // Index into the milestones array (null for a template-level task).
  milestoneIndex: number | null;
  checklist: TemplateChecklistData[];
};

type TemplateMilestoneData = {
  name: string;
  description?: string | null;
  color?: string | null;
  order: number;
  dueOffsetDays?: number | null;
  durationDays?: number | null;
  sprintIndex?: number | null;
};

type TemplateData = {
  name: string;
  kind: "PROCESS" | "SPRINT" | "UNSTRUCTURED";
  description?: string | null;
  defaultBillingType?: "FIXED_RATE" | "PROJECT_HOURS" | "TASK_HOURS" | null;
  order: number;
  milestones: TemplateMilestoneData[];
  tasks: TemplateTaskData[];
};

// ---------------------------------------------------------------------------
// PROCESS: derive from the BRS template
// ---------------------------------------------------------------------------

function rollupEstimate(
  steps: { estimateMinutes?: number }[] | undefined,
  fallback?: number,
): number | null {
  if (steps && steps.length > 0) {
    const sum = steps.reduce((acc, s) => acc + (s.estimateMinutes ?? 0), 0);
    if (sum > 0) return sum;
  }
  return fallback ?? null;
}

// Perfex milestone palette per phase, so the board reads at a glance.
const PHASE_COLOR: Record<string, string> = {
  DIFFERENTIATE: "#03a9f4",
  INTEGRATE: "#ff6f00",
  ACTIVATE: "#22c55e",
};

/**
 * Turn the BRS template into PROCESS template data: each BRS stage becomes a
 * milestone (named with its phase so Differentiate/Integrate/Activate are
 * visible), and each deliverable becomes a task under that milestone, carrying
 * its title, description, ordering, department (as the default assignee role),
 * the verification checklist (as task checklist items) and an estimate rolled
 * up from its process steps. No dates: a process is scheduled on the instance.
 */
export function brsProcessTemplateData(brs: BrsTemplate = BRS_STANDARD): TemplateData {
  const milestones: TemplateMilestoneData[] = [];
  const tasks: TemplateTaskData[] = [];

  const stages = [...brs.stages].sort((a, b) => a.order - b.order);
  stages.forEach((stage, stageIndex) => {
    milestones.push({
      name: `${phaseLabel[stage.phase]}: ${stage.title}`,
      description: null,
      color: PHASE_COLOR[stage.phase] ?? null,
      order: stageIndex,
    });

    stage.deliverables.forEach((d, dIndex) => {
      tasks.push({
        title: d.title,
        description: d.description ?? null,
        priority: null,
        billable: false,
        hourlyRate: null,
        estimateMinutes: rollupEstimate(d.processSteps, d.estimateMinutes),
        startOffsetDays: null,
        dueOffsetDays: null,
        defaultAssigneeRole: d.department,
        order: dIndex,
        milestoneIndex: stageIndex,
        checklist: (d.checklist ?? []).map((c, ci) => ({ description: c.label, order: ci })),
      });
    });
  });

  return {
    name: "BRS process",
    kind: "PROCESS",
    description:
      "The full Brand Resonance System as a project: Differentiate, Integrate and Activate stages as milestones, deliverables as tasks with their checklists.",
    defaultBillingType: "TASK_HOURS",
    order: 0,
    milestones,
    tasks,
  };
}

// ---------------------------------------------------------------------------
// SPRINT: a two-week delivery sprint with a starter backlog
// ---------------------------------------------------------------------------

const SPRINT_LENGTH_DAYS = 14;

function sprintTemplateData(): TemplateData {
  // Three back-to-back two-week sprints, each a milestone with a starter
  // backlog so the milestone board drives execution from day one.
  const milestones: TemplateMilestoneData[] = [0, 1, 2].map((i) => ({
    name: `Sprint ${i + 1}`,
    description: i === 0 ? "Kick off and clear the first slice of the backlog." : null,
    color: "#6366f1",
    order: i,
    durationDays: SPRINT_LENGTH_DAYS,
    sprintIndex: i,
  }));

  const starter = (
    milestoneIndex: number,
    items: { title: string; role: Department; estimate?: number }[],
  ): TemplateTaskData[] =>
    items.map((it, order) => ({
      title: it.title,
      description: null,
      priority: order === 0 ? "HIGH" : "MEDIUM",
      billable: true,
      hourlyRate: null,
      estimateMinutes: it.estimate ?? 120,
      // Due by the end of the sprint window.
      startOffsetDays: milestoneIndex * SPRINT_LENGTH_DAYS,
      dueOffsetDays: (milestoneIndex + 1) * SPRINT_LENGTH_DAYS - 1,
      defaultAssigneeRole: it.role,
      order,
      milestoneIndex,
      checklist: [{ description: "Acceptance criteria agreed", order: 0 }],
    }));

  const tasks: TemplateTaskData[] = [
    ...starter(0, [
      { title: "Sprint planning and backlog grooming", role: "STRATEGY", estimate: 60 },
      { title: "Set up the working environment", role: "DEV", estimate: 90 },
      { title: "Draft the first deliverable", role: "COPY", estimate: 180 },
    ]),
    ...starter(1, [
      { title: "Build the core feature", role: "DEV", estimate: 240 },
      { title: "Design review", role: "DESIGN", estimate: 120 },
    ]),
    ...starter(2, [
      { title: "QA and polish", role: "DEV", estimate: 180 },
      { title: "Sprint review and retro", role: "STRATEGY", estimate: 60 },
    ]),
  ];

  return {
    name: "Two-week delivery sprint",
    kind: "SPRINT",
    description:
      "Sprint execution made easy: three back-to-back two-week sprints as milestones, each seeded with a starter backlog. Drag tasks between sprints on the board.",
    defaultBillingType: "PROJECT_HOURS",
    order: 1,
    milestones,
    tasks,
  };
}

// ---------------------------------------------------------------------------
// UNSTRUCTURED: nothing but the project + settings
// ---------------------------------------------------------------------------

function unstructuredTemplateData(): TemplateData {
  return {
    name: "Blank project",
    kind: "UNSTRUCTURED",
    description: "Start empty and add your own milestones and tasks as you go.",
    defaultBillingType: "FIXED_RATE",
    order: 2,
    milestones: [],
    tasks: [],
  };
}

export function allTemplateData(): TemplateData[] {
  return [brsProcessTemplateData(), sprintTemplateData(), unstructuredTemplateData()];
}

// ---------------------------------------------------------------------------
// Idempotent seed writer
// ---------------------------------------------------------------------------

async function upsertTemplate(prisma: PrismaClient, data: TemplateData): Promise<string> {
  const existing = await prisma.projectTemplate.findFirst({ where: { name: data.name } });

  const template = existing
    ? await prisma.projectTemplate.update({
        where: { id: existing.id },
        data: {
          kind: data.kind,
          description: data.description ?? null,
          defaultBillingType: data.defaultBillingType ?? null,
          order: data.order,
          isActive: true,
          deletedAt: null,
          deletedById: null,
        },
      })
    : await prisma.projectTemplate.create({
        data: {
          name: data.name,
          kind: data.kind,
          description: data.description ?? null,
          defaultBillingType: data.defaultBillingType ?? null,
          order: data.order,
        },
      });

  // Rebuild the tree so re-seeding reflects changes without duplicates. The
  // cascade clears milestones, tasks and checklist items.
  await prisma.templateMilestone.deleteMany({ where: { templateId: template.id } });
  await prisma.templateTask.deleteMany({ where: { templateId: template.id } });

  const milestoneIds: string[] = [];
  for (const m of data.milestones) {
    const created = await prisma.templateMilestone.create({
      data: {
        templateId: template.id,
        name: m.name,
        description: m.description ?? null,
        color: m.color ?? null,
        order: m.order,
        dueOffsetDays: m.dueOffsetDays ?? null,
        durationDays: m.durationDays ?? null,
        sprintIndex: m.sprintIndex ?? null,
      },
    });
    milestoneIds.push(created.id);
  }

  for (const t of data.tasks) {
    await prisma.templateTask.create({
      data: {
        templateId: template.id,
        templateMilestoneId: t.milestoneIndex == null ? null : milestoneIds[t.milestoneIndex] ?? null,
        title: t.title,
        description: t.description ?? null,
        priority: t.priority ?? null,
        billable: t.billable ?? false,
        hourlyRate: t.hourlyRate ?? null,
        estimateMinutes: t.estimateMinutes ?? null,
        startOffsetDays: t.startOffsetDays ?? null,
        dueOffsetDays: t.dueOffsetDays ?? null,
        defaultAssigneeRole: t.defaultAssigneeRole ?? null,
        order: t.order,
        checklistItems: t.checklist.length
          ? { create: t.checklist.map((c) => ({ description: c.description, order: c.order })) }
          : undefined,
      },
    });
  }

  return template.id;
}

/** Seed (or refresh) all three project templates. Idempotent. */
export async function seedProjectTemplates(prisma: PrismaClient): Promise<void> {
  const data = allTemplateData();
  for (const d of data) await upsertTemplate(prisma, d);
  console.log(
    `Seeded ${data.length} project templates: ${data.map((d) => `${d.name} (${d.kind})`).join(", ")}.`,
  );
}
