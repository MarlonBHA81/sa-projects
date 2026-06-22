import { beforeAll, describe, expect, it } from "vitest";
import { dbAvailable, prisma, resetDb, seedFixtures, seedTemplates, type Fixtures } from "./db";
import { createProjectFromTemplate } from "@/lib/project-template-service";
import { BRS_STANDARD } from "@/lib/brs-template";

const hasDb = await dbAvailable();
const d = hasDb ? describe : describe.skip;

// Expected BRS shape, derived from the source template so the assertions track
// the template if it changes.
const BRS_STAGE_COUNT = BRS_STANDARD.stages.length; // 5
const BRS_DELIVERABLE_COUNT = BRS_STANDARD.stages.reduce(
  (n, s) => n + s.deliverables.length,
  0,
); // 34
const BRS_CHECKLIST_TOTAL = BRS_STANDARD.stages.reduce(
  (n, s) => n + s.deliverables.reduce((m, dl) => m + (dl.checklist?.length ?? 0), 0),
  0,
);

d("createProjectFromTemplate", () => {
  let fx: Fixtures;
  let templates: Record<string, string>;

  beforeAll(async () => {
    if (!hasDb) return;
    await resetDb();
    fx = await seedFixtures();
    templates = await seedTemplates();
  });

  describe("PROCESS (BRS)", () => {
    const start = new Date("2026-07-01T00:00:00Z");
    let projectId: string;

    beforeAll(async () => {
      projectId = await createProjectFromTemplate(
        { templateId: templates.PROCESS, name: "BRS build", clientId: fx.clientId, startDate: start },
        fx.admin,
      );
    });

    it("creates the project with the template's default billing type and a settings row", async () => {
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        include: { settings: true },
      });
      expect(project.name).toBe("BRS build");
      expect(project.billingType).toBe("TASK_HOURS"); // BRS process default
      expect(project.clientId).toBe(fx.clientId);
      expect(project.ownerId).toBe(fx.admin.id);
      expect(project.progressFromTasks).toBe(true);
      expect(project.settings).not.toBeNull();
    });

    it("turns the 5 BRS stages into milestones, named with their phase", async () => {
      const milestones = await prisma.milestone.findMany({
        where: { projectId },
        orderBy: { order: "asc" },
      });
      expect(milestones).toHaveLength(BRS_STAGE_COUNT);
      // Differentiate, Integrate, Activate must all appear in the names.
      const names = milestones.map((m) => m.name);
      expect(names.some((n) => n.startsWith("Differentiate"))).toBe(true);
      expect(names.some((n) => n.startsWith("Integrate"))).toBe(true);
      expect(names.some((n) => n.startsWith("Activate"))).toBe(true);
      // Order is preserved 0..n.
      expect(milestones.map((m) => m.order)).toEqual(
        Array.from({ length: BRS_STAGE_COUNT }, (_, i) => i),
      );
    });

    it("turns every deliverable into a task, all NOT_STARTED, under a milestone", async () => {
      const tasks = await prisma.task.findMany({ where: { projectId } });
      expect(tasks).toHaveLength(BRS_DELIVERABLE_COUNT);
      expect(tasks.every((t) => t.status === "NOT_STARTED")).toBe(true);
      expect(tasks.every((t) => t.milestoneId !== null)).toBe(true);
      // The BRS process carries no dates (no offsets), so tasks stay undated.
      expect(tasks.every((t) => t.startDate === null && t.dueDate === null)).toBe(true);
    });

    it("copies each deliverable's checklist onto its task", async () => {
      const total = await prisma.taskChecklistItem.count({ where: { task: { projectId } } });
      expect(total).toBe(BRS_CHECKLIST_TOTAL);
      // Spot-check a known deliverable: the Brand Messaging Playbook has 5 items.
      const playbook = await prisma.task.findFirstOrThrow({
        where: { projectId, title: "Brand Messaging Playbook" },
        include: { checklistItems: { orderBy: { order: "asc" } } },
      });
      expect(playbook.checklistItems).toHaveLength(5);
      expect(playbook.checklistItems[0].order).toBe(0);
    });

    it("resolves default assignees by department and writes a TaskAssignee", async () => {
      // The playbook is a STRATEGY deliverable -> the STRATEGY user.
      const playbook = await prisma.task.findFirstOrThrow({
        where: { projectId, title: "Brand Messaging Playbook" },
        include: { assignees: true },
      });
      expect(playbook.department).toBe("STRATEGY");
      expect(playbook.assigneeId).toBe(fx.byDept.STRATEGY.id);
      expect(playbook.assignees).toHaveLength(1);
      expect(playbook.assignees[0].userId).toBe(fx.byDept.STRATEGY.id);

      // A DEV deliverable resolves to the DEV user.
      const buildEnv = await prisma.task.findFirstOrThrow({
        where: { projectId, title: "Build environment" },
        include: { assignees: true },
      });
      expect(buildEnv.assigneeId).toBe(fx.byDept.DEV.id);
      expect(buildEnv.assignees[0]?.userId).toBe(fx.byDept.DEV.id);
    });

    it("records a ProjectActivity and a global Activity for the creation", async () => {
      const pa = await prisma.projectActivity.findMany({ where: { projectId } });
      expect(pa.some((a) => a.summary.includes("from template"))).toBe(true);
      const act = await prisma.activity.findFirst({
        where: { entityId: projectId, type: "PROJECT_CREATED_FROM_TEMPLATE" },
      });
      expect(act).not.toBeNull();
      expect((act?.meta as { templateKind?: string } | null)?.templateKind).toBe("PROCESS");
    });
  });

  describe("SPRINT", () => {
    const start = new Date("2026-07-01T00:00:00Z");
    let projectId: string;

    beforeAll(async () => {
      projectId = await createProjectFromTemplate(
        { templateId: templates.SPRINT, name: "Sprint project", startDate: start },
        fx.admin,
      );
    });

    it("creates three back-to-back two-week sprint milestones with inclusive windows", async () => {
      const milestones = await prisma.milestone.findMany({
        where: { projectId },
        orderBy: { order: "asc" },
      });
      expect(milestones).toHaveLength(3);
      const day = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
      // Sprint 1: 1-14 Jul (start, start+13). Sprint 2 starts the next day.
      expect(day(milestones[0].startDate)).toBe("2026-07-01");
      expect(day(milestones[0].dueDate)).toBe("2026-07-14");
      expect(day(milestones[1].startDate)).toBe("2026-07-15");
      expect(day(milestones[1].dueDate)).toBe("2026-07-28");
      expect(day(milestones[2].startDate)).toBe("2026-07-29");
      expect(day(milestones[2].dueDate)).toBe("2026-08-11");
    });

    it("seeds the starter backlog into the right sprints with resolved dates", async () => {
      const tasks = await prisma.task.findMany({
        where: { projectId },
        include: { milestone: true },
      });
      // 3 + 2 + 2 starter tasks.
      expect(tasks).toHaveLength(7);
      expect(tasks.every((t) => t.billable)).toBe(true);
      // Every task is attached to a milestone and has start/due within the window.
      expect(tasks.every((t) => t.milestoneId && t.startDate && t.dueDate)).toBe(true);
      const planning = tasks.find((t) => t.title === "Sprint planning and backlog grooming");
      expect(planning?.startDate?.toISOString().slice(0, 10)).toBe("2026-07-01");
      // dueOffset for sprint 0 is 14*1-1 = 13 days -> 14 Jul.
      expect(planning?.dueDate?.toISOString().slice(0, 10)).toBe("2026-07-14");
      expect(planning?.priority).toBe("HIGH"); // first task in a sprint
    });

    it("uses the sprint template's project-hours billing default", async () => {
      const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      expect(project.billingType).toBe("PROJECT_HOURS");
    });
  });

  describe("UNSTRUCTURED", () => {
    let projectId: string;

    beforeAll(async () => {
      projectId = await createProjectFromTemplate(
        { templateId: templates.UNSTRUCTURED, name: "Blank one" },
        fx.admin,
      );
    });

    it("creates only the project and its settings, no milestones or tasks", async () => {
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        include: { settings: true, milestones: true, tasks: true },
      });
      expect(project.settings).not.toBeNull();
      expect(project.milestones).toHaveLength(0);
      expect(project.tasks).toHaveLength(0);
      expect(project.billingType).toBe("FIXED_RATE"); // blank default
    });
  });

  it("rejects an unknown template id", async () => {
    await expect(
      createProjectFromTemplate({ templateId: "does-not-exist", name: "x" }, fx.admin),
    ).rejects.toThrow();
  });

  it("rejects a blank project name", async () => {
    await expect(
      createProjectFromTemplate({ templateId: templates.UNSTRUCTURED, name: "   " }, fx.admin),
    ).rejects.toThrow();
  });
});
