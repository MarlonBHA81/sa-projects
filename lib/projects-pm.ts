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

// ---------------------------------------------------------------------------
// Finished / billed state transitions (pure)
// ---------------------------------------------------------------------------

export type ProjectStatusName =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "FINISHED"
  | "CANCELLED";

/**
 * Resolve dateFinished on a status change. Stamp `now` when entering FINISHED,
 * clear when leaving it, otherwise leave unchanged (undefined).
 */
export function resolveDateFinished(
  current: ProjectStatusName,
  next: ProjectStatusName | undefined,
  now: Date,
): Date | null | undefined {
  if (!next) return undefined;
  if (next === "FINISHED" && current !== "FINISHED") return now;
  if (next !== "FINISHED" && current === "FINISHED") return null;
  return undefined;
}

/**
 * Whether a billing-type change is allowed. Blocked once any task is billed
 * (Perfex locks the billing type). Same type is always a no-op (allowed).
 */
export function canChangeBillingType(
  current: BillingType,
  next: BillingType,
  tasks: { billed: boolean }[],
): boolean {
  if (current === next) return true;
  return !billingTypeLocked(tasks);
}

/** Once billed, a task's rate and billable flag are locked. */
export function taskFieldsLocked(task: { billed: boolean }): boolean {
  return task.billed;
}

// ---------------------------------------------------------------------------
// Gantt / timeline geometry (pure)
// ---------------------------------------------------------------------------

export type GanttItem = { start: Date | null; end: Date | null };
export type GanttBar = { offsetPct: number; widthPct: number };

/** The min start and max end across items, used as the timeline window. */
export function ganttWindow(items: GanttItem[]): { min: Date; max: Date } | null {
  const starts = items.map((i) => i.start?.getTime()).filter((n): n is number => n != null);
  const ends = items.map((i) => i.end?.getTime()).filter((n): n is number => n != null);
  const all = [...starts, ...ends];
  if (all.length === 0) return null;
  return { min: new Date(Math.min(...all)), max: new Date(Math.max(...all)) };
}

/**
 * Position one bar within a window as left-offset and width percentages.
 * Missing dates fall back to the window edges; width is clamped to >= 1%.
 */
export function ganttBar(item: GanttItem, window: { min: Date; max: Date }): GanttBar {
  const span = window.max.getTime() - window.min.getTime();
  if (span <= 0) return { offsetPct: 0, widthPct: 100 };
  const start = (item.start ?? window.min).getTime();
  const end = (item.end ?? item.start ?? window.max).getTime();
  const offsetPct = Math.max(0, Math.min(100, ((start - window.min.getTime()) / span) * 100));
  const rawWidth = ((Math.max(end, start) - start) / span) * 100;
  const widthPct = Math.max(1, Math.min(100 - offsetPct, rawWidth));
  return { offsetPct, widthPct };
}
