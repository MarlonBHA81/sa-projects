import { describe, it, expect } from "vitest";
import {
  billableAmount,
  billingTypeLocked,
  clampProgress,
  countCompleted,
  ganttBar,
  ganttWindow,
  loggedMinutes,
  progressFromTasks,
  projectHours,
  timesheetMinutes,
  type TaskLogged,
} from "./projects-pm";

describe("progressFromTasks", () => {
  it("rounds completed / total * 100", () => {
    expect(progressFromTasks({ total: 4, completed: 1 })).toBe(25);
    expect(progressFromTasks({ total: 3, completed: 1 })).toBe(33);
    expect(progressFromTasks({ total: 3, completed: 2 })).toBe(67);
    expect(progressFromTasks({ total: 5, completed: 5 })).toBe(100);
  });
  it("is zero with no tasks", () => {
    expect(progressFromTasks({ total: 0, completed: 0 })).toBe(0);
  });
});

describe("countCompleted", () => {
  it("counts only COMPLETE", () => {
    const out = countCompleted(["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "COMPLETE", "TESTING"]);
    expect(out).toEqual({ total: 5, completed: 2 });
  });
});

describe("clampProgress", () => {
  it("clamps to 0..100 and rounds", () => {
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(150)).toBe(100);
    expect(clampProgress(33.6)).toBe(34);
    expect(clampProgress(NaN)).toBe(0);
  });
});

describe("timesheetMinutes", () => {
  it("computes minutes from a closed span", () => {
    const start = new Date("2026-06-22T09:00:00Z");
    const end = new Date("2026-06-22T10:30:00Z");
    expect(timesheetMinutes({ startTime: start, endTime: end })).toBe(90);
  });
  it("treats a running timer as zero", () => {
    expect(timesheetMinutes({ startTime: new Date(), endTime: null })).toBe(0);
  });
  it("never goes negative", () => {
    const start = new Date("2026-06-22T10:00:00Z");
    const end = new Date("2026-06-22T09:00:00Z");
    expect(timesheetMinutes({ startTime: start, endTime: end })).toBe(0);
  });
});

describe("loggedMinutes", () => {
  it("sums closed spans and ignores running ones", () => {
    const spans = [
      { startTime: new Date("2026-06-22T09:00:00Z"), endTime: new Date("2026-06-22T10:00:00Z") }, // 60
      { startTime: new Date("2026-06-22T11:00:00Z"), endTime: new Date("2026-06-22T11:30:00Z") }, // 30
      { startTime: new Date("2026-06-22T12:00:00Z"), endTime: null }, // running -> 0
    ];
    expect(loggedMinutes(spans)).toBe(90);
  });
});

describe("projectHours", () => {
  it("splits logged into billable / billed / unbilled", () => {
    const tasks: TaskLogged[] = [
      { loggedMinutes: 120, hourlyRate: 0, billable: true, billed: true }, // billable + billed
      { loggedMinutes: 60, hourlyRate: 0, billable: true, billed: false }, // billable, not billed
      { loggedMinutes: 30, hourlyRate: 0, billable: false, billed: false }, // non-billable
    ];
    const out = projectHours(tasks);
    expect(out.loggedMinutes).toBe(210);
    expect(out.billableMinutes).toBe(180);
    expect(out.billedMinutes).toBe(120);
    expect(out.unbilledMinutes).toBe(60);
  });
});

describe("billableAmount", () => {
  it("Fixed Rate returns the flat project cost", () => {
    expect(
      billableAmount({ billingType: "FIXED_RATE", projectCost: 45000, tasks: [] }),
    ).toBe(45000);
  });

  it("Project Hours = rate * total billable logged hours (spec example: 40 * 3h = 120)", () => {
    const tasks: TaskLogged[] = [
      { loggedMinutes: 120, hourlyRate: 0, billable: true, billed: false }, // 2h
      { loggedMinutes: 60, hourlyRate: 0, billable: true, billed: false }, // 1h
      { loggedMinutes: 60, hourlyRate: 0, billable: false, billed: false }, // non-billable, excluded
    ];
    expect(billableAmount({ billingType: "PROJECT_HOURS", ratePerHour: 40, tasks })).toBe(120);
  });

  it("Task Hours = sum of task rate * task hours (spec example: 25*1h + 40*2h = 105)", () => {
    const tasks: TaskLogged[] = [
      { loggedMinutes: 60, hourlyRate: 25, billable: true, billed: false }, // 25
      { loggedMinutes: 120, hourlyRate: 40, billable: true, billed: false }, // 80
      { loggedMinutes: 90, hourlyRate: 99, billable: false, billed: false }, // non-billable, excluded
    ];
    expect(billableAmount({ billingType: "TASK_HOURS", tasks })).toBe(105);
  });
});

describe("billingTypeLocked", () => {
  it("locks once any task is billed", () => {
    expect(billingTypeLocked([{ billed: false }, { billed: false }])).toBe(false);
    expect(billingTypeLocked([{ billed: false }, { billed: true }])).toBe(true);
    expect(billingTypeLocked([])).toBe(false);
  });
});

describe("ganttWindow", () => {
  it("spans the min start to the max end", () => {
    const w = ganttWindow([
      { start: new Date("2026-06-01"), end: new Date("2026-06-10") },
      { start: new Date("2026-06-05"), end: new Date("2026-06-20") },
    ]);
    expect(w?.min.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(w?.max.toISOString().slice(0, 10)).toBe("2026-06-20");
  });
  it("is null with no dates", () => {
    expect(ganttWindow([{ start: null, end: null }])).toBeNull();
  });
});

describe("ganttBar", () => {
  const window = { min: new Date("2026-06-01T00:00:00Z"), max: new Date("2026-06-11T00:00:00Z") }; // 10 days
  it("positions a bar as offset + width percentages", () => {
    const bar = ganttBar(
      { start: new Date("2026-06-03T00:00:00Z"), end: new Date("2026-06-06T00:00:00Z") },
      window,
    );
    expect(bar.offsetPct).toBeCloseTo(20, 5); // 2/10 days
    expect(bar.widthPct).toBeCloseTo(30, 5); // 3/10 days
  });
  it("clamps width to at least 1% for a zero-length item", () => {
    const bar = ganttBar({ start: new Date("2026-06-06T00:00:00Z"), end: new Date("2026-06-06T00:00:00Z") }, window);
    expect(bar.widthPct).toBe(1);
  });
});
