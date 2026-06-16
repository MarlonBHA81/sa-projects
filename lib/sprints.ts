// Per-build sprints: create and list, plus capacity (sum of estimates per
// assignee for the deliverables and tasks assigned to the sprint).

import { prisma } from "./db";
import { type SessionUser } from "./auth-helpers";
import { recordActivity } from "./activity";

export async function createSprint(
  input: { funnelBuildId: string; name: string; goal?: string; startDate?: Date | null; endDate?: Date | null },
  actor: SessionUser,
): Promise<string> {
  const name = input.name.trim() || "Sprint";
  const sprint = await prisma.sprint.create({
    data: {
      funnelBuildId: input.funnelBuildId,
      name,
      goal: input.goal?.trim() || null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      status: "ACTIVE",
    },
  });
  await recordActivity({
    type: "SPRINT_CREATED",
    actorId: actor.id,
    funnelBuildId: input.funnelBuildId,
    entityType: "sprint",
    entityId: sprint.id,
    summary: `Created sprint ${name}`,
  });
  return sprint.id;
}

export function listSprints(funnelBuildId: string) {
  return prisma.sprint.findMany({
    where: { funnelBuildId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

export type SprintCapacityRow = { name: string; committedMinutes: number };

/** Estimate minutes committed to a sprint, grouped by assignee name. */
export async function sprintCapacity(sprintId: string): Promise<SprintCapacityRow[]> {
  const [deliverables, tasks] = await Promise.all([
    prisma.deliverable.findMany({
      where: { sprintId, deletedAt: null },
      select: { estimateMinutes: true, assignee: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: { sprintId, deletedAt: null },
      select: { estimateMinutes: true, assignee: { select: { name: true } } },
    }),
  ]);
  const totals = new Map<string, number>();
  for (const item of [...deliverables, ...tasks]) {
    const name = item.assignee?.name ?? "Unassigned";
    totals.set(name, (totals.get(name) ?? 0) + (item.estimateMinutes ?? 0));
  }
  return Array.from(totals.entries()).map(([name, committedMinutes]) => ({ name, committedMinutes }));
}
