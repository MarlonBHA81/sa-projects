"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import {
  addDiscussionComment,
  addProjectFileLink,
  addProjectMember,
  addProjectNote,
  createDiscussion,
  createProject,
  deleteProject,
  markProjectFinished,
  removeProjectMember,
  updateProject,
  updateProjectSettings,
  type ProjectSettingsFields,
} from "@/lib/project-service";
import {
  createMilestone,
  deleteMilestone,
  updateMilestone,
} from "@/lib/milestone-service";
import {
  addChecklistItem,
  addTaskComment,
  addTaskFollower,
  billTask,
  createProjectTask,
  deleteChecklistItem,
  deleteProjectTask,
  removeTaskFollower,
  setTaskAssignees,
  setTaskMilestone,
  setTaskStatus,
  toggleChecklistItem,
  updateProjectTask,
} from "@/lib/task-pm-service";
import { addManualTimesheet, deleteTimesheet, startTimer, stopTimer } from "@/lib/timesheet-service";
import type {
  ProjectBillingType,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function opt(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v || null;
}
function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  return v ? Number(v) : null;
}
function date(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  return v ? new Date(v) : null;
}
function bool(fd: FormData, key: string): boolean {
  return fd.get(key) != null;
}
function ids(fd: FormData, key: string): string[] {
  return fd.getAll(key).map((v) => String(v)).filter(Boolean);
}

async function back(path: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    redirect(`${path}?error=${encodeURIComponent(e instanceof Error ? e.message : "Something went wrong")}`);
  }
  revalidatePath(path);
  redirect(path);
}

function projectPath(id: string, tab?: string): string {
  return tab ? `/projects/${id}?tab=${tab}` : `/projects/${id}`;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export async function createProjectAction(fd: FormData) {
  const user = await requireUser();
  let id = "";
  try {
    id = await createProject(
      {
        name: str(fd, "name"),
        description: opt(fd, "description"),
        clientId: opt(fd, "clientId"),
        status: (str(fd, "status") as ProjectStatus) || undefined,
        billingType: (str(fd, "billingType") as ProjectBillingType) || undefined,
        progressFromTasks: str(fd, "progressFromTasks") !== "manual",
        projectCost: num(fd, "projectCost"),
        ratePerHour: num(fd, "ratePerHour"),
        estimatedHours: num(fd, "estimatedHours"),
        startDate: date(fd, "startDate"),
        deadline: date(fd, "deadline"),
        memberIds: ids(fd, "memberIds"),
      },
      user,
    );
  } catch (e) {
    redirect(`/projects?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not create")}`);
  }
  revalidatePath("/projects");
  redirect(projectPath(id));
}

export async function updateProjectAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "projectId");
  await back(projectPath(id, "overview"), () =>
    updateProject(
      id,
      {
        name: str(fd, "name") || undefined,
        description: opt(fd, "description"),
        clientId: fd.get("clientId") === null ? undefined : opt(fd, "clientId"),
        status: (str(fd, "status") as ProjectStatus) || undefined,
        billingType: (str(fd, "billingType") as ProjectBillingType) || undefined,
        progressFromTasks: fd.get("progressFromTasks") === null ? undefined : str(fd, "progressFromTasks") !== "manual",
        progress: num(fd, "progress") ?? undefined,
        projectCost: fd.get("projectCost") === null ? undefined : num(fd, "projectCost"),
        ratePerHour: fd.get("ratePerHour") === null ? undefined : num(fd, "ratePerHour"),
        estimatedHours: fd.get("estimatedHours") === null ? undefined : num(fd, "estimatedHours"),
        startDate: fd.get("startDate") === null ? undefined : date(fd, "startDate"),
        deadline: fd.get("deadline") === null ? undefined : date(fd, "deadline"),
      },
      user,
    ),
  );
}

export async function markFinishedAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "projectId");
  await back(projectPath(id, "overview"), () => markProjectFinished(id, user));
}

export async function deleteProjectAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "projectId");
  try {
    await deleteProject(id, user);
  } catch (e) {
    redirect(`${projectPath(id)}?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not delete")}`);
  }
  revalidatePath("/projects");
  redirect("/projects");
}

