import { describe, it, expect } from "vitest";
import {
  canApproveDeliverable,
  canDeliverableStart,
  canLockOptionSet,
  canSubmitDeliverable,
  computeResyncTargets,
  gruntResult,
  isAllCopyApproved,
  isAllowedDeliverableTransition,
  isAllowedStageTransition,
  isPlaybookComplete,
  isStageGateCleared,
  isStageOpenable,
  isStageReadyForReview,
  requiredChecklistComplete,
} from "./gates";
import type {
  ChecklistItemView,
  DeliverableView,
  OptionSetView,
  StageView,
} from "./gates.types";
import type { Department } from "@prisma/client";

function deliverable(over: Partial<DeliverableView> = {}): DeliverableView {
  return {
    id: "d1",
    stageId: "s1",
    department: "COPY",
    kind: "STANDARD",
    status: "IN_PROGRESS",
    isCopy: true,
    requiresGruntTest: false,
    stageStatus: "IN_PROGRESS",
    prerequisitesApproved: true,
    ...over,
  };
}

function checkItem(over: Partial<ChecklistItemView> = {}): ChecklistItemView {
  return { id: "c1", kind: "MANUAL", required: true, checked: true, ...over };
}

function optionSet(over: Partial<OptionSetView> = {}): OptionSetView {
  return { minOptions: 2, maxOptions: 3, optionCount: 2, selectedOptionId: "o1", ...over };
}

function stage(statuses: StageView["deliverableStatuses"], over: Partial<StageView> = {}): StageView {
  return { id: "s1", order: 0, status: "IN_PROGRESS", deliverableStatuses: statuses, ...over };
}

describe("isAllCopyApproved", () => {
  it("is false when there are no copy items", () => {
    expect(isAllCopyApproved([{ isCopy: false, status: "APPROVED" }])).toBe(false);
  });
  it("is false when a copy item is not approved", () => {
    expect(
      isAllCopyApproved([
        { isCopy: true, status: "APPROVED" },
        { isCopy: true, status: "SUBMITTED" },
      ]),
    ).toBe(false);
  });
  it("is true when every copy item is approved", () => {
    expect(
      isAllCopyApproved([
        { isCopy: true, status: "APPROVED" },
        { isCopy: false, status: "BLOCKED" },
      ]),
    ).toBe(true);
  });
});

describe("canDeliverableStart", () => {
  it("blocks when the stage is not open", () => {
    const res = canDeliverableStart(deliverable({ stageStatus: "LOCKED" }), { allCopyApproved: true });
    expect(res.ok).toBe(false);
  });
  it("blocks when a prerequisite is not approved", () => {
    const res = canDeliverableStart(deliverable({ prerequisitesApproved: false }), {
      allCopyApproved: true,
    });
    expect(res.ok).toBe(false);
  });
  it.each<Department>(["DESIGN", "DEV"])("blocks %s until all copy is approved", (dept) => {
    const res = canDeliverableStart(deliverable({ department: dept }), { allCopyApproved: false });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/copy is not locked/i);
  });
  it.each<Department>(["DESIGN", "DEV"])("allows %s once all copy is approved", (dept) => {
    const res = canDeliverableStart(deliverable({ department: dept }), { allCopyApproved: true });
    expect(res.ok).toBe(true);
  });
  it("allows non build departments regardless of copy", () => {
    const res = canDeliverableStart(deliverable({ department: "STRATEGY" }), {
      allCopyApproved: false,
    });
    expect(res.ok).toBe(true);
  });
});

describe("requiredChecklistComplete", () => {
  it("ignores optional items", () => {
    expect(
      requiredChecklistComplete([checkItem({ required: false, checked: false })]),
    ).toBe(true);
  });
  it("is false when a required item is unchecked", () => {
    expect(requiredChecklistComplete([checkItem({ checked: false })])).toBe(false);
  });
  it("is true when all required items are checked", () => {
    expect(
      requiredChecklistComplete([checkItem(), checkItem({ id: "c2" })]),
    ).toBe(true);
  });
});

