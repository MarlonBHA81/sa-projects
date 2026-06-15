// Time tracking: timers, manual logging, estimates, due dates, assignment, and
// pure workload helpers. Logged time feeds delivery cost and utilisation in the
// business operations layer.

import { prisma } from "./db";
import { AuthError, canActOnDepartment, type SessionUser } from "./auth-helpers";
import { minutesBetween } from "./workload";

export class TimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeError";
  }
}

async function loadOwnedDeliverable(deliverableId: string, actor: SessionUser) {
  const d = await prisma.deliverable.findUnique({
    where: { id: deliverableId },
    select: { id: true, department: true, funnelBuildId: true, title: true },
  });
  if (!d) throw new TimeError("Deliverable not found");
  if (!canActOnDepartment(actor, d.department)) {
    throw new AuthError("This work belongs to another department");
  }
  return d;
}

export async function startTimer(deliverableId: string, actor: SessionUser): Promise<void> {
  const d = await loadOwnedDeliverable(deliverableId, actor);
  await prisma.$transaction(async (tx) => {
    // One running entry per user: close any open one first.
    const running = await tx.timeEntry.findFirst({
      where: { userId: actor.id, isRunning: true },
    });
    if (running) {
      const ended = new Date();
      await tx.timeEntry.update({
        where: { id: running.id },
        data: { endedAt: ended, isRunning: false, durationMinutes: minutesBetween(running.startedAt, ended) },
      });
    }
    await tx.timeEntry.create({
      data: { deliverableId: d.id, userId: actor.id, isRunning: true },
    });
    await tx.activity.create({
      data: {
        type: "TIMER_STARTED",
        funnelBuildId: d.funnelBuildId,
        deliverableId: d.id,
        actorId: actor.id,
        summary: `Started a timer on "${d.title}"`,
      },
    });
  });
}

export async function stopTimer(actor: SessionUser): Promise<void> {
  const running = await prisma.timeEntry.findFirst({
    where: { userId: actor.id, isRunning: true },
    include: { deliverable: { select: { funnelBuildId: true, title: true } } },
  });
  if (!running) return;
  const ended = new Date();
  await prisma.$transaction([
    prisma.timeEntry.update({
      where: { id: running.id },
      data: { endedAt: ended, isRunning: false, durationMinutes: minutesBetween(running.startedAt, ended) },
    }),
    prisma.activity.create({
      data: {
        type: "TIMER_STOPPED",
        funnelBuildId: running.deliverable.funnelBuildId,
        deliverableId: running.deliverableId,
        actorId: actor.id,
        summary: `Stopped a timer on "${running.deliverable.title}"`,
      },
    }),
  ]);
}

export async function logTime(
  deliverableId: string,
  minutes: number,
  note: string | undefined,
  actor: SessionUser,
): Promise<void> {
  if (!Number.isFinite(minutes) || minutes <= 0) throw new TimeError("Enter minutes greater than zero");
  const d = await loadOwnedDeliverable(deliverableId, actor);
  const now = new Date();
  await prisma.$transaction([
    prisma.timeEntry.create({
      data: {
        deliverableId: d.id,
        userId: actor.id,
        startedAt: now,
        endedAt: now,
        durationMinutes: Math.round(minutes),
        note,
        isRunning: false,
      },
    }),
    prisma.activity.create({
      data: {
        type: "TIME_LOGGED",
        funnelBuildId: d.funnelBuildId,
        deliverableId: d.id,
        actorId: actor.id,
        summary: `Logged ${Math.round(minutes)}m on "${d.title}"`,
      },
    }),
  ]);
}

export async function setEstimateMinutes(
  deliverableId: string,
  minutes: number | null,
  actor: SessionUser,
): Promise<void> {
  const d = await loadOwnedDeliverable(deliverableId, actor);
  await prisma.deliverable.update({
    where: { id: d.id },
    data: { estimateMinutes: minutes && minutes > 0 ? Math.round(minutes) : null },
  });
}

export async function setDueDate(
  deliverableId: string,
  due: Date | null,
  actor: SessionUser,
): Promise<void> {
  const d = await loadOwnedDeliverable(deliverableId, actor);
  await prisma.$transaction([
    prisma.deliverable.update({ where: { id: d.id }, data: { dueDate: due } }),
    prisma.activity.create({
      data: {
        type: "DUE_DATE_SET",
        funnelBuildId: d.funnelBuildId,
        deliverableId: d.id,
        actorId: actor.id,
        summary: due ? `Set due date on "${d.title}"` : `Cleared due date on "${d.title}"`,
      },
    }),
  ]);
}

export async function assignDeliverable(
  deliverableId: string,
  assigneeId: string | null,
  actor: SessionUser,
): Promise<void> {
  const d = await loadOwnedDeliverable(deliverableId, actor);
  await prisma.$transaction([
    prisma.deliverable.update({ where: { id: d.id }, data: { assigneeId } }),
    prisma.activity.create({
      data: {
        type: "DELIVERABLE_ASSIGNED",
        funnelBuildId: d.funnelBuildId,
        deliverableId: d.id,
        actorId: actor.id,
        summary: `Reassigned "${d.title}"`,
      },
    }),
  ]);
}