export async function updateSettingsAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "projectId");
  const keys: (keyof ProjectSettingsFields)[] = [
    "viewTasks",
    "createTasks",
    "editTasks",
    "commentOnTasks",
    "viewTaskComments",
    "viewTaskAttachments",
    "viewTaskChecklistItems",
    "uploadOnTasks",
    "viewTaskTotalLoggedTime",
    "viewFinanceOverview",
    "uploadFiles",
    "openDiscussions",
    "viewMilestones",
    "viewGantt",
    "viewTimesheets",
    "viewActivityLog",
    "viewTeamMembers",
    "hideTasksOnMainTable",
  ];
  const fields: ProjectSettingsFields = {};
  for (const k of keys) fields[k] = bool(fd, k);
  await back(projectPath(id, "settings"), () => updateProjectSettings(id, fields, user));
}

export async function addMemberAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "projectId");
  await back(projectPath(id, "overview"), () => addProjectMember(id, str(fd, "userId"), user));
}

export async function removeMemberAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "projectId");
  await back(projectPath(id, "overview"), () => removeProjectMember(id, str(fd, "userId"), user));
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function createMilestoneAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "projectId");
  await back(projectPath(id, "milestones"), () =>
    createMilestone(
      {
        projectId: id,
        name: str(fd, "name"),
        description: opt(fd, "description"),
        color: opt(fd, "color"),
        startDate: date(fd, "startDate"),
        dueDate: date(fd, "dueDate"),
      },
      user,
    ).then(() => undefined),
  );
}

export async function updateMilestoneAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "projectId");
  await back(projectPath(id, "milestones"), () =>
    updateMilestone(
      str(fd, "milestoneId"),
      {
        name: str(fd, "name") || undefined,
        description: opt(fd, "description"),
        color: opt(fd, "color"),
        dueDate: fd.get("dueDate") === null ? undefined : date(fd, "dueDate"),
      },
      user,
    ),
  );
}

export async function deleteMilestoneAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "projectId");
  await back(projectPath(id, "milestones"), () => deleteMilestone(str(fd, "milestoneId"), user));
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createTaskAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "projectId");
  await back(projectPath(id, "tasks"), () =>
    createProjectTask(
      {
        projectId: id,
        title: str(fd, "title"),
        description: opt(fd, "description"),
        milestoneId: opt(fd, "milestoneId"),
        priority: (str(fd, "priority") as TaskPriority) || null,
        status: (str(fd, "status") as TaskStatus) || undefined,
        startDate: date(fd, "startDate"),
        dueDate: date(fd, "dueDate"),
        hourlyRate: num(fd, "hourlyRate"),
        billable: bool(fd, "billable"),
        estimateMinutes: num(fd, "estimateMinutes"),
        assigneeIds: ids(fd, "assigneeIds"),
      },
      user,
    ).then(() => undefined),
  );
}

// Move a task on the status Kanban (client-driven; never a gate).
export async function moveTaskStatusAction(
  projectId: string,
  taskId: string,
  status: TaskStatus,
  kanbanOrder?: number,
) {
  const user = await requireUser();
  await setTaskStatus(taskId, status, kanbanOrder, user);
  revalidatePath(projectPath(projectId, "tasks"));
}

// Move a task between milestones (client-driven; only changes milestone/order).
export async function moveTaskMilestoneAction(
  projectId: string,
  taskId: string,
  milestoneId: string | null,
  milestoneOrder?: number,
) {
  const user = await requireUser();
  await setTaskMilestone(taskId, milestoneId, milestoneOrder, user);
  revalidatePath(projectPath(projectId, "milestones"));
}

export async function setTaskStatusFormAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "projectId");
  await back(projectPath(id, "tasks"), () =>
    setTaskStatus(str(fd, "taskId"), str(fd, "status") as TaskStatus, undefined, user),
  );
}

export async function deleteTaskAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "projectId");
  const tab = str(fd, "tab") || "tasks";
  await back(projectPath(id, tab), () => deleteProjectTask(str(fd, "taskId"), user));
}

// ---------------------------------------------------------------------------
// Task detail: update, assignees, followers, checklist, comments, billing
// ---------------------------------------------------------------------------

function taskPath(projectId: string, taskId: string): string {
  return `/projects/${projectId}/tasks/${taskId}`;
}

