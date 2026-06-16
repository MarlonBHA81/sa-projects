// Prisma-backed financials: compute an engagement's delivery cost, revenue,
// and margin; generate the P&L on completion; record ad-hoc costs.

import { prisma } from "./db";
import { AuthError, isApprover, type SessionUser } from "./auth-helpers";
import { emitEvent } from "./n8n/notify";
import { computeDeliveryCost, computePnL, marginByDeliveryType, round2, type PnLSummary } from "./finance";

export type EngagementFinancials = PnLSummary & {
  currency: string;
  plannedPrice: number;
  paymentsTotal: number;
  loggedMinutes: number;
};

export async function getEngagementFinancials(engagementId: string): Promise<EngagementFinancials> {
  const engagement = await prisma.engagement.findUniqueOrThrow({
    where: { id: engagementId },
    select: { price: true, currency: true },
  });

  const timeEntries = await prisma.timeEntry.findMany({
    where: { deliverable: { funnelBuild: { engagementId } } },
    select: { durationMinutes: true, user: { select: { costRatePerHour: true } } },
  });
  const loggedMinutes = timeEntries.reduce((a, t) => a + (t.durationMinutes ?? 0), 0);
  const deliveryCost = computeDeliveryCost(
    timeEntries.map((t) => ({
      minutes: t.durationMinutes ?? 0,
      ratePerHour: Number(t.user?.costRatePerHour ?? 0),
    })),
  );

  const payments = await prisma.payment.aggregate({
    where: { engagementId, status: "PAID" },
    _sum: { amount: true },
  });
  const paymentsTotal = Number(payments._sum.amount ?? 0);
  const plannedPrice = Number(engagement.price ?? 0);
  const revenueTotal = paymentsTotal > 0 ? paymentsTotal : plannedPrice;

  const adSpendAgg = await prisma.revenueChannel.aggregate({
    where: { funnelBuild: { engagementId } },
    _sum: { spend: true },
  });
  const adSpend = Number(adSpendAgg._sum.spend ?? 0);

  const otherCostsAgg = await prisma.engagementCost.aggregate({
    where: { engagementId },
    _sum: { amount: true },
  });
  const otherCosts = Number(otherCostsAgg._sum.amount ?? 0);

  const pnl = computePnL({ revenueTotal, deliveryCost, adSpend, otherCosts });
  return {
    ...pnl,
    currency: engagement.currency,
    plannedPrice: round2(plannedPrice),
    paymentsTotal: round2(paymentsTotal),
    loggedMinutes,
  };
}

export async function addEngagementCost(
  engagementId: string,
  input: { label: string; category?: string; amount: number },
  actor: SessionUser,
): Promise<void> {
  if (!isApprover(actor.role)) throw new AuthError("Only the approver can record costs");
  if (!input.label.trim() || !Number.isFinite(input.amount) || input.amount <= 0) return;
  await prisma.engagementCost.create({
    data: { engagementId, label: input.label.trim(), category: input.category, amount: input.amount },
  });
}

export async function generatePnL(engagementId: string, actor: SessionUser): Promise<void> {
  if (!isApprover(actor.role)) throw new AuthError("Only the approver can complete an engagement");
  const fin = await getEngagementFinancials(engagementId);

  const lines = [
    { label: "Revenue (fee and payments)", type: "revenue", amount: fin.revenueTotal },
    { label: "Team time", type: "cost", amount: fin.deliveryCost },
    { label: "Ad spend", type: "cost", amount: fin.adSpend },
    { label: "Other costs", type: "cost", amount: fin.otherCosts },
  ];

  await prisma.$transaction(async (tx) => {
    await tx.pnLStatement.upsert({
      where: { engagementId },
      create: {
        engagementId,
        revenueTotal: fin.revenueTotal,
        deliveryCost: fin.deliveryCost,
        adSpend: fin.adSpend,
        otherCosts: fin.otherCosts,
        grossProfit: fin.grossProfit,
        marginPct: fin.marginPct,
        lines,
      },
      update: {
        revenueTotal: fin.revenueTotal,
        deliveryCost: fin.deliveryCost,
        adSpend: fin.adSpend,
        otherCosts: fin.otherCosts,
        grossProfit: fin.grossProfit,
        marginPct: fin.marginPct,
        lines,
        generatedAt: new Date(),
      },
    });
    await tx.engagement.update({
      where: { id: engagementId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await tx.activity.create({
      data: {
        type: "ENGAGEMENT_COMPLETED",
        engagementId,
        actorId: actor.id,
        summary: "Engagement marked completed",
      },
    });
    await tx.activity.create({
      data: {
        type: "PNL_GENERATED",
        engagementId,
        actorId: actor.id,
        summary: `P&L generated: ${fin.marginPct}% margin`,
      },
    });
  });

  void emitEvent({
    type: "ENGAGEMENT_COMPLETED",
    summary: `Engagement completed at ${fin.marginPct}% margin`,
    engagementId,
  });
}

/** Portfolio margin by delivery type, for the dashboard and efficiency views.
 *  Uses grouped aggregates (not a per-engagement loop) so it stays O(1) queries. */
export async function getMarginByDeliveryType() {
  const engagements = await prisma.engagement.findMany({
    where: { deletedAt: null },
    select: { id: true, deliveryType: true, price: true },
  });
  if (engagements.length === 0) return marginByDeliveryType([]);

  const [paymentsByEng, costsByEng, builds, channels, timeEntries] = await Promise.all([
    prisma.payment.groupBy({ by: ["engagementId"], where: { status: "PAID" }, _sum: { amount: true } }),
    prisma.engagementCost.groupBy({ by: ["engagementId"], _sum: { amount: true } }),
    prisma.funnelBuild.findMany({ where: { deletedAt: null }, select: { id: true, engagementId: true } }),
    prisma.revenueChannel.groupBy({ by: ["funnelBuildId"], _sum: { spend: true } }),
    prisma.timeEntry.findMany({
      where: { deliverable: { deletedAt: null, funnelBuild: { engagement: { deletedAt: null } } } },
      select: {
        durationMinutes: true,
        deliverable: { select: { funnelBuild: { select: { engagementId: true } } } },
        user: { select: { costRatePerHour: true } },
      },
    }),
  ]);

  const paid = new Map(paymentsByEng.map((p) => [p.engagementId, Number(p._sum.amount ?? 0)]));
  const otherCosts = new Map(costsByEng.map((c) => [c.engagementId, Number(c._sum.amount ?? 0)]));
  const buildToEng = new Map(builds.map((b) => [b.id, b.engagementId]));
  const adSpend = new Map<string, number>();
  for (const ch of channels) {
    const engId = buildToEng.get(ch.funnelBuildId);
    if (engId) adSpend.set(engId, (adSpend.get(engId) ?? 0) + Number(ch._sum.spend ?? 0));
  }
  const deliveryCost = new Map<string, number>();
  for (const t of timeEntries) {
    const engId = t.deliverable?.funnelBuild?.engagementId;
    if (!engId) continue;
    const rate = Number(t.user?.costRatePerHour ?? 0);
    deliveryCost.set(engId, (deliveryCost.get(engId) ?? 0) + ((t.durationMinutes ?? 0) / 60) * rate);
  }

  const rows = engagements.map((e) => {
    const payments = paid.get(e.id) ?? 0;
    const revenue = payments > 0 ? payments : Number(e.price ?? 0);
    const cost = (deliveryCost.get(e.id) ?? 0) + (adSpend.get(e.id) ?? 0) + (otherCosts.get(e.id) ?? 0);
    return { deliveryType: e.deliveryType, revenue, cost };
  });
  return marginByDeliveryType(rows);
}
