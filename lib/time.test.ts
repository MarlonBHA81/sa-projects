import { describe, it, expect } from "vitest";
import { minutesBetween, summariseWorkload, utilisationPct } from "./workload";

describe("minutesBetween", () => {
  it("rounds to whole minutes and is at least 1", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    expect(minutesBetween(start, new Date("2026-01-01T10:30:00Z"))).toBe(30);
    expect(minutesBetween(start, new Date("2026-01-01T10:00:10Z"))).toBe(1);
  });
});

describe("summariseWorkload", () => {
  const users = [
    { id: "u1", name: "Copy", weeklyCapacityHours: 30 },
    { id: "u2", name: "Design", weeklyCapacityHours: null },
  ];
  const deliverables = [
    { assigneeId: "u1", status: "IN_PROGRESS", estimateMinutes: 120 },
    { assigneeId: "u1", status: "APPROVED", estimateMinutes: 999 }, // not active, excluded
    { assigneeId: "u1", status: "NOT_STARTED", estimateMinutes: 60 },
    { assigneeId: "u1", status: "BLOCKED", estimateMinutes: 45 }, // tentative
    { assigneeId: "u2", status: "IN_PROGRESS", estimateMinutes: 90 },
  ];
  const entries = [
    { userId: "u1", durationMinutes: 45 },
    { userId: "u1", durationMinutes: 15 },
  ];

  it("sums remaining estimate on active assigned work and logged time", () => {
    const rows = summariseWorkload(users, deliverables, entries);
    const u1 = rows.find((r) => r.userId === "u1")!;
    expect(u1.committedMinutes).toBe(180);
    expect(u1.tentativeMinutes).toBe(45);
    expect(u1.loggedMinutes).toBe(60);
    expect(u1.weeklyCapacityMinutes).toBe(1800);
  });

  it("handles missing capacity", () => {
    const rows = summariseWorkload(users, deliverables, entries);
    const u2 = rows.find((r) => r.userId === "u2")!;
    expect(u2.weeklyCapacityMinutes).toBe(0);
    expect(utilisationPct(u2)).toBe(0);
  });
});

describe("utilisationPct", () => {
  it("computes committed against capacity", () => {
    expect(utilisationPct({ committedMinutes: 900, weeklyCapacityMinutes: 1800 })).toBe(50);
  });
});