describe("canLockOptionSet", () => {
  it("rejects a missing set", () => {
    expect(canLockOptionSet(null).ok).toBe(false);
  });
  it("rejects fewer than the minimum", () => {
    expect(canLockOptionSet(optionSet({ optionCount: 1 })).ok).toBe(false);
  });
  it("rejects more than the maximum", () => {
    expect(canLockOptionSet(optionSet({ optionCount: 4 })).ok).toBe(false);
  });
  it("rejects when no option is selected", () => {
    expect(canLockOptionSet(optionSet({ selectedOptionId: null })).ok).toBe(false);
  });
  it("allows two or three with a selection", () => {
    expect(canLockOptionSet(optionSet({ optionCount: 3 })).ok).toBe(true);
  });
});

describe("canSubmitDeliverable", () => {
  it("rejects work that is not in progress", () => {
    const res = canSubmitDeliverable(deliverable({ status: "APPROVED" }), null, [checkItem()]);
    expect(res.ok).toBe(false);
  });
  it("rejects an incomplete checklist", () => {
    const res = canSubmitDeliverable(deliverable(), null, [checkItem({ checked: false })]);
    expect(res.ok).toBe(false);
  });
  it("rejects too few options on an options deliverable", () => {
    const res = canSubmitDeliverable(
      deliverable({ kind: "OPTIONS_REQUIRED" }),
      optionSet({ optionCount: 1 }),
      [checkItem()],
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/at least 2 options/i);
  });
  it("rejects when a required grunt test has no result", () => {
    const res = canSubmitDeliverable(deliverable(), null, [
      checkItem({ kind: "GRUNT_TEST", gruntResult: "NOT_TESTED" }),
    ]);
    expect(res.ok).toBe(false);
  });
  it("allows a complete submission", () => {
    const res = canSubmitDeliverable(deliverable({ kind: "OPTIONS_REQUIRED" }), optionSet(), [
      checkItem(),
      checkItem({ id: "c2", kind: "GRUNT_TEST", gruntResult: "PASS" }),
    ]);
    expect(res.ok).toBe(true);
  });
});

describe("canApproveDeliverable", () => {
  const submitted = deliverable({ status: "SUBMITTED" });
  it("rejects a non-admin", () => {
    expect(canApproveDeliverable(submitted, null, [checkItem()], "COPY").ok).toBe(false);
  });
  it("rejects work that is not submitted", () => {
    expect(canApproveDeliverable(deliverable({ status: "IN_PROGRESS" }), null, [checkItem()], "ADMIN").ok).toBe(
      false,
    );
  });
  it("rejects an incomplete checklist", () => {
    expect(
      canApproveDeliverable(submitted, null, [checkItem({ checked: false })], "ADMIN").ok,
    ).toBe(false);
  });
  it("rejects an options deliverable with no selection", () => {
    const res = canApproveDeliverable(
      deliverable({ status: "SUBMITTED", kind: "OPTIONS_REQUIRED" }),
      optionSet({ selectedOptionId: null }),
      [checkItem()],
      "ADMIN",
    );
    expect(res.ok).toBe(false);
  });
  it("rejects a failing grunt test", () => {
    const res = canApproveDeliverable(
      submitted,
      null,
      [checkItem({ kind: "GRUNT_TEST", gruntResult: "FAIL" })],
      "ADMIN",
    );
    expect(res.ok).toBe(false);
  });
  it("rejects an incomplete playbook", () => {
    const res = canApproveDeliverable(
      deliverable({ status: "SUBMITTED", kind: "PLAYBOOK" }),
      null,
      [checkItem()],
      "ADMIN",
      { brandMessage: "x", oneLiner: "", tagline: "y" },
    );
    expect(res.ok).toBe(false);
  });
  it("approves a complete submission", () => {
    const res = canApproveDeliverable(
      submitted,
      null,
      [checkItem({ kind: "GRUNT_TEST", gruntResult: "PASS" })],
      "ADMIN",
    );
    expect(res.ok).toBe(true);
  });
});

