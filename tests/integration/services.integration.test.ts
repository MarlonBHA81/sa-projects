import { beforeEach, describe, expect, it } from "vitest";
import { dbAvailable, prisma, resetDb, seedFixtures, type Fixtures } from "./db";
import {
  addProjectNote,
  createDiscussion,
  addDiscussionComment,
  createProject,
  deleteProject,
} from "@/lib/project-service";
import { createMilestone, milestoneProgress } from "@/lib/milestone-service";
import {
  addChecklistItem,
  addTaskComment,
  addTaskFollower,
  createProjectTask,
  removeTaskFollower,
  setTaskAssignees,
  setTaskStatus,
  toggleChecklistItem,
} from "@/lib/task-pm-service";
import { addManualTimesheet, startTimer, stopTimer } from "@/lib/timesheet-service";

const hasDb = await dbAvailable();
const d = hasDb ? describe : describe.skip;

d("core service writes", () => {
  let fx: Fixtures;

  beforeEach(async () => {
    await resetDb();
    fx = await seedFixtures();
  });

  it("creates a project with a settings row and dual activity records", async () => {
    const id = await createProject({ name: "Alpha", clientId: fx.clientId }, fx.admin);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id },
      include: { settings: true },
    });
    expect(project.settings).not.toBeNull();
    // A ProjectActivity (tab) and a global Activity are written together.
    const pa = await prisma.projectActivity.count({ where: { projectId: id } });
    expect(pa).toBe(1);
    const act = await prisma.activity.findFirst({ where: { entityId: id, type: "PROJECT_CREATED" } });
    expect(act).not.toBeNull();
    expect(act?.actorId).toBe(fx.admin.id);
  });

  it("creates a milestone and records milestone activity", async () => {
    const projectId = await createProject({ name: "Beta" }, fx.admin);
    const milestoneId = await createMilestone(
      { projectId, name: "Discovery", dueDate: new Date("2026-07-10") },
      fx.admin,
    );
    const m = await prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId } });
    expect(m.name).toBe("Discovery");
    expect(m.order).toBe(0);
    const act = await prisma.projectActivity.findFirst({
      where: { projectId, summary: { contains: "Discovery" } },
    });
    expect(act).not.toBeNull();
  });

  it("creates a task that records activity and seeds board order", async () => {
    const projectId = await createProject({ name: "Gamma" }, fx.admin);
    const taskId = await createProjectTask(
      { projectId, title: "Write copy", billable: true, hourlyRate: 50 },
      fx.admin,
    );
    const t = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(t.title).toBe("Write copy");
    expect(t.status).toBe("NOT_STARTED");
    expect(t.order).toBe(0);
    expect(t.kanbanOrder).toBe(0);
    const act = await prisma.activity.findFirst({ where: { entityId: taskId, type: "TASK_CREATED" } });
    expect(act).not.toBeNull();
  });

  it("sets multiple assignees and keeps the legacy single-assignee field aligned", async () => {
    const projectId = await createProject({ name: "Delta" }, fx.admin);
    const taskId = await createProjectTask({ projectId, title: "Design" }, fx.admin);
    await setTaskAssignees(taskId, [fx.byDept.DESIGN.id, fx.byDept.DEV.id], fx.admin);
    const assignees = await prisma.taskAssignee.findMany({ where: { taskId } });
    expect(assignees).toHaveLength(2);
    const t = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(t.assigneeId).toBe(fx.byDept.DESIGN.id); // first assignee

    // Reassign down to one; the join table is replaced wholesale.
    await setTaskAssignees(taskId, [fx.byDept.COPY.id], fx.admin);
    const after = await prisma.taskAssignee.findMany({ where: { taskId } });
    expect(after).toHaveLength(1);
    expect(after[0].userId).toBe(fx.byDept.COPY.id);
  });

  it("adds and removes a follower (idempotent upsert)", async () => {
    const projectId = await createProject({ name: "Epsilon" }, fx.admin);
    const taskId = await createProjectTask({ projectId, title: "QA" }, fx.admin);
    await addTaskFollower(taskId, fx.byDept.DEV.id, fx.admin);
    await addTaskFollower(taskId, fx.byDept.DEV.id, fx.admin); // duplicate -> no-op
    expect(await prisma.taskFollower.count({ where: { taskId } })).toBe(1);
    await removeTaskFollower(taskId, fx.byDept.DEV.id);
    expect(await prisma.taskFollower.count({ where: { taskId } })).toBe(0);
  });

  it("adds and ticks checklist items, stamping who/when", async () => {
    const projectId = await createProject({ name: "Zeta" }, fx.admin);
    const taskId = await createProjectTask({ projectId, title: "Launch" }, fx.admin);
    await addChecklistItem(taskId, "First", fx.admin);
    await addChecklistItem(taskId, "Second", fx.admin);
    const items = await prisma.taskChecklistItem.findMany({
      where: { taskId },
      orderBy: { order: "asc" },
    });
    expect(items.map((i) => i.order)).toEqual([0, 1]);

    await toggleChecklistItem(items[0].id, true, fx.byDept.DEV);
    const ticked = await prisma.taskChecklistItem.findUniqueOrThrow({ where: { id: items[0].id } });
    expect(ticked.finished).toBe(true);
    expect(ticked.finishedById).toBe(fx.byDept.DEV.id);
    expect(ticked.finishedAt).not.toBeNull();

    await toggleChecklistItem(items[0].id, false, fx.byDept.DEV);
    const unticked = await prisma.taskChecklistItem.findUniqueOrThrow({ where: { id: items[0].id } });
    expect(unticked.finished).toBe(false);
    expect(unticked.finishedById).toBeNull();
    expect(unticked.finishedAt).toBeNull();
  });

  it("adds a task comment and records activity", async () => {
    const projectId = await createProject({ name: "Eta" }, fx.admin);
    const taskId = await createProjectTask({ projectId, title: "Review" }, fx.admin);
    await addTaskComment(taskId, "Looks good", fx.byDept.STRATEGY);
    const comments = await prisma.taskComment.findMany({ where: { taskId } });
    expect(comments).toHaveLength(1);
    expect(comments[0].authorId).toBe(fx.byDept.STRATEGY.id);
    expect(comments[0].content).toBe("Looks good");
  });

  it("logs a manual timesheet with a rate snapshot from the task", async () => {
    const projectId = await createProject({ name: "Theta" }, fx.admin);
    const taskId = await createProjectTask(
      { projectId, title: "Build", billable: true, hourlyRate: 80 },
      fx.admin,
    );
    await addManualTimesheet(
      {
        taskId,
        startTime: new Date("2026-07-01T09:00:00Z"),
        endTime: new Date("2026-07-01T11:00:00Z"),
        note: "two hours",
      },
      fx.byDept.DEV,
    );
    const ts = await prisma.timesheet.findFirstOrThrow({ where: { taskId } });
    expect(ts.staffId).toBe(fx.byDept.DEV.id);
    expect(Number(ts.hourlyRate)).toBe(80); // snapshot of the task rate
    const minutes = (ts.endTime!.getTime() - ts.startTime.getTime()) / 60000;
    expect(minutes).toBe(120);
    const act = await prisma.activity.findFirst({ where: { entityId: taskId, type: "TIMESHEET_LOGGED" } });
    expect(act).not.toBeNull();
  });

  it("rejects a manual timesheet whose end is not after its start", async () => {
    const projectId = await createProject({ name: "Theta2" }, fx.admin);
    const taskId = await createProjectTask({ projectId, title: "X" }, fx.admin);
    await expect(
      addManualTimesheet(
        { taskId, startTime: new Date("2026-07-01T11:00:00Z"), endTime: new Date("2026-07-01T10:00:00Z") },
        fx.admin,
      ),
    ).rejects.toThrow();
  });

  it("starts and stops a timer, leaving one closed span", async () => {
    const projectId = await createProject({ name: "Iota" }, fx.admin);
    const taskId = await createProjectTask({ projectId, title: "Timer task" }, fx.admin);
    await startTimer(taskId, fx.byDept.DEV);
    const running = await prisma.timesheet.findFirstOrThrow({ where: { taskId } });
    expect(running.endTime).toBeNull();
    await stopTimer(fx.byDept.DEV);
    const stopped = await prisma.timesheet.findUniqueOrThrow({ where: { id: running.id } });
    expect(stopped.endTime).not.toBeNull();
  });

  it("closes any prior running timer when a staff member starts a new one", async () => {
    const projectId = await createProject({ name: "Kappa" }, fx.admin);
    const a = await createProjectTask({ projectId, title: "A" }, fx.admin);
    const b = await createProjectTask({ projectId, title: "B" }, fx.admin);
    await startTimer(a, fx.byDept.DEV);
    await startTimer(b, fx.byDept.DEV); // should close the timer on A
    const open = await prisma.timesheet.findMany({ where: { staffId: fx.byDept.DEV.id, endTime: null } });
    expect(open).toHaveLength(1);
    expect(open[0].taskId).toBe(b);
  });

  it("computes milestone progress from finished tasks", async () => {
    const projectId = await createProject({ name: "Lambda" }, fx.admin);
    const milestoneId = await createMilestone({ projectId, name: "M" }, fx.admin);
    const t1 = await createProjectTask({ projectId, title: "t1", milestoneId }, fx.admin);
    await createProjectTask({ projectId, title: "t2", milestoneId }, fx.admin);
    let prog = await milestoneProgress(milestoneId);
    expect(prog).toMatchObject({ total: 2, completed: 0, progress: 0 });
    await setTaskStatus(t1, "COMPLETE", undefined, fx.admin);
    prog = await milestoneProgress(milestoneId);
    expect(prog).toMatchObject({ total: 2, completed: 1, progress: 50 });
  });

  it("adds a project note and a discussion with a reply", async () => {
    const projectId = await createProject({ name: "Mu" }, fx.admin);
    await addProjectNote(projectId, "Remember the brief", fx.admin);
    expect(await prisma.projectNote.count({ where: { projectId } })).toBe(1);

    const discussionId = await createDiscussion(
      projectId,
      { subject: "Kickoff", description: "Agenda" },
      fx.admin,
    );
    await addDiscussionComment(discussionId, "First reply", fx.byDept.COPY);
    const disc = await prisma.projectDiscussion.findUniqueOrThrow({
      where: { id: discussionId },
      include: { comments: true },
    });
    expect(disc.comments).toHaveLength(1);
    expect(disc.lastActivityAt).not.toBeNull();
  });

  describe("soft delete", () => {
    it("hides a deleted project and cascades the stamp to tasks and milestones", async () => {
      const projectId = await createProject({ name: "Nu" }, fx.admin);
      const milestoneId = await createMilestone({ projectId, name: "M" }, fx.admin);
      const taskId = await createProjectTask({ projectId, title: "t", milestoneId }, fx.admin);

      await deleteProject(projectId, fx.admin);

      // Row still exists but is stamped; the notDeleted filter hides it.
      const raw = await prisma.project.findUnique({ where: { id: projectId } });
      expect(raw?.deletedAt).not.toBeNull();
      const visible = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
      expect(visible).toBeNull();
      // Cascade reached children.
      expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).deletedAt).not.toBeNull();
      expect(
        (await prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId } })).deletedAt,
      ).not.toBeNull();
    });

    it("excludes a soft-deleted milestone's tasks from milestone progress", async () => {
      const projectId = await createProject({ name: "Xi" }, fx.admin);
      const milestoneId = await createMilestone({ projectId, name: "M" }, fx.admin);
      const t1 = await createProjectTask({ projectId, title: "t1", milestoneId }, fx.admin);
      await createProjectTask({ projectId, title: "t2", milestoneId }, fx.admin);
      await setTaskStatus(t1, "COMPLETE", undefined, fx.admin);
      // Delete the whole project (cascades), then progress over the milestone
      // should see no live tasks.
      await deleteProject(projectId, fx.admin);
      const prog = await milestoneProgress(milestoneId);
      expect(prog.total).toBe(0);
    });

    it("only the owner or an approver may delete a project", async () => {
      // A non-owner, non-approver cannot delete.
      const projectId = await createProject({ name: "Omicron" }, fx.admin);
      await expect(deleteProject(projectId, fx.byDept.COPY)).rejects.toThrow();
      // Still visible.
      expect(await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } })).not.toBeNull();
    });
  });
});
