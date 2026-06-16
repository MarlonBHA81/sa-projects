"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { moveDeliverableLane, setDeliverableSprint } from "@/lib/board";
import { createTask, deleteTask, moveTask } from "@/lib/tasks";
import { createSprint } from "@/lib/sprints";
import type { Department, PlanningLane } from "@prisma/client";

// Called from the drag-and-drop board. Sets the planning lane (and, for tasks,
// the department of the row it was dropped in). Never touches the gated status.
export async function moveCardAction(
  buildId: string,
  kind: "deliverable" | "task",
  id: string,
  lane: PlanningLane,
  department: Department | null,
) {
  const user = await requireUser();
  if (kind === "deliverable") await moveDeliverableLane(id, lane, user);
  else await moveTask(id, { planningLane: lane, department }, user);
  revalidatePath(`/builds/${buildId}/board`);
  revalidatePath(`/builds/${buildId}`);
}

export async function createSprintAction(fd: FormData) {
  const user = await requireUser();
  const buildId = String(fd.get("buildId") ?? "");
  await createSprint(
    { funnelBuildId: buildId, name: String(fd.get("name") ?? ""), goal: String(fd.get("goal") ?? "") || undefined },
    user,
  );
  revalidatePath(`/builds/${buildId}/board`);
  redirect(`/builds/${buildId}/board`);
}

export async function addTaskAction(fd: FormData) {
  const user = await requireUser();
  const buildId = String(fd.get("buildId") ?? "");
  const path = `/builds/${buildId}/board`;
  try {
    await createTask(
      {
        title: String(fd.get("title") ?? ""),
        funnelBuildId: buildId,
        assigneeId: String(fd.get("assigneeId") ?? "") || null,
        planningLane: (String(fd.get("planningLane") ?? "TODO") as PlanningLane) || "TODO",
        sprintId: String(fd.get("sprintId") ?? "") || null,
        department: (String(fd.get("department") ?? "") as Department) || null,
        estimateMinutes: String(fd.get("estimateMinutes") ?? "") ? Number(fd.get("estimateMinutes")) : null,
      },
      user,
    );
  } catch (e) {
    redirect(`${path}?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not add task")}`);
  }
  revalidatePath(path);
  redirect(path);
}

export async function assignCardSprintAction(fd: FormData) {
  const user = await requireUser();
  const buildId = String(fd.get("buildId") ?? "");
  const kind = String(fd.get("kind") ?? "");
  const id = String(fd.get("id") ?? "");
  const sprintId = String(fd.get("sprintId") ?? "") || null;
  if (kind === "deliverable") await setDeliverableSprint(id, sprintId, user);
  else await moveTask(id, { sprintId }, user);
  revalidatePath(`/builds/${buildId}/board`);
  redirect(`/builds/${buildId}/board`);
}

export async function deleteBoardTaskAction(fd: FormData) {
  const user = await requireUser();
  const buildId = String(fd.get("buildId") ?? "");
  const id = String(fd.get("id") ?? "");
  const path = `/builds/${buildId}/board`;
  try {
    await deleteTask(id, user);
  } catch (e) {
    redirect(`${path}?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not delete")}`);
  }
  revalidatePath(path);
  redirect(path);
}
