// Two-way GoHighLevel sync: import leads and payments, push captured leads and
// milestones. Everything is guarded so a missing token simply skips.

import { prisma } from "../db";
import { AuthError, type SessionUser } from "../auth-helpers";
import { emitEvent } from "../n8n/notify";
import { ghlConfigured, listContacts, listInvoices, upsertContact } from "./client";

export type SyncResult = { skipped: true; reason: string } | { imported: number };

function requireSalesOrAdmin(actor: SessionUser) {
  if (actor.role !== "ADMIN" && actor.role !== "SALES") {
    throw new AuthError("Only sales or the approver can sync GoHighLevel");
  }
}

export async function importLeads(buildId: string, actor: SessionUser): Promise<SyncResult> {
  requireSalesOrAdmin(actor);
  if (!ghlConfigured()) return { skipped: true, reason: "GHL token not set" };
  const build = await prisma.funnelBuild.findUnique({
    where: { id: buildId },
    select: { id: true, ghlLocationId: true, name: true },
  });
  if (!build) return { skipped: true, reason: "Build not found" };
  if (!build.ghlLocationId) return { skipped: true, reason: "No CRM sub-account linked" };

  const contacts = await listContacts(build.ghlLocationId);

  await prisma.$transaction(async (tx) => {
    for (const c of contacts) {
      const name = c.contactName ?? ([c.firstName, c.lastName].filter(Boolean).join(" ") || null);
      await tx.lead.upsert({
        where: { funnelBuildId_ghlContactId: { funnelBuildId: buildId, ghlContactId: c.id } },
        create: {
          funnelBuildId: buildId,
          ghlContactId: c.id,
          name,
          email: c.email,
          phone: c.phone,
          source: c.source ?? "Direct",
          ghlCreatedAt: c.dateAdded ? new Date(c.dateAdded) : null,
        },
        update: { name, email: c.email, phone: c.phone, source: c.source ?? "Direct" },
      });
    }

    // Roll up lead counts per source into revenue channels.
    const grouped = await tx.lead.groupBy({
      by: ["source"],
      where: { funnelBuildId: buildId },
      _count: { _all: true },
    });
    for (const g of grouped) {
      const name = g.source ?? "Direct";
      const existing = await tx.revenueChannel.findFirst({ where: { funnelBuildId: buildId, name } });
      if (existing) {
        await tx.revenueChannel.update({ where: { id: existing.id }, data: { leadsCount: g._count._all } });
      } else {
        await tx.revenueChannel.create({
          data: { funnelBuildId: buildId, name, leadsCount: g._count._all },
        });
      }
    }

    await tx.funnelBuild.update({ where: { id: buildId }, data: { ghlLastSyncedAt: new Date() } });
    await tx.activity.create({
      data: {
        type: "GHL_SYNCED",
        funnelBuildId: buildId,
        actorId: actor.id,
        summary: `Imported ${contacts.length} leads from GoHighLevel`,
      },
    });
  });

  void emitEvent({
    type: "GHL_SYNCED",
    summary: `Imported ${contacts.length} leads for ${build.name}`,
    buildId,
  });
  return { imported: contacts.length };
}

export async function importPayments(engagementId: string, actor: SessionUser): Promise<SyncResult> {
  requireSalesOrAdmin(actor);
  if (!ghlConfigured()) return { skipped: true, reason: "GHL token not set" };
  const builds = await prisma.funnelBuild.findMany({
    where: { engagementId, ghlLocationId: { not: null } },
    select: { ghlLocationId: true },
  });
  if (builds.length === 0) return { skipped: true, reason: "No CRM sub-account linked" };

  let imported = 0;
  for (const b of builds) {
    try {
      const invoices = await listInvoices(b.ghlLocationId as string);
      for (const inv of invoices) {
        const ref = inv._id ?? inv.id;
        if (!ref) continue;
        const paid = (inv.amountPaid ?? 0) > 0 || inv.status === "paid";
        await prisma.payment.upsert({
          where: { ghlRef: ref },
          create: {
            engagementId,
            amount: inv.amountPaid ?? inv.total ?? 0,
            status: paid ? "PAID" : "PENDING",
            paidAt: paid && inv.updatedAt ? new Date(inv.updatedAt) : null,
            ghlRef: ref,
          },
          update: {
            amount: inv.amountPaid ?? inv.total ?? 0,
            status: paid ? "PAID" : "PENDING",
          },
        });
        imported += 1;
      }
    } catch (err) {
      console.error("[ghl] importPayments failed for location", err);
    }
  }
  return { imported };
}

export async function pushLead(
  buildId: string,
  lead: { email?: string; phone?: string; firstName?: string; lastName?: string; tags?: string[] },
): Promise<void> {
  if (!ghlConfigured()) return;
  const build = await prisma.funnelBuild.findUnique({
    where: { id: buildId },
    select: { ghlLocationId: true },
  });
  if (!build?.ghlLocationId) return;
  try {
    await upsertContact(build.ghlLocationId, lead);
  } catch (err) {
    console.error("[ghl] pushLead failed", err);
  }
}

export async function pushMilestone(buildId: string, text: string, actorId: string): Promise<void> {
  // Milestones flow back through n8n, which routes them to GoHighLevel.
  await prisma.activity.create({
    data: { type: "MILESTONE_PUSHED", funnelBuildId: buildId, actorId, summary: text },
  });
  void emitEvent({ type: "GHL_SYNCED", summary: text, buildId });
}
