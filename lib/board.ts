// Planning board moves. These set the planning lane and sprint only. They never
// touch the gated deliverable status, so the BRS gates stay intact.

import { prisma } from "./db";
import type { SessionUser } from "./auth-helpers";
import { recordActivity } from "./activity";
import type { PlanningLane } from "@prisma/client";

export async function moveDeliverableLane(
  id: string,
  lane: PlanningLane,
  actor: SessionUser,
): Promise<void> {
  const d = await prisma.deliverable.findFirst({
    where: { id, deletedAt: null },
    select: { title: true, funnelBuildId: true },
  });
  if (!d) return;
  await prisma.deliverable.update({ where: { id }, data: { planningLane: lane } });
  await recordActivity({
    type: "DELIVERABLE_MOVED",
    actorId: actor.id,
    funnelBuildId: d.funnelBuildId,
    deliverableId: id,
    entityType: "deliverable",
    entityId: id,
    summary: `Moved "${d.title}" to ${lane}`,
  });
}

export async function setDeliverableSprint(
  id: string,
  sprintId: string | null,
  actor: SessionUser,
): Promise<void> {
  const d = await prisma.deliverable.findFirst({
    where: { id, deletedAt: null },
    select: { title: true, funnelBuildId: true },
  });
  if (!d) return;
  await prisma.deliverable.update({ where: { id }, data: { sprintId } });
  await recordActivity({
    type: "DELIVERABLE_MOVED",
    actorId: actor.id,
    funnelBuildId: d.funnelBuildId,
    deliverableId: id,
    entityType: "deliverable",
    entityId: id,
    summary: sprintId ? `Assigned "${d.title}" to a sprint` : `Removed "${d.title}" from its sprint`,
  });
}
