"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import {
  addComment,
  addOption,
  approveDeliverable,
  recordGruntTest,
  reopenCopy,
  requestChanges,
  saveDeliverableBody,
  selectOption,
  setChecklistItem,
  setProcessStepStatus,
  startDeliverable,
  submitDeliverable,
} from "@/lib/deliverable-service";
import {
  assignDeliverable,
  logTime,
  setDueDate,
  setEstimateMinutes,
  startTimer,
  stopTimer,
} from "@/lib/time";
import { reviewDeliverable } from "@/lib/ai/analyse";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "");
}
function on(fd: FormData, key: string): boolean {
  return fd.get(key) != null;
}

async function finish(buildId: string, deliverableId: string, fn: () => Promise<void>) {
  const path = `/builds/${buildId}/deliverables/${deliverableId}`;
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong";
    redirect(`${path}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(path);
  revalidatePath(`/builds/${buildId}`);
  redirect(path);
}

export async function startAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  await finish(buildId, id, () => startDeliverable(id, user));
}

export async function submitAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  await finish(buildId, id, async () => {
    await submitDeliverable(id, user);
    // Best-effort advisory review on submit; never blocks the action.
    void reviewDeliverable(id, user.id).catch(() => {});
  });
}

export async function analyseDeliverableAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  await finish(buildId, id, async () => {
    await reviewDeliverable(id, user.id);
  });
}

export async function approveAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  await finish(buildId, id, () => approveDeliverable(id, user));
}

export async function requestChangesAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  const note = str(fd, "note");
  await finish(buildId, id, () => requestChanges(id, note || undefined, user));
}

export async function reopenCopyAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  await finish(buildId, id, () => reopenCopy(id, user));
}

export async function selectOptionAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  const optionId = str(fd, "optionId");
  await finish(buildId, id, () => selectOption(id, optionId, user));
}

export async function addOptionAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  await finish(buildId, id, () =>
    addOption(
      id,
      { label: str(fd, "label"), content: { text: str(fd, "content") }, rationale: str(fd, "rationale") || undefined },
      user,
    ),
  );
}

export async function recordGruntTestAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  await finish(buildId, id, () =>
    recordGruntTest(
      id,
      {
        checklistItemId: str(fd, "checklistItemId") || undefined,
        testedText: str(fd, "testedText"),
        note: str(fd, "note") || undefined,
        passWhatOffered: on(fd, "passWhatOffered"),
        passHowItHelps: on(fd, "passHowItHelps"),
        passWhatToDo: on(fd, "passWhatToDo"),
      },
      user,
    ),
  );
}

export async function setChecklistAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  const itemId = str(fd, "itemId");
  const checked = str(fd, "checked") === "true";
  await finish(buildId, id, () => setChecklistItem(itemId, checked, user));
}

export async function setStepAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  const stepId = str(fd, "stepId");
  const done = str(fd, "done") === "true";
  await finish(buildId, id, () => setProcessStepStatus(stepId, done, user));
}

export async function saveBodyAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  await finish(buildId, id, () => saveDeliverableBody(id, { text: str(fd, "body") }, user));
}

export async function addCommentAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  await finish(buildId, id, () =>
    addComment(
      { deliverableId: id, funnelBuildId: buildId, body: str(fd, "body"), isHandoff: on(fd, "isHandoff") },
      user,
    ),
  );
}

export async function startTimerAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  await finish(buildId, id, () => startTimer(id, user));
}

export async function stopTimerAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  await finish(buildId, id, () => stopTimer(user));
}

export async function logTimeAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  const minutes = Number(str(fd, "minutes"));
  await finish(buildId, id, () => logTime(id, minutes, str(fd, "note") || undefined, user));
}

export async function setEstimateAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  const minutes = Number(str(fd, "minutes"));
  await finish(buildId, id, () => setEstimateMinutes(id, Number.isFinite(minutes) ? minutes : null, user));
}

export async function setDueDateAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  const value = str(fd, "due");
  await finish(buildId, id, () => setDueDate(id, value ? new Date(value) : null, user));
}

export async function assignAction(fd: FormData) {
  const user = await requireUser();
  const buildId = str(fd, "buildId");
  const id = str(fd, "deliverableId");
  const assigneeId = str(fd, "assigneeId");
  await finish(buildId, id, () => assignDeliverable(id, assigneeId || null, user));
}
