// Interaction/audit log helpers. Every create, update, move, and delete writes
// an Activity; the individual and team views read it back.

import { prisma } from "./db";
import type { ActivityType, Department, Prisma } from "@prisma/client";

export async function recordActivity(input: {
  type: ActivityType;
  actorId: string;
  summary: string;
  funnelBuildId?: string | null;
  engagementId?: string | null;
  deliverableId?: string | null;
  entityType?: string;
  entityId?: string;
  meta?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.activity.create({
    data: {
      type: input.type,
      actorId: input.actorId,
      summary: input.summary,
      funnelBuildId: input.funnelBuildId ?? undefined,
      engagementId: input.engagementId ?? undefined,
      deliverableId: input.deliverableId ?? undefined,
      entityType: input.entityType,
      entityId: input.entityId,
      meta: input.meta,
    },
  });
}

export function activityForUser(userId: string, take = 60) {
  return prisma.activity.findMany({
    where: { actorId: userId },
    orderBy: { createdAt: "desc" },
    take,
    include: { actor: { select: { name: true, department: true } } },
  });
}

export function activityForDepartment(department: Department, take = 120) {
  return prisma.activity.findMany({
    where: { actor: { department } },
    orderBy: { createdAt: "desc" },
    take,
    include: { actor: { select: { name: true, department: true } } },
  });
}

export function recentActivity(take = 120) {
  return prisma.activity.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { actor: { select: { name: true, department: true } } },
  });
}
