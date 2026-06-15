import { describe, it, expect } from "vitest";
import { computeDeliveryCost, computePnL, marginByDeliveryType } from "./finance";

describe("computeDeliveryCost", () => {
  it("multiplies logged hours by each person's rate", () => {
    expect(
      computeDeliveryCost([
        { minutes: 120, ratePerHour: 900 }, // 2h * 900 = 1800
        { minutes: 30, ratePerHour: 800 }, // 0.5h * 800 = 400
      ]),
    ).toBe(2200);
  });
  it("is zero for no time", () => {
    expect(computeDeliveryCost([])).toBe(0);
  });
});

describe("computePnL", () => {
  it("computes gross profit and margin", () => {
    const pnl = computePnL({ revenueTotal: 45000, deliveryCost: 12000, adSpend: 5000, otherCosts: 1000 });
    expect(pnl.grossProfit).toBe(27000);
    expect(pnl.marginPct).toBe(60);
  });
  it("guards against zero revenue", () => {
    expect(computePnL({ revenueTotal: 0, deliveryCost: 100, adSpend: 0, otherCosts: 0 }).marginPct).toBe(0);
  });
});

describe("marginByDeliveryType", () => {
  it("groups and computes margin per delivery type", () => {
    const rows = [
      { deliveryType: "DFY", revenue: 100, cost: 65 },
      { deliveryType: "DFY", revenue: 100, cost: 65 },
      { deliveryType: "DIY", revenue: 100, cost: 30 },
    ];
    const out = marginByDeliveryType(rows);
    const dfy = out.find((r) => r.deliveryType === "DFY")!;
    const diy = out.find((r) => r.deliveryType === "DIY")!;
    expect(dfy.count).toBe(2);
    expect(dfy.marginPct).toBe(35);
    expect(diy.marginPct).toBe(70);
  });
});
