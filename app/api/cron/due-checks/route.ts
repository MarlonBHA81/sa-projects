import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/n8n/notify";
import { authorizeCron } from "@/lib/cron-auth";
import type { DeliverableStatus } from "@prisma/client";

const ACTIVE: DeliverableStatus[] = ["NOT_STARTED", "IN_PROGRESS", "CHANGES_NEEDED", "SUBMITTED"];

export async function GET(req: Request) {
  if (!authorizeCron(req)) return new NextResponse("Unauthorized", { status: 401 });

  const now = new Date();
  const soon = new Date(now.getTime() + 48 * 3600 * 1000);

  const overdue = await prisma.deliverable.findMany({
    where: { dueDate: { lt: now }, status: { in: ACTIVE } },
    select: { id: true, title: true, funnelBuildId: true },
  });
  const dueSoon = await prisma.deliverable.findMany({
    where: { dueDate: { gte: now, lte: soon }, status: { in: ACTIVE } },
    select: { id: true, title: true, funnelBuildId: true },
  });

  for (const d of overdue) {
    void emitEvent({ type: "OVERDUE", summary: `Overdue: ${d.title}`, buildId: d.funnelBuildId, deliverableId: d.id });
  }
  for (const d of dueSoon) {
    void emitEvent({ type: "DUE_SOON", summary: `Due soon: ${d.title}`, buildId: d.funnelBuildId, deliverableId: d.id });
  }

  return NextResponse.json({ overdue: overdue.length, dueSoon: dueSoon.length });
}