describe("stage gates", () => {
  it("clears only when every deliverable is approved", () => {
    expect(isStageGateCleared(stage(["APPROVED", "APPROVED"]))).toBe(true);
    expect(isStageGateCleared(stage(["APPROVED", "SUBMITTED"]))).toBe(false);
    expect(isStageGateCleared(stage([]))).toBe(false);
  });
  it("is ready for review when all submitted or approved", () => {
    expect(isStageReadyForReview(stage(["SUBMITTED", "APPROVED"]))).toBe(true);
    expect(isStageReadyForReview(stage(["IN_PROGRESS", "SUBMITTED"]))).toBe(false);
  });
  it("opens the first stage freely and others only after the prior is approved", () => {
    expect(isStageOpenable(stage([], { order: 0 }), null).ok).toBe(true);
    expect(isStageOpenable(stage([]), stage([], { status: "IN_PROGRESS" })).ok).toBe(false);
    expect(isStageOpenable(stage([]), stage([], { status: "APPROVED" })).ok).toBe(true);
  });
});

describe("computeResyncTargets", () => {
  const all: DeliverableView[] = [
    deliverable({ id: "design1", department: "DESIGN", status: "IN_PROGRESS", stageId: "s2", isCopy: false }),
    deliverable({ id: "dev1", department: "DEV", status: "APPROVED", stageId: "s2", isCopy: false }),
    deliverable({ id: "dev2", department: "DEV", status: "BLOCKED", stageId: "s3", isCopy: false }),
    deliverable({ id: "copy1", department: "COPY", status: "APPROVED", stageId: "s1", isCopy: true }),
  ];
  it("pauses in-flight design and build when approved copy is reopened", () => {
    const plan = computeResyncTargets(
      deliverable({ id: "copy1", department: "COPY", status: "APPROVED", isCopy: true }),
      all,
    );
    expect(plan.shouldResync).toBe(true);
    expect(plan.deliverableIds.sort()).toEqual(["design1", "dev1"]);
    expect(plan.stageIds).toEqual(["s2"]);
  });
  it("does nothing when the changed item is not approved copy", () => {
    const plan = computeResyncTargets(
      deliverable({ id: "copy1", status: "IN_PROGRESS", isCopy: true }),
      all,
    );
    expect(plan.shouldResync).toBe(false);
    expect(plan.deliverableIds).toHaveLength(0);
  });
  it("does nothing when the changed item is not copy", () => {
    const plan = computeResyncTargets(
      deliverable({ id: "x", department: "DESIGN", status: "APPROVED", isCopy: false }),
      all,
    );
    expect(plan.shouldResync).toBe(false);
  });
});

describe("isPlaybookComplete", () => {
  it("requires brand message, one-liner, and tagline", () => {
    expect(isPlaybookComplete(null).ok).toBe(false);
    expect(isPlaybookComplete({ brandMessage: "a", oneLiner: "b", tagline: "" }).ok).toBe(false);
    expect(isPlaybookComplete({ brandMessage: "a", oneLiner: "b", tagline: "c" }).ok).toBe(true);
  });
});

describe("gruntResult", () => {
  it("passes only when all three are true", () => {
    expect(gruntResult({ passWhatOffered: true, passHowItHelps: true, passWhatToDo: true })).toBe("PASS");
    expect(gruntResult({ passWhatOffered: true, passHowItHelps: false, passWhatToDo: true })).toBe("FAIL");
  });
});

describe("transition guards", () => {
  it("allows valid deliverable transitions and rejects invalid ones", () => {
    expect(isAllowedDeliverableTransition("SUBMITTED", "APPROVED")).toBe(true);
    expect(isAllowedDeliverableTransition("APPROVED", "CHANGES_NEEDED")).toBe(true);
    expect(isAllowedDeliverableTransition("BLOCKED", "APPROVED")).toBe(false);
  });
  it("allows valid stage transitions and rejects invalid ones", () => {
    expect(isAllowedStageTransition("LOCKED", "IN_PROGRESS")).toBe(true);
    expect(isAllowedStageTransition("IN_REVIEW", "APPROVED")).toBe(true);
    expect(isAllowedStageTransition("LOCKED", "APPROVED")).toBe(false);
  });
});
