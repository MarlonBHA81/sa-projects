// Pure financial helpers. No I/O imports, so they stay unit-testable. The
// prisma-backed loaders and P&L generation live in lib/finance-service.ts.

export type TimeCostItem = { minutes: number; ratePerHour: number };

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Delivery cost from logged time times each person's cost rate. */
export function computeDeliveryCost(items: TimeCostItem[]): number {
  const total = items.reduce((acc, i) => acc + (i.minutes / 60) * i.ratePerHour, 0);
  return round2(total);
}

export type PnLInput = {
  revenueTotal: number;
  deliveryCost: number;
  adSpend: number;
  otherCosts: number;
};

export type PnLSummary = PnLInput & {
  grossProfit: number;
  marginPct: number;
};

export function computePnL(input: PnLInput): PnLSummary {
  const grossProfit = round2(input.revenueTotal - input.deliveryCost - input.adSpend - input.otherCosts);
  const marginPct = input.revenueTotal > 0 ? Math.round((grossProfit / input.revenueTotal) * 100) : 0;
  return {
    revenueTotal: round2(input.revenueTotal),
    deliveryCost: round2(input.deliveryCost),
    adSpend: round2(input.adSpend),
    otherCosts: round2(input.otherCosts),
    grossProfit,
    marginPct,
  };
}

export type DeliveryTypeMargin = {
  deliveryType: string;
  count: number;
  revenue: number;
  cost: number;
  marginPct: number;
};

/** Aggregate margin by delivery type across engagements. */
export function marginByDeliveryType(
  rows: { deliveryType: string; revenue: number; cost: number }[],
): DeliveryTypeMargin[] {
  const groups = new Map<string, { count: number; revenue: number; cost: number }>();
  for (const r of rows) {
    const g = groups.get(r.deliveryType) ?? { count: 0, revenue: 0, cost: 0 };
    g.count += 1;
    g.revenue += r.revenue;
    g.cost += r.cost;
    groups.set(r.deliveryType, g);
  }
  return Array.from(groups.entries()).map(([deliveryType, g]) => ({
    deliveryType,
    count: g.count,
    revenue: round2(g.revenue),
    cost: round2(g.cost),
    marginPct: g.revenue > 0 ? Math.round(((g.revenue - g.cost) / g.revenue) * 100) : 0,
  }));
}
