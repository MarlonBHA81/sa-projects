import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/n8n/notify";
import { authorizeCron } from "@/lib/cron-auth";
import type { DeliverableStatus } from "@prisma/client";

const ACTIVE: DeliverableStatus[] = ["NOT_STARTED", "IN_PROGRESS", "CHANGES_NEEDED", "SUBMITTED"];

const select = {
  id: true,
  title: true,
  status: true,
  funnelBuildId: true,
  assignee: { select: { name: true } },
} as const;

// Who is the work waiting on: the approver once it is submitted, otherwise its assignee.
function responsibleFor(d: { status: DeliverableStatus; assignee: { name: string | null } | null }): string {
  if (d.status === "SUBMITTED") return "the approver";
  return d.assignee?.name ?? "unassigned";
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) return new NextResponse("Unauthorized", { status: 401 });

  const now = new Date();
  const soon = new Date(now.getTime() + 48 * 3600 * 1000);
  const reviewCutoff = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const notDeleted = { deletedAt: null, funnelBuild: { deletedAt: null } };

  const overdue = await prisma.deliverable.findMany({
    where: { ...notDeleted, dueDate: { lt: now }, status: { in: ACTIVE } },
    select,
  });
  const dueSoon = await prisma.deliverable.findMany({
    where: { ...notDeleted, dueDate: { gte: now, lte: soon }, status: { in: ACTIVE } },
    select,
  });
  // Work that has been waiting on the approver for more than two days.
  const stuckInReview = await prisma.deliverable.findMany({
    where: { ...notDeleted, status: "SUBMITTED", updatedAt: { lt: reviewCutoff } },
    select,
  });

  for (const d of overdue) {
    void emitEvent({
      type: "OVERDUE",
      summary: `Overdue: ${d.title} (with ${responsibleFor(d)})`,
      buildId: d.funnelBuildId,
      deliverableId: d.id,
      meta: { responsible: responsibleFor(d), status: d.status },
    });
  }
  for (const d of dueSoon) {
    void emitEvent({
      type: "DUE_SOON",
      summary: `Due soon: ${d.title} (with ${responsibleFor(d)})`,
      buildId: d.funnelBuildId,
      deliverableId: d.id,
      meta: { responsible: responsibleFor(d), status: d.status },
    });
  }
  for (const d of stuckInReview) {
    void emitEvent({
      type: "AWAITING_APPROVAL",
      summary: `Waiting on approval for over two days: ${d.title}`,
      buildId: d.funnelBuildId,
      deliverableId: d.id,
      meta: { responsible: "the approver" },
    });
  }

  return NextResponse.json({
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    awaitingApproval: stuckInReview.length,
  });
}
