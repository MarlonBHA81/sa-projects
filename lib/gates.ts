// The BRS gate and verification state machine. Pure functions: data in,
// decision out, zero I/O. This is the single source of truth for the rules
// (copy before build, options before commitment, verification, resync,
// playbook completeness) and the most heavily tested code in the app.

import {
  ALLOW,
  deny,
  type ChecklistItemView,
  type CopyApprovalItem,
  type DeliverableView,
  type GateResult,
  type GruntBooleans,
  type OptionSetView,
  type PlaybookView,
  type ResyncPlan,
  type StageView,
} from "./gates.types";
import type { DeliverableStatus, GruntTestResult, Role, StageStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Copy before build
// ---------------------------------------------------------------------------

/** Is all copy for a build approved? At least one copy item, and every one APPROVED. */
export function isAllCopyApproved(items: CopyApprovalItem[]): boolean {
  const copy = items.filter((i) => i.isCopy);
  return copy.length > 0 && copy.every((i) => i.status === "APPROVED");
}

/** Can this deliverable be started right now? */
export function canDeliverableStart(
  d: DeliverableView,
  ctx: { allCopyApproved: boolean },
): GateResult {
  if (d.stageStatus !== "IN_PROGRESS") {
    return deny("This stage is not open yet");
  }
  if (!d.prerequisitesApproved) {
    return deny("A prerequisite is not approved yet");
  }
  if ((d.department === "DESIGN" || d.department === "DEV") && !ctx.allCopyApproved) {
    return deny("Copy is not locked yet, so design and build cannot start");
  }
  return ALLOW;
}

// ---------------------------------------------------------------------------
// Verification checklist
// ---------------------------------------------------------------------------

/** Every required checklist item must be checked (verify and check against all). */
export function requiredChecklistComplete(items: ChecklistItemView[]): boolean {
  return items.filter((i) => i.required).every((i) => i.checked);
}

/** Every required grunt-test checklist item must have a PASS result. */
export function requiredGruntTestsPass(items: ChecklistItemView[]): boolean {
  return items
    .filter((i) => i.required && i.kind === "GRUNT_TEST")
    .every((i) => i.gruntResult === "PASS");
}

/** A required grunt-test item exists and at least carries a recorded result. */
function requiredGruntTestsRecorded(items: ChecklistItemView[]): boolean {
  return items
    .filter((i) => i.required && i.kind === "GRUNT_TEST")
    .every((i) => i.gruntResult != null && i.gruntResult !== "NOT_TESTED");
}

// ---------------------------------------------------------------------------
// Options before commitment
// ---------------------------------------------------------------------------

/** Can this option set be locked / selected? At least min, at most max, and a selection. */
export function canLockOptionSet(opts: OptionSetView | null): GateResult {
  if (!opts) return deny("This element has no options to lock");
  if (opts.optionCount < opts.minOptions) {
    return deny(`Add at least ${opts.minOptions} options before this can be locked`);
  }
  if (opts.optionCount > opts.maxOptions) {
    return deny(`Keep this to at most ${opts.maxOptions} options`);
  }
  if (!opts.selectedOptionId) {
    return deny("Choose one option before this can be locked");
  }
  return ALLOW;
}

// ---------------------------------------------------------------------------
// Submit / approve
// ---------------------------------------------------------------------------

/** Can the owning department submit this for approval? */
export function canSubmitDeliverable(
  d: DeliverableView,
  opts: OptionSetView | null,
  checklist: ChecklistItemView[],
): GateResult {
  if (d.status !== "IN_PROGRESS" && d.status !== "CHANGES_NEEDED") {
    return deny("Only work in progress can be submitted");
  }
  if (!requiredChecklistComplete(checklist)) {
    return deny("Complete the checklist before submitting");
  }
  if (d.kind === "OPTIONS_REQUIRED") {
    const min = opts?.minOptions ?? 2;
    if (!opts || opts.optionCount < min) {
      return deny(`Add at least ${min} options so the approver has a real choice`);
    }
  }
  if (!requiredGruntTestsRecorded(checklist)) {
    return deny("Record the grunt test before submitting");
  }
  return ALLOW;
}

/** Can the approver (ADMIN) approve this deliverable right now? */
export function canApproveDeliverable(
  d: DeliverableView,
  opts: OptionSetView | null,
  checklist: ChecklistItemView[],
  actorRole: Role,
  playbook?: PlaybookView | null,
  openChangeRequests = 0,
): GateResult {
  if (actorRole !== "ADMIN" && actorRole !== "SUPER_ADMIN") {
    return deny("Only the approver can clear this gate");
  }
  if (d.status !== "SUBMITTED") {
    return deny("Only submitted work can be approved");
  }
  if (!requiredChecklistComplete(checklist)) {
    return deny("The checklist is not complete");
  }
  if (d.kind === "OPTIONS_REQUIRED") {
    const lock = canLockOptionSet(opts);
    if (!lock.ok) return lock;
  }
  if (!requiredGruntTestsPass(checklist)) {
    return deny("The grunt test must pass before approval");
  }
  if (d.kind === "PLAYBOOK") {
    const complete = isPlaybookComplete(playbook ?? null);
    if (!complete.ok) return complete;
  }
  if (d.requireReviewResolved && openChangeRequests > 0) {
    return deny("Resolve the open change requests first");
  }
  return ALLOW;
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/** A stage's gate is cleared when every deliverable in it is APPROVED. */
export function isStageGateCleared(stage: StageView): boolean {
  return (
    stage.deliverableStatuses.length > 0 &&
    stage.deliverableStatuses.every((s) => s === "APPROVED")
  );
}

/** May a locked stage be opened? Only when the prior stage is approved. */
export function isStageOpenable(stage: StageView, prior: StageView | null): GateResult {
  if (prior === null) return ALLOW;
  if (prior.status !== "APPROVED") {
    return deny("The previous stage must be approved first");
  }
  return ALLOW;
}

/** Are all deliverables in a stage submitted or approved (ready for review)? */
export function isStageReadyForReview(stage: StageView): boolean {
  return (
    stage.deliverableStatuses.length > 0 &&
    stage.deliverableStatuses.every((s) => s === "SUBMITTED" || s === "APPROVED")
  );
}

// ---------------------------------------------------------------------------
// Resync when approved copy changes
// ---------------------------------------------------------------------------

const RESYNC_STATUSES: DeliverableStatus[] = ["IN_PROGRESS", "SUBMITTED", "APPROVED"];

/**
 * When an approved copy deliverable is reopened, every in-flight or approved
 * design/dev deliverable (and its stage) must pause and re-sync.
 */
export function computeResyncTargets(
  changedCopy: DeliverableView,
  all: DeliverableView[],
): ResyncPlan {
  const shouldResync = changedCopy.isCopy && changedCopy.status === "APPROVED";
  if (!shouldResync) {
    return { shouldResync: false, deliverableIds: [], stageIds: [] };
  }
  const targets = all.filter(
    (d) =>
      (d.department === "DESIGN" || d.department === "DEV") &&
      RESYNC_STATUSES.includes(d.status),
  );
  const stageIds = Array.from(new Set(targets.map((d) => d.stageId)));
  return {
    shouldResync: true,
    deliverableIds: targets.map((d) => d.id),
    stageIds,
  };
}

// ---------------------------------------------------------------------------
// Brand Messaging Playbook
// ---------------------------------------------------------------------------

/** The playbook needs a brand message, one-liner, and tagline; bios and pitch are optional. */
export function isPlaybookComplete(p: PlaybookView | null): GateResult {
  if (!p) return deny("The playbook is empty");
  const filled = (v?: string | null) => typeof v === "string" && v.trim().length > 0;
  if (!filled(p.brandMessage)) return deny("Add the brand message");
  if (!filled(p.oneLiner)) return deny("Add the one-liner");
  if (!filled(p.tagline)) return deny("Add the tag-line");
  return ALLOW;
}

// ---------------------------------------------------------------------------
// Grunt test
// ---------------------------------------------------------------------------

/** PASS only when a stranger gets all three: what is offered, how it helps, what to do next. */
export function gruntResult(c: GruntBooleans): GruntTestResult {
  return c.passWhatOffered && c.passHowItHelps && c.passWhatToDo ? "PASS" : "FAIL";
}

// ---------------------------------------------------------------------------
// Transition guards
// ---------------------------------------------------------------------------

const DELIVERABLE_TRANSITIONS: Record<DeliverableStatus, DeliverableStatus[]> = {
  BLOCKED: ["NOT_STARTED"],
  NOT_STARTED: ["IN_PROGRESS", "BLOCKED"],
  IN_PROGRESS: ["SUBMITTED", "PAUSED"],
  SUBMITTED: ["APPROVED", "CHANGES_NEEDED"],
  CHANGES_NEEDED: ["IN_PROGRESS"],
  APPROVED: ["PAUSED", "CHANGES_NEEDED"],
  PAUSED: ["IN_PROGRESS"],
};

export function isAllowedDeliverableTransition(
  from: DeliverableStatus,
  to: DeliverableStatus,
): boolean {
  return DELIVERABLE_TRANSITIONS[from]?.includes(to) ?? false;
}

const STAGE_TRANSITIONS: Record<StageStatus, StageStatus[]> = {
  LOCKED: ["IN_PROGRESS"],
  IN_PROGRESS: ["IN_REVIEW", "PAUSED"],
  IN_REVIEW: ["APPROVED", "IN_PROGRESS"],
  APPROVED: ["PAUSED"],
  PAUSED: ["IN_PROGRESS"],
};

export function isAllowedStageTransition(from: StageStatus, to: StageStatus): boolean {
  return STAGE_TRANSITIONS[from]?.includes(to) ?? false;
}
