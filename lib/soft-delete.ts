// Soft delete: hide from the frontend everywhere by filtering `deletedAt: null`.
// Anyone with rights can soft-delete and restore; only a super admin can purge.

import { prisma } from "./db";
import { AuthError, isSuperAdmin, type SessionUser } from "./auth-helpers";
import { recordActivity } from "./activity";

/** Spread into any `where` to exclude soft-deleted rows. */
export const notDeleted = { deletedAt: null } as const;

export type SoftDeletable =
  | "client"
  | "engagement"
  | "funnelBuild"
  | "deliverable"
  | "sprint"
  | "project"
  | "task";

type DeletedData = { deletedAt: Date | null; deletedById: string | null };

async function applyDeleted(entity: SoftDeletable, id: string, data: DeletedData): Promise<void> {
  switch (entity) {
    case "client":
      await prisma.client.update({ where: { id }, data });
      break;
    case "engagement":
      await prisma.engagement.update({ where: { id }, data });
      break;
    case "funnelBuild":
      await prisma.funnelBuild.update({ where: { id }, data });
      break;
    case "deliverable":
      await prisma.deliverable.update({ where: { id }, data });
      break;
    case "sprint":
      await prisma.sprint.update({ where: { id }, data });
      break;
    case "project":
      await prisma.project.update({ where: { id }, data });
      break;
    case "task":
      await prisma.task.update({ where: { id }, data });
      break;
  }
}

async function hardDelete(entity: SoftDeletable, id: string): Promise<void> {
  switch (entity) {
    case "client":
      await prisma.client.delete({ where: { id } });
      break;
    case "engagement":
      await prisma.engagement.delete({ where: { id } });
      break;
    case "funnelBuild":
      await prisma.funnelBuild.delete({ where: { id } });
      break;
    case "deliverable":
      await prisma.deliverable.delete({ where: { id } });
      break;
    case "sprint":
      await prisma.sprint.delete({ where: { id } });
      break;
    case "project":
      await prisma.project.delete({ where: { id } });
      break;
    case "task":
      await prisma.task.delete({ where: { id } });
      break;
  }
}

/** Titles of items that depend on this one, so the UI can warn before deleting. */
export async function dependentTitles(entity: SoftDeletable, id: string): Promise<string[]> {
  if (entity === "deliverable") {
    const rows = await prisma.deliverableDependency.findMany({
      where: { prerequisiteId: id },
      select: { dependent: { select: { title: true, deletedAt: true } } },
    });
    return rows.filter((r) => r.dependent.deletedAt === null).map((r) => r.dependent.title);
  }
  if (entity === "task") {
    const rows = await prisma.taskDependency.findMany({
      where: { prerequisiteId: id },
      select: { dependent: { select: { title: true, deletedAt: true } } },
    });
    return rows.filter((r) => r.dependent.deletedAt === null).map((r) => r.dependent.title);
  }
  return [];
}

export async function softDelete(
  entity: SoftDeletable,
  id: string,
  actor: SessionUser,
): Promise<void> {
  await applyDeleted(entity, id, { deletedAt: new Date(), deletedById: actor.id });
  await recordActivity({
    type: "ITEM_SOFT_DELETED",
    actorId: actor.id,
    entityType: entity,
    entityId: id,
    summary: `Deleted a ${entity}`,
  });
}

export async function restore(
  entity: SoftDeletable,
  id: string,
  actor: SessionUser,
): Promise<void> {
  if (!isSuperAdmin(actor)) throw new AuthError("Only the super admin can restore");
  await applyDeleted(entity, id, { deletedAt: null, deletedById: null });
  await recordActivity({
    type: "ITEM_RESTORED",
    actorId: actor.id,
    entityType: entity,
    entityId: id,
    summary: `Restored a ${entity}`,
  });
}

export async function purge(
  entity: SoftDeletable,
  id: string,
  actor: SessionUser,
): Promise<void> {
  if (!isSuperAdmin(actor)) throw new AuthError("Only the super admin can permanently delete");
  await recordActivity({
    type: "ITEM_PURGED",
    actorId: actor.id,
    entityType: entity,
    entityId: id,
    summary: `Permanently deleted a ${entity}`,
  });
  await hardDelete(entity, id);
}
