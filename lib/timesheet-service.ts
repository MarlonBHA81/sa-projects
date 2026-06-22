// Timesheet service: the per-task start/stop timer with a rate snapshot, plus
// manual entries. The project "Timesheet" tab aggregates all timers of the
// project's tasks. Billable vs non-billable is a property of the task, so all
// timers of a billable task are billable. Mirrors lib/time.ts conventions.

import { prisma } from "./db";
import { type SessionUser } from "./auth-helpers";
import { notDeleted } from "./soft-delete";
import { recordProjectActivity } from "./project-service";
import { toNumber } from "./format";

export class TimesheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimesheetError";
  }
}

async function loadTask(taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...notDeleted },
    select: { id: true, title: true, projectId: true, hourlyRate: true },
  });
  if (!task) throw new TimesheetError("Task not found");
  return task;
}

/** Start a timer on a task. Closes any running timer the staff member has. */
export async function startTimer(
  taskId: string,
  actor: SessionUser,
  note?: string,
): Promise<void> {
  const task = await loadTask(taskId);
  await prisma.$transaction(async (tx) => {
    const running = await tx.timesheet.findFirst({
      where: { staffId: actor.id, endTime: null },
    });
    if (running) {
      await tx.timesheet.update({ where: { id: running.id }, data: { endTime: new Date() } });
    }
    await tx.timesheet.create({
      data: {
        taskId,
        staffId: actor.id,
        startTime: new Date(),
        hourlyRate: task.hourlyRate, // snapshot at log time
        note: note?.trim() || null,
      },
    });
  });
  if (task.projectId) {
    await recordProjectActivity({
      projectId: task.projectId,
      actorId: actor.id,
      type: "TIMESHEET_TIMER_STARTED",
      summary: `Started a timer on "${task.title}"`,
      entityType: "task",
      entityId: taskId,
    });
  }
}

/** Stop the staff member's running timer (optionally only on a given task). */
export async function stopTimer(actor: SessionUser, taskId?: string): Promise<void> {
  const running = await prisma.timesheet.findFirst({
    where: { staffId: actor.id, endTime: null, ...(taskId ? { taskId } : {}) },
    include: { task: { select: { title: true, projectId: true } } },
  });
  if (!running) return;
  await prisma.timesheet.update({ where: { id: running.id }, data: { endTime: new Date() } });
  if (running.task.projectId) {
    await recordProjectActivity({
      projectId: running.task.projectId,
      actorId: actor.id,
      type: "TIMESHEET_TIMER_STOPPED",
      summary: `Stopped a timer on "${running.task.title}"`,
      entityType: "task",
      entityId: running.taskId,
    });
  }
}

/** Add a manual timesheet entry (pick start, end, task, optional note). */
export async function addManualTimesheet(
  input: { taskId: string; startTime: Date; endTime: Date; note?: string | null; staffId?: string },
  actor: SessionUser,
): Promise<void> {
  if (input.endTime.getTime() <= input.startTime.getTime()) {
    throw new TimesheetError("End time must be after the start time");
  }
  const task = await loadTask(input.taskId);
  await prisma.timesheet.create({
    data: {
      taskId: input.taskId,
      staffId: input.staffId ?? actor.id,
      startTime: input.startTime,
      endTime: input.endTime,
      hourlyRate: task.hourlyRate,
      note: input.note?.trim() || null,
    },
  });
  if (task.projectId) {
    await recordProjectActivity({
      projectId: task.projectId,
      actorId: actor.id,
      type: "TIMESHEET_LOGGED",
      summary: `Logged time on "${task.title}"`,
      entityType: "task",
      entityId: input.taskId,
    });
  }
}

export async function deleteTimesheet(id: string): Promise<void> {
  await prisma.timesheet.delete({ where: { id } }).catch(() => {});
}

/** The staff member's currently running timer, if any. */
export function runningTimer(staffId: string) {
  return prisma.timesheet.findFirst({
    where: { staffId, endTime: null },
    include: { task: { select: { id: true, title: true } } },
  });
}

export type TimesheetRow = {
  id: string;
  taskId: string;
  taskTitle: string;
  staffName: string | null;
  startTime: Date;
  endTime: Date | null;
  minutes: number;
  hourlyRate: number;
  note: string | null;
};

/** All timesheet rows for a project's tasks, newest first. */
export async function projectTimesheets(projectId: string): Promise<TimesheetRow[]> {
  const rows = await prisma.timesheet.findMany({
    where: { task: { projectId, ...notDeleted } },
    orderBy: { startTime: "desc" },
    include: {
      task: { select: { id: true, title: true } },
      staff: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    taskId: r.task.id,
    taskTitle: r.task.title,
    staffName: r.staff.name,
    startTime: r.startTime,
    endTime: r.endTime,
    minutes: r.endTime ? Math.max(0, Math.round((r.endTime.getTime() - r.startTime.getTime()) / 60000)) : 0,
    hourlyRate: toNumber(r.hourlyRate),
    note: r.note,
  }));
}
