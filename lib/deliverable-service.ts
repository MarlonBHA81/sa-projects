// Orchestration: load data, call the pure gate functions, write the state
// change together with an Activity (and fire an n8n event). This is the only
// place that mutates gate-relevant state, so the rules have a single choke point.

import { prisma } from "./db";
import {
  canApproveDeliverable,
  canDeliverableStart,
  canLockOptionSet,
  canSubmitDeliverable,
  computeResyncTargets,
  gruntResult,
  isAllCopyApproved,
  isStageGateCleared,
  isStageReadyForReview,
} from "./gates";
import type {
  ChecklistItemView,
  DeliverableView,
  GruntBooleans,
  OptionSetView,
} from "./gates.types";
import { emitEvent } from "./n8n/notify";
import { AuthError, canActOnDepartment, type SessionUser } from "./auth-helpers";
import type { Prisma } from "@prisma/client";

export class GateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GateError";
  }
}

// ---------------------------------------------------------------------------
// Loading + mapping to gate views
// ---------------------------------------------------------------------------

const deliverableInclude = {
  stage: true,
  optionSet: { include: { options: { select: { id: true } } } },
  checklistItems: {
    include: { gruntTest: { select: { result: true } } },
    orderBy: { order: "asc" },
  },
  dependsOn: { include: { prerequisite: { select: { status: true } } } },
  brandPlaybook: true,
} satisfies Prisma.DeliverableInclude;

type LoadedDeliverable = Prisma.DeliverableGetPayload<{ include: typeof deliverableInclude }>;

async function loadDeliverable(id: string): Promise<LoadedDeliverable> {
  const d = await prisma.deliverable.findUnique({ where: { id }, include: deliverableInclude });
  if (!d) throw new GateError("Deliverable not found");
  return d;
}

function toDeliverableView(d: LoadedDeliverable): DeliverableView {
  return {
    id: d.id,
    stageId: d.stageId,
    department: d.department,
    kind: d.kind,
    status: d.status,
    isCopy: d.isCopy,
    requiresGruntTest: d.requiresGruntTest,
    stageStatus: d.stage.status,
    prerequisitesApproved: d.dependsOn.every((dep) => dep.prerequisite.status === "APPROVED"),
  };
}

function toChecklistView(d: LoadedDeliverable): ChecklistItemView[] {
  return d.checklistItems.map((i) => ({
    id: i.id,
    kind: i.kind,
    required: i.required,
    checked: i.checked,
    gruntResult: i.gruntTest?.result ?? null,
  }));
}

function toOptionSetView(d: LoadedDeliverable): OptionSetView | null {
  if (!d.optionSet) return null;
  return {
    minOptions: d.optionSet.minOptions,
    maxOptions: d.optionSet.maxOptions,
    optionCount: d.optionSet.options.length,
    selectedOptionId: d.optionSet.selectedOptionId,
  };
}

async function allCopyApprovedForBuild(funnelBuildId: string): Promise<boolean> {
  const items = await prisma.deliverable.findMany({
    where: { funnelBuildId },
    select: { isCopy: true, status: true },
  });
  return isAllCopyApproved(items);
}

function requireOwner(actor: SessionUser, department: LoadedDeliverable["department"]) {
  if (!canActOnDepartment(actor, department)) {
    throw new AuthError("This work belongs to another department");
  }
}

// ---------------------------------------------------------------------------
// Build progression: idempotent full recompute used after any gate change
// ---------------------------------------------------------------------------

