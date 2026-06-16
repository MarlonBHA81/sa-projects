"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, isAdmin, AuthError } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { softDelete } from "@/lib/soft-delete";
import {
  createProject,
  createTask,
  deleteTask,
  moveTask,
  setTaskDependency,
  updateTask,
} from "@/lib/tasks";
import type { Department, PlanningLane } from "@prisma/client";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "");
}

async function backToProject(projectId: string, fn: () => Promise<void>) {
  const path = `/projects/${projectId}`;
  try {
    await fn();
  } catch (e) {
    redirect(`${path}?error=${encodeURIComponent(e instanceof Error ? e.message : "Something went wrong")}`);
  }
  revalidatePath(path);
  redirect(path);
}

export async function createProjectAction(fd: FormData) {
  const user = await requireUser();
  let projectId = "";
  try {
    projectId = await createProject({ name: str(fd, "name"), description: str(fd, "description") }, user);
  } catch (e) {
    redirect(`/projects?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not create")}`);
  }
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

export async function createTaskAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  await backToProject(projectId, () =>
    createTask(
      {
        title: str(fd, "title"),
        projectId,
        assigneeId: str(fd, "assigneeId") || null,
        estimateMinutes: str(fd, "estimateMinutes") ? Number(str(fd, "estimateMinutes")) : null,
        planningLane: (str(fd, "planningLane") || "TODO") as PlanningLane,
        department: (str(fd, "department") as Department) || null,
      },
      user,
    ).then(() => undefined),
  );
}

export async function updateTaskAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const id = str(fd, "taskId");
  await backToProject(projectId, () =>
    updateTask(
      id,
      {
        title: str(fd, "title") || undefined,
        assigneeId: str(fd, "assigneeId") || null,
        estimateMinutes: str(fd, "estimateMinutes") ? Number(str(fd, "estimateMinutes")) : null,
      },
      user,
    ),
  );
}

export async function moveTaskAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const id = str(fd, "taskId");
  await backToProject(projectId, () =>
    moveTask(id, { planningLane: str(fd, "planningLane") as PlanningLane }, user),
  );
}

export async function deleteTaskAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const id = str(fd, "taskId");
  await backToProject(projectId, () => deleteTask(id, user));
}

export async function deleteProjectAction(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get("projectId") ?? "");
  try {
    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null },
      select: { ownerId: true },
    });
    if (!project) throw new AuthError("Project not found");
    if (!isAdmin(user) && project.ownerId !== user.id) {
      throw new AuthError("Only the owner can delete this project");
    }
    await softDelete("project", id, user);
  } catch (e) {
    redirect(`/projects/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not delete")}`);
  }
  revalidatePath("/projects");
  redirect("/projects");
}

export async function setDependencyAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const dependentId = str(fd, "dependentId");
  const prerequisiteId = str(fd, "prerequisiteId");
  await backToProject(projectId, () => setTaskDependency(dependentId, prerequisiteId, user));
}