export async function updateTaskAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const taskId = str(fd, "taskId");
  await back(taskPath(projectId, taskId), () =>
    updateProjectTask(
      taskId,
      {
        title: str(fd, "title") || undefined,
        description: opt(fd, "description"),
        milestoneId: fd.get("milestoneId") === null ? undefined : opt(fd, "milestoneId"),
        priority: fd.get("priority") === null ? undefined : ((str(fd, "priority") as TaskPriority) || null),
        status: (str(fd, "status") as TaskStatus) || undefined,
        startDate: fd.get("startDate") === null ? undefined : date(fd, "startDate"),
        dueDate: fd.get("dueDate") === null ? undefined : date(fd, "dueDate"),
        hourlyRate: fd.get("hourlyRate") === null ? undefined : num(fd, "hourlyRate"),
        billable: fd.get("billable") === null ? undefined : bool(fd, "billable"),
        estimateMinutes: fd.get("estimateMinutes") === null ? undefined : num(fd, "estimateMinutes"),
        visibleToClient: fd.get("visibleToClient") === null ? undefined : bool(fd, "visibleToClient"),
      },
      user,
    ),
  );
}

export async function setAssigneesAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const taskId = str(fd, "taskId");
  await back(taskPath(projectId, taskId), () => setTaskAssignees(taskId, ids(fd, "assigneeIds"), user));
}

export async function addFollowerAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const taskId = str(fd, "taskId");
  await back(taskPath(projectId, taskId), () => addTaskFollower(taskId, str(fd, "userId"), user));
}

export async function removeFollowerAction(fd: FormData) {
  await requireUser();
  const projectId = str(fd, "projectId");
  const taskId = str(fd, "taskId");
  await back(taskPath(projectId, taskId), () => removeTaskFollower(taskId, str(fd, "userId")));
}

export async function addChecklistAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const taskId = str(fd, "taskId");
  await back(taskPath(projectId, taskId), () => addChecklistItem(taskId, str(fd, "description"), user));
}

export async function toggleChecklistAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const taskId = str(fd, "taskId");
  await back(taskPath(projectId, taskId), () =>
    toggleChecklistItem(str(fd, "itemId"), bool(fd, "finished"), user),
  );
}

export async function deleteChecklistAction(fd: FormData) {
  await requireUser();
  const projectId = str(fd, "projectId");
  const taskId = str(fd, "taskId");
  await back(taskPath(projectId, taskId), () => deleteChecklistItem(str(fd, "itemId")));
}

export async function addTaskCommentAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const taskId = str(fd, "taskId");
  await back(taskPath(projectId, taskId), () => addTaskComment(taskId, str(fd, "content"), user));
}

export async function billTaskAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const taskId = str(fd, "taskId");
  await back(taskPath(projectId, taskId), () => billTask(taskId, user));
}

// ---------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------

export async function startTimerAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const taskId = str(fd, "taskId");
  const redirectTo = str(fd, "redirectTo") || taskPath(projectId, taskId);
  await back(redirectTo, () => startTimer(taskId, user));
}

export async function stopTimerAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  const redirectTo = str(fd, "redirectTo") || projectPath(projectId, "timesheet");
  await back(redirectTo, () => stopTimer(user));
}

export async function addTimesheetAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  await back(projectPath(projectId, "timesheet"), () =>
    addManualTimesheet(
      {
        taskId: str(fd, "taskId"),
        startTime: date(fd, "startTime") ?? new Date(),
        endTime: date(fd, "endTime") ?? new Date(),
        note: opt(fd, "note"),
        staffId: opt(fd, "staffId") ?? undefined,
      },
      user,
    ),
  );
}

export async function deleteTimesheetAction(fd: FormData) {
  await requireUser();
  const projectId = str(fd, "projectId");
  await back(projectPath(projectId, "timesheet"), () => deleteTimesheet(str(fd, "timesheetId")));
}

// ---------------------------------------------------------------------------
// Files / Discussions / Notes
// ---------------------------------------------------------------------------

export async function addFileAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  await back(projectPath(projectId, "files"), () =>
    addProjectFileLink(
      projectId,
      { subject: str(fd, "subject"), url: str(fd, "url"), description: opt(fd, "description"), visibleToCustomer: bool(fd, "visibleToCustomer") },
      user,
    ),
  );
}

export async function createDiscussionAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  await back(projectPath(projectId, "discussions"), () =>
    createDiscussion(
      projectId,
      { subject: str(fd, "subject"), description: opt(fd, "description"), showToCustomer: bool(fd, "showToCustomer") },
      user,
    ).then(() => undefined),
  );
}

export async function addDiscussionCommentAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  await back(projectPath(projectId, "discussions"), () =>
    addDiscussionComment(str(fd, "discussionId"), str(fd, "content"), user),
  );
}

export async function addNoteAction(fd: FormData) {
  const user = await requireUser();
  const projectId = str(fd, "projectId");
  await back(projectPath(projectId, "notes"), () => addProjectNote(projectId, str(fd, "content"), user));
}