async function progressBuild(tx: Prisma.TransactionClient, funnelBuildId: string): Promise<void> {
  const build = await tx.funnelBuild.findUniqueOrThrow({
    where: { id: funnelBuildId },
    include: {
      stages: { orderBy: { order: "asc" } },
      deliverables: {
        include: { dependsOn: { include: { prerequisite: { select: { status: true } } } } },
      },
    },
  });

  const stages = build.stages;
  const byStage = new Map<string, typeof build.deliverables>();
  for (const d of build.deliverables) {
    const list = byStage.get(d.stageId);
    if (list) list.push(d);
    else byStage.set(d.stageId, [d]);
  }
  const allCopyApproved = isAllCopyApproved(
    build.deliverables.map((d) => ({ isCopy: d.isCopy, status: d.status })),
  );

  // Step 0/1: review and approval status per stage.
  for (const st of stages) {
    const ds = byStage.get(st.id) ?? [];
    if (ds.length === 0) continue;
    if (st.status !== "IN_PROGRESS" && st.status !== "IN_REVIEW") continue;
    const allApproved = ds.every((d) => d.status === "APPROVED");
    const ready = ds.every((d) => d.status === "SUBMITTED" || d.status === "APPROVED");
    if (allApproved) {
      await tx.stage.update({ where: { id: st.id }, data: { status: "APPROVED", approvedAt: new Date() } });
      st.status = "APPROVED";
    } else if (ready && st.status !== "IN_REVIEW") {
      await tx.stage.update({ where: { id: st.id }, data: { status: "IN_REVIEW" } });
      st.status = "IN_REVIEW";
    } else if (!ready && st.status === "IN_REVIEW") {
      await tx.stage.update({ where: { id: st.id }, data: { status: "IN_PROGRESS" } });
      st.status = "IN_PROGRESS";
    }
  }

  // Step 2: open the next locked stage once the prior is approved.
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    if (st.status !== "LOCKED") continue;
    const prior = i > 0 ? stages[i - 1] : null;
    if (!prior || prior.status === "APPROVED") {
      await tx.stage.update({ where: { id: st.id }, data: { status: "IN_PROGRESS" } });
      st.status = "IN_PROGRESS";
    }
  }

  // Step 3: unblock deliverables that can now start.
  for (const d of build.deliverables) {
    if (d.status !== "BLOCKED") continue;
    const stageStatus = stages.find((s) => s.id === d.stageId)?.status ?? "LOCKED";
    const view: DeliverableView = {
      id: d.id,
      stageId: d.stageId,
      department: d.department,
      kind: d.kind,
      status: d.status,
      isCopy: d.isCopy,
      requiresGruntTest: d.requiresGruntTest,
      stageStatus,
      prerequisitesApproved: d.dependsOn.every((dep) => dep.prerequisite.status === "APPROVED"),
    };
    if (canDeliverableStart(view, { allCopyApproved }).ok) {
      await tx.deliverable.update({ where: { id: d.id }, data: { status: "NOT_STARTED" } });
    }
  }
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export async function startDeliverable(deliverableId: string, actor: SessionUser): Promise<void> {
  const d = await loadDeliverable(deliverableId);
  requireOwner(actor, d.department);

  if (d.status === "CHANGES_NEEDED" || d.status === "PAUSED") {
    await prisma.$transaction([
      prisma.deliverable.update({ where: { id: d.id }, data: { status: "IN_PROGRESS" } }),
      prisma.activity.create({
        data: {
          type: "DELIVERABLE_STARTED",
          funnelBuildId: d.funnelBuildId,
          deliverableId: d.id,
          actorId: actor.id,
          summary: `Resumed "${d.title}"`,
        },
      }),
    ]);
    return;
  }

  if (d.status !== "NOT_STARTED") {
    throw new GateError("This work cannot be started from its current state");
  }
  const allCopyApproved = await allCopyApprovedForBuild(d.funnelBuildId);
  const res = canDeliverableStart(toDeliverableView(d), { allCopyApproved });
  if (!res.ok) throw new GateError(res.reason ?? "Cannot start yet");

  await prisma.$transaction([
    prisma.deliverable.update({
      where: { id: d.id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    }),
    prisma.activity.create({
      data: {
        type: "DELIVERABLE_STARTED",
        funnelBuildId: d.funnelBuildId,
        deliverableId: d.id,
        actorId: actor.id,
        summary: `Started "${d.title}"`,
      },
    }),
  ]);
}

export async function submitDeliverable(deliverableId: string, actor: SessionUser): Promise<void> {
  const d = await loadDeliverable(deliverableId);
  requireOwner(actor, d.department);

  const res = canSubmitDeliverable(toDeliverableView(d), toOptionSetView(d), toChecklistView(d));
  if (!res.ok) throw new GateError(res.reason ?? "Cannot submit yet");

  await prisma.$transaction(async (tx) => {
    await tx.deliverable.update({ where: { id: d.id }, data: { status: "SUBMITTED" } });
    await tx.activity.create({
      data: {
        type: "DELIVERABLE_SUBMITTED",
        funnelBuildId: d.funnelBuildId,
        deliverableId: d.id,
        actorId: actor.id,
        summary: `Submitted "${d.title}" for approval`,
      },
    });
    await progressBuild(tx, d.funnelBuildId);
  });

  void emitEvent({
    type: "DELIVERABLE_SUBMITTED",
    summary: `${d.title} submitted for approval`,
    buildId: d.funnelBuildId,
    deliverableId: d.id,
  });
}

export async function approveDeliverable(deliverableId: string, actor: SessionUser): Promise<void> {
  if (actor.role !== "ADMIN") throw new AuthError("Only the approver can clear this gate");
  const d = await loadDeliverable(deliverableId);

  const playbook = d.brandPlaybook
    ? {
        brandMessage: d.brandPlaybook.brandMessage,
        oneLiner: d.brandPlaybook.oneLiner,
        tagline: d.brandPlaybook.tagline,
      }
    : null;

  const res = canApproveDeliverable(
    toDeliverableView(d),
    toOptionSetView(d),
    toChecklistView(d),
    actor.role,
    playbook,
  );
  if (!res.ok) throw new GateError(res.reason ?? "Cannot approve yet");

  const clearedStages: string[] = [];
  await prisma.$transaction(async (tx) => {
    const before = await tx.stage.findMany({
      where: { funnelBuildId: d.funnelBuildId },
      select: { id: true, status: true, key: true },
    });
    await tx.deliverable.update({
      where: { id: d.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
    await tx.approval.create({
      data: { deliverableId: d.id, approverId: actor.id, decision: "APPROVED" },
    });
    await tx.activity.create({
      data: {
        type: "DELIVERABLE_APPROVED",
        funnelBuildId: d.funnelBuildId,
        deliverableId: d.id,
        actorId: actor.id,
        summary: `Approved "${d.title}"`,
      },
    });
    await progressBuild(tx, d.funnelBuildId);

    const after = await tx.stage.findMany({
      where: { funnelBuildId: d.funnelBuildId },
      select: { id: true, status: true, key: true, title: true },
    });
    for (const s of after) {
      const prev = before.find((b) => b.id === s.id);
      if (prev && prev.status !== "APPROVED" && s.status === "APPROVED") {
        clearedStages.push(s.title);
        await tx.activity.create({
          data: {
            type: "STAGE_GATE_CLEARED",
            funnelBuildId: d.funnelBuildId,
            actorId: actor.id,
            summary: `Stage gate cleared: ${s.title}`,
          },
        });
      }
    }
  });

  void emitEvent({
    type: "DELIVERABLE_APPROVED",
    summary: `${d.title} approved`,
    buildId: d.funnelBuildId,
    deliverableId: d.id,
  });
  for (const title of clearedStages) {
    void emitEvent({
      type: "STAGE_GATE_CLEARED",
      summary: `Stage gate cleared: ${title}`,
      buildId: d.funnelBuildId,
    });
  }
}

export async function requestChanges(
  deliverableId: string,
  note: string | undefined,
  actor: SessionUser,
): Promise<void> {
  if (actor.role !== "ADMIN") throw new AuthError("Only the approver can request changes");
  const d = await loadDeliverable(deliverableId);
  if (d.status !== "SUBMITTED") throw new GateError("Only submitted work can be sent back");

  await prisma.$transaction(async (tx) => {
    await tx.deliverable.update({ where: { id: d.id }, data: { status: "CHANGES_NEEDED" } });
    await tx.approval.create({
      data: { deliverableId: d.id, approverId: actor.id, decision: "CHANGES_NEEDED", note },
    });
    await tx.activity.create({
      data: {
        type: "DELIVERABLE_CHANGES_NEEDED",
        funnelBuildId: d.funnelBuildId,
        deliverableId: d.id,
        actorId: actor.id,
        summary: `Requested changes on "${d.title}"${note ? `: ${note}` : ""}`,
      },
    });
    await progressBuild(tx, d.funnelBuildId);
  });

  void emitEvent({
    type: "DELIVERABLE_CHANGES_NEEDED",
    summary: `Changes requested on ${d.title}`,
    buildId: d.funnelBuildId,
    deliverableId: d.id,
  });
}

export async function addOption(
  deliverableId: string,
  input: { label: string; content: unknown; rationale?: string },
  actor: SessionUser,
): Promise<void> {
  const d = await loadDeliverable(deliverableId);
  requireOwner(actor, d.department);
  if (!d.optionSet) throw new GateError("This deliverable has no option set");

  await prisma.$transaction([
    prisma.option.create({
      data: {
        optionSetId: d.optionSet.id,
        label: input.label,
        content: (input.content ?? {}) as Prisma.InputJsonValue,
        rationale: input.rationale,
      },
    }),
    prisma.activity.create({
      data: {
        type: "OPTION_ADDED",
        funnelBuildId: d.funnelBuildId,
        deliverableId: d.id,
        actorId: actor.id,
        summary: `Added option "${input.label}" to "${d.title}"`,
      },
    }),
  ]);
}

export async function selectOption(
  deliverableId: string,
  optionId: string,
  actor: SessionUser,
): Promise<void> {
  if (actor.role !== "ADMIN") throw new AuthError("Only the approver can select the winning option");
  const d = await loadDeliverable(deliverableId);
  if (!d.optionSet) throw new GateError("This deliverable has no option set");
  const belongs = d.optionSet.options.some((o) => o.id === optionId);
  if (!belongs) throw new GateError("That option is not part of this set");

  await prisma.$transaction([
    prisma.optionSet.update({
      where: { id: d.optionSet.id },
      data: { selectedOptionId: optionId, selectedAt: new Date(), selectedById: actor.id },
    }),
    prisma.activity.create({
      data: {
        type: "OPTION_SELECTED",
        funnelBuildId: d.funnelBuildId,
        deliverableId: d.id,
        actorId: actor.id,
        summary: `Selected an option for "${d.title}"`,
      },
    }),
  ]);
}

export async function recordGruntTest(
  deliverableId: string,
  input: GruntBooleans & { checklistItemId?: string; testedText: string; note?: string; optionId?: string },
  actor: SessionUser,
): Promise<void> {
  const d = await loadDeliverable(deliverableId);
  requireOwner(actor, d.department);
  const result = gruntResult(input);

  await prisma.$transaction(async (tx) => {
    if (input.checklistItemId) {
      const existing = await tx.gruntTestCheck.findUnique({
        where: { checklistItemId: input.checklistItemId },
      });
      if (existing) {
        await tx.gruntTestCheck.update({
          where: { id: existing.id },
          data: {
            passWhatOffered: input.passWhatOffered,
            passHowItHelps: input.passHowItHelps,
            passWhatToDo: input.passWhatToDo,
            result,
            testedText: input.testedText,
            note: input.note,
            testedById: actor.id,
            optionId: input.optionId,
          },
        });
      } else {
        await tx.gruntTestCheck.create({
          data: {
            deliverableId: d.id,
            checklistItemId: input.checklistItemId,
            optionId: input.optionId,
            passWhatOffered: input.passWhatOffered,
            passHowItHelps: input.passHowItHelps,
            passWhatToDo: input.passWhatToDo,
            result,
            testedText: input.testedText,
            note: input.note,
            testedById: actor.id,
          },
        });
      }
      // A pass verifies the checklist item; a fail un-checks it.
      await tx.checklistItem.update({
        where: { id: input.checklistItemId },
        data: {
          checked: result === "PASS",
          checkedById: result === "PASS" ? actor.id : null,
          checkedAt: result === "PASS" ? new Date() : null,
        },
      });
    } else {
      await tx.gruntTestCheck.create({
        data: {
          deliverableId: d.id,
          optionId: input.optionId,
          passWhatOffered: input.passWhatOffered,
          passHowItHelps: input.passHowItHelps,
          passWhatToDo: input.passWhatToDo,
          result,
          testedText: input.testedText,
          note: input.note,
          testedById: actor.id,
        },
      });
    }
    await tx.activity.create({
      data: {
        type: "GRUNT_TEST_RECORDED",
        funnelBuildId: d.funnelBuildId,
        deliverableId: d.id,
        actorId: actor.id,
        summary: `Grunt test on "${d.title}": ${result}`,
      },
    });
  });
}

export async function setChecklistItem(
  itemId: string,
  checked: boolean,
  actor: SessionUser,
): Promise<void> {
  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    include: { deliverable: { select: { department: true, funnelBuildId: true, title: true } } },
  });
  if (!item) throw new GateError("Checklist item not found");
  requireOwner(actor, item.deliverable.department);

  await prisma.checklistItem.update({
    where: { id: itemId },
    data: {
      checked,
      checkedById: checked ? actor.id : null,
      checkedAt: checked ? new Date() : null,
    },
  });
}

export async function savePlaybook(
  funnelBuildId: string,
  fields: { brandMessage?: string; oneLiner?: string; tagline?: string; salesPitch?: string; bios?: unknown },
  actor: SessionUser,
): Promise<void> {
  const playbook = await prisma.brandPlaybook.findUnique({
    where: { funnelBuildId },
    include: { deliverable: { select: { id: true, title: true, department: true } } },
  });
  if (!playbook) throw new GateError("This build has no playbook");
  requireOwner(actor, playbook.deliverable.department);

  await prisma.$transaction([
    prisma.brandPlaybook.update({
      where: { funnelBuildId },
      data: {
        brandMessage: fields.brandMessage,
        oneLiner: fields.oneLiner,
        tagline: fields.tagline,
        salesPitch: fields.salesPitch,
        bios: (fields.bios ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    }),
    prisma.activity.create({
      data: {
        type: "PLAYBOOK_UPDATED",
        funnelBuildId,
        deliverableId: playbook.deliverableId,
        actorId: actor.id,
        summary: "Updated the Brand Messaging Playbook",
      },
    }),
  ]);
}

export async function reopenCopy(deliverableId: string, actor: SessionUser): Promise<void> {
  if (actor.role !== "ADMIN") throw new AuthError("Only the approver can reopen locked copy");
  const d = await loadDeliverable(deliverableId);
  if (!d.isCopy || d.status !== "APPROVED") {
    throw new GateError("Only approved copy can be reopened");
  }

  const all = await prisma.deliverable.findMany({
    where: { funnelBuildId: d.funnelBuildId },
    select: { id: true, department: true, status: true, stageId: true },
  });
  const plan = computeResyncTargets(toDeliverableView(d), [
    ...all.map((x) => ({
      id: x.id,
      stageId: x.stageId,
      department: x.department,
      kind: "STANDARD" as const,
      status: x.status,
      isCopy: false,
      requiresGruntTest: false,
      stageStatus: "IN_PROGRESS" as const,
      prerequisitesApproved: true,
    })),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.deliverable.update({ where: { id: d.id }, data: { status: "CHANGES_NEEDED" } });
    if (plan.deliverableIds.length) {
      await tx.deliverable.updateMany({
        where: { id: { in: plan.deliverableIds } },
        data: { status: "PAUSED" },
      });
    }
    if (plan.stageIds.length) {
      await tx.stage.updateMany({
        where: { id: { in: plan.stageIds }, status: { in: ["IN_PROGRESS", "IN_REVIEW", "APPROVED"] } },
        data: { status: "PAUSED" },
      });
    }
    await tx.activity.create({
      data: {
        type: "COPY_CHANGED_RESYNC",
        funnelBuildId: d.funnelBuildId,
        deliverableId: d.id,
        actorId: actor.id,
        summary: `Copy "${d.title}" reopened. Design and build paused to re-sync.`,
      },
    });
    await tx.comment.create({
      data: {
        body: "Copy changed. Design and build are paused. Re-sync before you carry on.",
        isHandoff: true,
        authorId: actor.id,
        funnelBuildId: d.funnelBuildId,
        fromDept: "COPY",
      },
    });
  });

  void emitEvent({
    type: "COPY_CHANGED_RESYNC",
    summary: `Copy reopened on ${d.title}; design and build paused`,
    buildId: d.funnelBuildId,
    deliverableId: d.id,
  });
}

export async function setProcessStepStatus(
  stepId: string,
  done: boolean,
  actor: SessionUser,
): Promise<void> {
  const step = await prisma.processStep.findUnique({
    where: { id: stepId },
    include: { deliverable: { select: { department: true } } },
  });
  if (!step) throw new GateError("Step not found");
  requireOwner(actor, step.deliverable.department);
  await prisma.processStep.update({
    where: { id: stepId },
    data: { status: done ? "DONE" : "TODO" },
  });
}

export async function saveDeliverableBody(
  deliverableId: string,
  body: unknown,
  actor: SessionUser,
): Promise<void> {
  const d = await loadDeliverable(deliverableId);
  requireOwner(actor, d.department);
  await prisma.deliverable.update({
    where: { id: d.id },
    data: { body: (body ?? undefined) as Prisma.InputJsonValue | undefined },
  });
}

export async function addComment(
  input: { deliverableId?: string; funnelBuildId: string; body: string; isHandoff?: boolean },
  actor: SessionUser,
): Promise<void> {
  if (!input.body.trim()) return;
  await prisma.$transaction([
    prisma.comment.create({
      data: {
        body: input.body.trim(),
        isHandoff: input.isHandoff ?? false,
        authorId: actor.id,
        deliverableId: input.deliverableId,
        funnelBuildId: input.funnelBuildId,
        fromDept: actor.department ?? undefined,
      },
    }),
    prisma.activity.create({
      data: {
        type: "COMMENT_ADDED",
        funnelBuildId: input.funnelBuildId,
        deliverableId: input.deliverableId,
        actorId: actor.id,
        summary: `Commented on ${input.deliverableId ? "a deliverable" : "the build"}`,
      },
    }),
  ]);
}
