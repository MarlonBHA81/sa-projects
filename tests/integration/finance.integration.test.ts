import { beforeEach, describe, expect, it } from "vitest";
import { dbAvailable, prisma, resetDb, seedFixtures, type Fixtures } from "./db";
import {
  createProject,
  projectFinance,
  recomputeProjectProgress,
  updateProject,
  markProjectFinished,
} from "@/lib/project-service";
import { billTask, createProjectTask, setTaskStatus, updateProjectTask } from "@/lib/task-pm-service";
import { addManualTimesheet } from "@/lib/timesheet-service";
import type { ProjectBillingType } from "@prisma/client";

const hasDb = await dbAvailable();
const d = hasDb ? describe : describe.skip;

// Log `minutes` of time on a task (single closed span starting at a fixed base).
async function logMinutes(taskId: string, minutes: number, fx: Fixtures) {
  const start = new Date("2026-07-01T09:00:00Z");
  const end = new Date(start.getTime() + minutes * 60000);
  await addManualTimesheet({ taskId, startTime: start, endTime: end }, fx.admin);
}

d("billing, progress and locks against real rows", () => {
  let fx: Fixtures;

  beforeEach(async () => {
    await resetDb();
    fx = await seedFixtures();
  });

  it("auto progress = round(completed/total*100) and persists on the project", async () => {
    const projectId = await createProject({ name: "P", progressFromTasks: true }, fx.admin);
    const t1 = await createProjectTask({ projectId, title: "1" }, fx.admin);
    await createProjectTask({ projectId, title: "2" }, fx.admin);
    await createProjectTask({ projectId, title: "3" }, fx.admin);
    // 0/3
    expect(await recomputeProjectProgress(projectId)).toBe(0);
    // 1/3 -> 33 (setTaskStatus re-syncs progress)
    await setTaskStatus(t1, "COMPLETE", undefined, fx.admin);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.progress).toBe(33);
  });

  it("manual progress is not overwritten by task completion", async () => {
    const projectId = await createProject({ name: "Manual", progressFromTasks: false }, fx.admin);
    const t1 = await createProjectTask({ projectId, title: "1" }, fx.admin);
    await updateProject(projectId, { progress: 75 }, fx.admin);
    await setTaskStatus(t1, "COMPLETE", undefined, fx.admin);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.progress).toBe(75);
  });

  it("hour rollups split logged into billable / billed / unbilled", async () => {
    const projectId = await createProject({ name: "Hours", billingType: "PROJECT_HOURS", ratePerHour: 40 }, fx.admin);
    const billed = await createProjectTask({ projectId, title: "billed", billable: true, hourlyRate: 40 }, fx.admin);
    const billable = await createProjectTask({ projectId, title: "billable", billable: true, hourlyRate: 40 }, fx.admin);
    const nonBillable = await createProjectTask({ projectId, title: "free", billable: false }, fx.admin);
    await logMinutes(billed, 120, fx); // 2h
    await logMinutes(billable, 60, fx); // 1h
    await logMinutes(nonBillable, 30, fx); // 0.5h, not billable
    await billTask(billed, fx.admin); // mark the first billed

    const fin = await projectFinance(projectId);
    expect(fin.loggedMinutes).toBe(210);
    expect(fin.billableMinutes).toBe(180);
    expect(fin.billedMinutes).toBe(120);
    expect(fin.unbilledMinutes).toBe(60);
  });

  it("FIXED_RATE amount is the flat project cost and is hidden in the overview", async () => {
    const projectId = await createProject(
      { name: "Fixed", billingType: "FIXED_RATE", projectCost: 45000 },
      fx.admin,
    );
    const t = await createProjectTask({ projectId, title: "t", billable: true, hourlyRate: 100 }, fx.admin);
    await logMinutes(t, 600, fx); // time tracked but informational
    const fin = await projectFinance(projectId);
    expect(fin.amount).toBe(45000);
    expect(fin.showAmount).toBe(false);
  });

  it("PROJECT_HOURS amount = rate * total billable logged hours", async () => {
    const projectId = await createProject(
      { name: "PH", billingType: "PROJECT_HOURS", ratePerHour: 40 },
      fx.admin,
    );
    const a = await createProjectTask({ projectId, title: "a", billable: true }, fx.admin);
    const b = await createProjectTask({ projectId, title: "b", billable: false }, fx.admin);
    await logMinutes(a, 180, fx); // 3h billable
    await logMinutes(b, 120, fx); // 2h non-billable, excluded
    const fin = await projectFinance(projectId);
    expect(fin.amount).toBe(120); // 40 * 3
    expect(fin.showAmount).toBe(true);
  });

  it("TASK_HOURS amount = sum of task rate * that task's billable logged hours", async () => {
    const projectId = await createProject({ name: "TH", billingType: "TASK_HOURS" }, fx.admin);
    const a = await createProjectTask({ projectId, title: "a", billable: true, hourlyRate: 25 }, fx.admin);
    const b = await createProjectTask({ projectId, title: "b", billable: true, hourlyRate: 40 }, fx.admin);
    const c = await createProjectTask({ projectId, title: "c", billable: false, hourlyRate: 99 }, fx.admin);
    await logMinutes(a, 60, fx); // 1h * 25 = 25
    await logMinutes(b, 120, fx); // 2h * 40 = 80
    await logMinutes(c, 90, fx); // non-billable, excluded
    const fin = await projectFinance(projectId);
    expect(fin.amount).toBe(105);
  });

  describe("billing-type lock", () => {
    it("allows a change while nothing is billed", async () => {
      const projectId = await createProject({ name: "Lock1", billingType: "FIXED_RATE" }, fx.admin);
      await createProjectTask({ projectId, title: "t", billable: true, hourlyRate: 10 }, fx.admin);
      await updateProject(projectId, { billingType: "PROJECT_HOURS" }, fx.admin);
      const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      expect(project.billingType).toBe("PROJECT_HOURS");
    });

    it("blocks a change once any task on the project has been billed", async () => {
      const projectId = await createProject({ name: "Lock2", billingType: "TASK_HOURS" }, fx.admin);
      const t = await createProjectTask({ projectId, title: "t", billable: true, hourlyRate: 10 }, fx.admin);
      await billTask(t, fx.admin);
      await expect(
        updateProject(projectId, { billingType: "PROJECT_HOURS" as ProjectBillingType }, fx.admin),
      ).rejects.toThrow(/locked/i);
      const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      expect(project.billingType).toBe("TASK_HOURS"); // unchanged
    });

    it("treats setting the same billing type as a no-op even when billed", async () => {
      const projectId = await createProject({ name: "Lock3", billingType: "TASK_HOURS" }, fx.admin);
      const t = await createProjectTask({ projectId, title: "t", billable: true, hourlyRate: 10 }, fx.admin);
      await billTask(t, fx.admin);
      await expect(updateProject(projectId, { billingType: "TASK_HOURS" }, fx.admin)).resolves.toBeUndefined();
    });
  });

  describe("billed task field lock", () => {
    it("locks rate and billable once a task is billed", async () => {
      const projectId = await createProject({ name: "TaskLock", billingType: "TASK_HOURS" }, fx.admin);
      const t = await createProjectTask({ projectId, title: "t", billable: true, hourlyRate: 30 }, fx.admin);
      await billTask(t, fx.admin);
      await expect(updateProjectTask(t, { hourlyRate: 99 }, fx.admin)).rejects.toThrow(/billed/i);
      await expect(updateProjectTask(t, { billable: false }, fx.admin)).rejects.toThrow(/billed/i);
      const task = await prisma.task.findUniqueOrThrow({ where: { id: t } });
      expect(Number(task.hourlyRate)).toBe(30);
      expect(task.billable).toBe(true);
    });

    it("billing a task marks it complete and stamps dateFinished", async () => {
      const projectId = await createProject({ name: "BillStamp", billingType: "TASK_HOURS" }, fx.admin);
      const t = await createProjectTask({ projectId, title: "t", billable: true, hourlyRate: 30 }, fx.admin);
      await billTask(t, fx.admin);
      const task = await prisma.task.findUniqueOrThrow({ where: { id: t } });
      expect(task.billed).toBe(true);
      expect(task.status).toBe("COMPLETE");
      expect(task.dateFinished).not.toBeNull();
    });

    it("only an approver may bill a task", async () => {
      const projectId = await createProject({ name: "BillAuth", billingType: "TASK_HOURS" }, fx.admin);
      const t = await createProjectTask({ projectId, title: "t", billable: true, hourlyRate: 30 }, fx.admin);
      await expect(billTask(t, fx.byDept.DEV)).rejects.toThrow();
      const task = await prisma.task.findUniqueOrThrow({ where: { id: t } });
      expect(task.billed).toBe(false);
    });
  });

  describe("finished stamp", () => {
    it("stamps dateFinished when a project is marked finished and clears it when reopened", async () => {
      const projectId = await createProject({ name: "Finish", status: "IN_PROGRESS" }, fx.admin);
      await markProjectFinished(projectId, fx.admin);
      let project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      expect(project.status).toBe("FINISHED");
      expect(project.dateFinished).not.toBeNull();
      const finishedActivity = await prisma.activity.findFirst({
        where: { entityId: projectId, type: "PROJECT_FINISHED" },
      });
      expect(finishedActivity).not.toBeNull();

      // Reopen -> clears the stamp.
      await updateProject(projectId, { status: "IN_PROGRESS" }, fx.admin);
      project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      expect(project.status).toBe("IN_PROGRESS");
      expect(project.dateFinished).toBeNull();
    });

    it("does not restamp dateFinished when a finished project is updated without a status change", async () => {
      const projectId = await createProject({ name: "Finish2", status: "IN_PROGRESS" }, fx.admin);
      await markProjectFinished(projectId, fx.admin);
      const first = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      const stamp = first.dateFinished;
      await updateProject(projectId, { description: "new desc" }, fx.admin);
      const second = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      expect(second.dateFinished?.getTime()).toBe(stamp?.getTime());
    });

    it("stamps a task dateFinished on complete and clears it when reopened", async () => {
      const projectId = await createProject({ name: "TaskFinish" }, fx.admin);
      const t = await createProjectTask({ projectId, title: "t" }, fx.admin);
      await setTaskStatus(t, "COMPLETE", undefined, fx.admin);
      let task = await prisma.task.findUniqueOrThrow({ where: { id: t } });
      expect(task.dateFinished).not.toBeNull();
      await setTaskStatus(t, "IN_PROGRESS", undefined, fx.admin);
      task = await prisma.task.findUniqueOrThrow({ where: { id: t } });
      expect(task.dateFinished).toBeNull();
    });
  });
});
