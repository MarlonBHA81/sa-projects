// Pure Perfex-style project/task computations. No I/O imports, so they stay
// unit-testable (mirrors lib/finance.ts). The prisma-backed loaders that feed
// these live in lib/project-service.ts and lib/timesheet-service.ts.
//
// These deliberately mirror Perfex's PM mechanics, not its CRM billing stack:
// progress from task completion, logged/billable/billed/unbilled hours, and the
// billable amount per billing type. Reuse round2 from finance.

import { round2 } from "./finance";

export { round2 };

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/** Perfex "progress from tasks": round(completed / total * 100). 0 when empty. */
export function progressFromTasks(input: { total: number; completed: number }): number {
  if (input.total <= 0) return 0;
  const pct = Math.round((input.completed / input.total) * 100);
  return Math.min(100, Math.max(0, pct));
}

/** A task counts as completed when its status is COMPLETE. */
export function countCompleted(statuses: string[]): { total: number; completed: number } {
  const total = statuses.length;
  const completed = statuses.filter((s) => s === "COMPLETE").length;
  return { total, completed };
}

/** Clamp a manually-set progress value to 0..100. */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Logged time
// ---------------------------------------------------------------------------

export type TimesheetSpan = { startTime: Date; endTime: Date | null };

/** Minutes for one timesheet span. Running timers (no endTime) contribute 0. */
export function timesheetMinutes(span: TimesheetSpan): number {
  if (!span.endTime) return 0;
  const ms = span.endTime.getTime() - span.startTime.getTime();
  if (ms <= 0) return 0;
  return Math.round(ms / 60000);
}

/** Total logged minutes across spans (running excluded). */
export function loggedMinutes(spans: TimesheetSpan[]): number {
  return spans.reduce((acc, s) => acc + timesheetMinutes(s), 0);
}

// A task with its rate, flags, and its own logged minutes. The unit for billing.
export type TaskLogged = {
  loggedMinutes: number;
  hourlyRate: number;
  billable: boolean;
  billed: boolean;
};

export type HoursBreakdown = {
  loggedMinutes: number;
  billableMinutes: number;
  billedMinutes: number;
  unbilledMinutes: number;
};

/**
 * Project hour rollup. Billable = on billable tasks; billed = on billed tasks;
 * unbilled = billable not yet billed (never negative).
 */
export function projectHours(tasks: TaskLogged[]): HoursBreakdown {
  let logged = 0;
  let billable = 0;
  let billed = 0;
  for (const t of tasks) {
    logged += t.loggedMinutes;
    if (t.billable) billable += t.loggedMinutes;
    if (t.billed) billed += t.loggedMinutes;
  }
  return {
    loggedMinutes: logged,
    billableMinutes: billable,
    billedMinutes: billed,
    unbilledMinutes: Math.max(0, billable - billed),
  };
}

// ---------------------------------------------------------------------------
// Billable amount per billing type
// ---------------------------------------------------------------------------

export type BillingType = "FIXED_RATE" | "PROJECT_HOURS" | "TASK_HOURS";

export type BillingInput = {
  billingType: BillingType;
  // Fixed Rate
  projectCost?: number | null;
  // Project Hours
  ratePerHour?: number | null;
  // Tasks (used by Project Hours for total billable hours, and Task Hours for
  // the per-task rate * its hours).
  tasks: TaskLogged[];
};

/**
 * The billable amount.
 * - Fixed Rate: the flat projectCost (time is informational).
 * - Project Hours: ratePerHour * total billable logged hours.
 * - Task Hours: sum over billable tasks of (task.hourlyRate * its logged hours).
 */
export function billableAmount(input: BillingInput): number {
  switch (input.billingType) {
    case "FIXED_RATE":
      return round2(input.projectCost ?? 0);
    case "PROJECT_HOURS": {
      const billableHrs = projectHours(input.tasks).billableMinutes / 60;
      return round2((input.ratePerHour ?? 0) * billableHrs);
    }
    case "TASK_HOURS": {
      const total = input.tasks.reduce(
        (acc, t) => acc + (t.billable ? t.hourlyRate * (t.loggedMinutes / 60) : 0),
        0,
      );
      return round2(total);
    }
  }
}

/**
 * Whether the project's billing type may still be changed. Perfex locks it once
 * any task on the project has been billed.
 */
export function billingTypeLocked(tasks: { billed: boolean }[]): boolean {
  return tasks.some((t) => t.billed);
}
