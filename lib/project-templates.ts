// Pure project-template computations. No I/O imports, so they stay
// unit-testable (mirrors lib/projects-pm.ts / lib/finance.ts). The
// prisma-backed instantiation that feeds these lives in
// lib/project-template-service.ts.
//
// Templates carry no absolute dates: a milestone or task stores day offsets
// (and SPRINT milestones a duration) which we resolve against the project's
// start date when a project is created from the template.

// ---------------------------------------------------------------------------
// Offset -> date resolution
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Resolve a day offset against a project start date. A null/undefined offset
 * (or a missing start date) resolves to null, so an undated template stays
 * undated. Offsets may be negative (e.g. pre-kickoff prep).
 */
export function resolveOffsetDate(
  start: Date | null | undefined,
  offsetDays: number | null | undefined,
): Date | null {
  if (!start || offsetDays == null || !Number.isFinite(offsetDays)) return null;
  return new Date(start.getTime() + Math.round(offsetDays) * MS_PER_DAY);
}

export type ResolvedTaskDates = { startDate: Date | null; dueDate: Date | null };

/**
 * Resolve a template task's start/due offsets against the project start date.
 * If both resolve and the due date lands before the start date, the due date
 * is clamped up to the start so a task is never due before it begins.
 */
export function resolveTaskDates(
  start: Date | null | undefined,
  startOffsetDays: number | null | undefined,
  dueOffsetDays: number | null | undefined,
): ResolvedTaskDates {
  const startDate = resolveOffsetDate(start, startOffsetDays);
  let dueDate = resolveOffsetDate(start, dueOffsetDays);
  if (startDate && dueDate && dueDate.getTime() < startDate.getTime()) {
    dueDate = startDate;
  }
  return { startDate, dueDate };
}

// ---------------------------------------------------------------------------
// Sprint-window maths (milestones-as-sprints)
// ---------------------------------------------------------------------------

export type SprintWindow = { startDate: Date | null; dueDate: Date | null };

/**
 * The date window for a sprint milestone. Sprints run back to back from the
 * project start: sprint at `sprintIndex` (0-based) starts after the preceding
 * sprints' durations and runs for `durationDays`. The due date is the last day
 * of the window (start + durationDays - 1) so a 14 day sprint spans 14 days
 * inclusive rather than bleeding into the next sprint's first day.
 *
 * With no start date the window is null (an undated template). A non-positive
 * or missing duration falls back to one day so the window is always valid.
 */
export function sprintWindow(
  start: Date | null | undefined,
  sprintIndex: number,
  durationDays: number | null | undefined,
): SprintWindow {
  if (!start) return { startDate: null, dueDate: null };
  const duration = durationDays && durationDays > 0 ? Math.round(durationDays) : 1;
  const index = Number.isFinite(sprintIndex) && sprintIndex > 0 ? Math.round(sprintIndex) : 0;
  const startDate = new Date(start.getTime() + index * duration * MS_PER_DAY);
  const dueDate = new Date(startDate.getTime() + (duration - 1) * MS_PER_DAY);
  return { startDate, dueDate };
}

/**
 * Resolve a milestone's due date. A SPRINT milestone (has durationDays and a
 * sprintIndex) uses its sprint window's due date; otherwise a plain milestone
 * resolves its dueOffsetDays against the project start. Returns null when
 * undated.
 */
export function resolveMilestoneDueDate(
  start: Date | null | undefined,
  input: {
    dueOffsetDays?: number | null;
    durationDays?: number | null;
    sprintIndex?: number | null;
  },
): Date | null {
  if (input.durationDays != null && input.sprintIndex != null) {
    return sprintWindow(start, input.sprintIndex, input.durationDays).dueDate;
  }
  return resolveOffsetDate(start, input.dueOffsetDays);
}

// ---------------------------------------------------------------------------
// Validation / labelling helpers
// ---------------------------------------------------------------------------

export type TemplateKind = "PROCESS" | "SPRINT" | "UNSTRUCTURED";

/** Whether a template kind seeds any milestones/tasks at all. */
export function templateSeedsContent(kind: TemplateKind): boolean {
  return kind !== "UNSTRUCTURED";
}
