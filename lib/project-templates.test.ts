import { describe, it, expect } from "vitest";
import {
  resolveMilestoneDueDate,
  resolveOffsetDate,
  resolveTaskDates,
  sprintWindow,
  templateSeedsContent,
} from "./project-templates";

const start = new Date("2026-06-22T00:00:00Z");
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe("resolveOffsetDate", () => {
  it("adds the offset in days to the start date", () => {
    expect(day(resolveOffsetDate(start, 0))).toBe("2026-06-22");
    expect(day(resolveOffsetDate(start, 7))).toBe("2026-06-29");
    expect(day(resolveOffsetDate(start, 30))).toBe("2026-07-22");
  });
  it("supports negative offsets (pre-kickoff)", () => {
    expect(day(resolveOffsetDate(start, -2))).toBe("2026-06-20");
  });
  it("rounds fractional offsets", () => {
    expect(day(resolveOffsetDate(start, 1.4))).toBe("2026-06-23");
  });
  it("is null with no start date or no offset", () => {
    expect(resolveOffsetDate(null, 7)).toBeNull();
    expect(resolveOffsetDate(start, null)).toBeNull();
    expect(resolveOffsetDate(start, undefined)).toBeNull();
    expect(resolveOffsetDate(undefined, undefined)).toBeNull();
  });
});

describe("resolveTaskDates", () => {
  it("resolves both offsets against the start", () => {
    const out = resolveTaskDates(start, 1, 5);
    expect(day(out.startDate)).toBe("2026-06-23");
    expect(day(out.dueDate)).toBe("2026-06-27");
  });
  it("clamps a due date that lands before the start up to the start", () => {
    const out = resolveTaskDates(start, 10, 3);
    expect(day(out.startDate)).toBe("2026-07-02");
    expect(day(out.dueDate)).toBe("2026-07-02");
  });
  it("leaves a missing offset null without affecting the other", () => {
    const out = resolveTaskDates(start, null, 4);
    expect(out.startDate).toBeNull();
    expect(day(out.dueDate)).toBe("2026-06-26");
  });
  it("is fully null with no start date", () => {
    const out = resolveTaskDates(null, 1, 5);
    expect(out.startDate).toBeNull();
    expect(out.dueDate).toBeNull();
  });
});

describe("sprintWindow", () => {
  it("runs sprints back to back from the start (14 day sprints, inclusive due)", () => {
    const s0 = sprintWindow(start, 0, 14);
    expect(day(s0.startDate)).toBe("2026-06-22");
    expect(day(s0.dueDate)).toBe("2026-07-05"); // 14 days inclusive

    const s1 = sprintWindow(start, 1, 14);
    expect(day(s1.startDate)).toBe("2026-07-06"); // day after sprint 0 ends
    expect(day(s1.dueDate)).toBe("2026-07-19");

    const s2 = sprintWindow(start, 2, 14);
    expect(day(s2.startDate)).toBe("2026-07-20");
  });
  it("falls back to a one day window for a missing/zero duration", () => {
    const s = sprintWindow(start, 0, 0);
    expect(day(s.startDate)).toBe("2026-06-22");
    expect(day(s.dueDate)).toBe("2026-06-22");
  });
  it("treats a negative index as the first sprint", () => {
    const s = sprintWindow(start, -3, 7);
    expect(day(s.startDate)).toBe("2026-06-22");
  });
  it("is null with no start date", () => {
    const s = sprintWindow(null, 1, 14);
    expect(s.startDate).toBeNull();
    expect(s.dueDate).toBeNull();
  });
});

describe("resolveMilestoneDueDate", () => {
  it("uses the sprint window for a SPRINT milestone", () => {
    expect(day(resolveMilestoneDueDate(start, { durationDays: 14, sprintIndex: 1 }))).toBe(
      "2026-07-19",
    );
  });
  it("uses the plain due offset for a non-sprint milestone", () => {
    expect(day(resolveMilestoneDueDate(start, { dueOffsetDays: 7 }))).toBe("2026-06-29");
  });
  it("prefers sprint metadata when both are present", () => {
    const d = resolveMilestoneDueDate(start, { dueOffsetDays: 99, durationDays: 7, sprintIndex: 0 });
    expect(day(d)).toBe("2026-06-28"); // sprint window, not +99 days
  });
  it("is null when undated", () => {
    expect(resolveMilestoneDueDate(start, {})).toBeNull();
    expect(resolveMilestoneDueDate(null, { dueOffsetDays: 7 })).toBeNull();
  });
});

describe("templateSeedsContent", () => {
  it("is true for PROCESS and SPRINT, false for UNSTRUCTURED", () => {
    expect(templateSeedsContent("PROCESS")).toBe(true);
    expect(templateSeedsContent("SPRINT")).toBe(true);
    expect(templateSeedsContent("UNSTRUCTURED")).toBe(false);
  });
});
