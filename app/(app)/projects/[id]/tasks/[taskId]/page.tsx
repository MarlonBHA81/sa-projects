import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth-helpers";
import { notDeleted } from "@/lib/soft-delete";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDate, formatHours, toNumber } from "@/lib/format";
import {
  taskPriorityClass,
  taskPriorityLabel,
  taskStatusClass,
  taskStatusLabel,
  taskStatusOrder,
} from "@/lib/labels";
import { loggedMinutes } from "@/lib/projects-pm";
import { runningTimer } from "@/lib/timesheet-service";
import {
  addChecklistAction,
  addFollowerAction,
  addTaskCommentAction,
  billTaskAction,
  deleteChecklistAction,
  removeFollowerAction,
  setAssigneesAction,
  startTimerAction,
  stopTimerAction,
  toggleChecklistAction,
  updateTaskAction,
} from "../../../actions";

const field = "rounded-lg border border-zinc-300 px-2 py-1 text-sm";

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; taskId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: projectId, taskId } = await params;
  const { error } = await searchParams;
  const user = await requireUser();
  const admin = isAdmin(user);

  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId, ...notDeleted },
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
      followers: { include: { user: { select: { id: true, name: true } } } },
      checklistItems: { orderBy: { order: "asc" } },
      taskComments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
      timesheets: { select: { startTime: true, endTime: true } },
      milestone: { select: { id: true, name: true } },
    },
  });
  if (!task) notFound();

  const [members, milestones, running] = await Promise.all([
    prisma.user.findMany({ where: { department: { not: null } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.milestone.findMany({ where: { projectId, ...notDeleted }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    runningTimer(user.id),
  ]);

  const assigneeIds = new Set(task.assignees.map((a) => a.user.id));
  const followerIds = new Set(task.followers.map((f) => f.user.id));
  const logged = loggedMinutes(task.timesheets);
  const runningOnThis = running?.task.id === task.id;

  return (
    <div>
      <div className="mb-3 text-sm text-zinc-500">
        <Link href="/projects" className="hover:text-zinc-900">Projects</Link>
        <span className="mx-1">/</span>
        <Link href={`/projects/${projectId}?tab=tasks`} className="hover:text-zinc-900">Tasks</Link>
      </div>
      <PageHeader title={task.title}>
        <Badge className={taskStatusClass[task.status]}>{taskStatusLabel[task.status]}</Badge>
        {task.billed ? <Badge className="bg-green-100 text-green-700">billed</Badge> : null}
      </PageHeader>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* Details */}
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-zinc-700">Details</h3>
            <form action={updateTaskAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="taskId" value={task.id} />
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs text-zinc-500">Title</span>
                <input name="title" defaultValue={task.title} className={field} />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs text-zinc-500">Description</span>
                <textarea name="description" defaultValue={task.description ?? ""} rows={3} className={field} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Status</span>
                <select name="status" defaultValue={task.status} className={field}>
                  {taskStatusOrder.map((s) => (<option key={s} value={s}>{taskStatusLabel[s]}</option>))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Priority</span>
                <select name="priority" defaultValue={task.priority ?? ""} className={field}>
                  <option value="">No priority</option>
                  {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => (<option key={p} value={p}>{taskPriorityLabel[p]}</option>))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Milestone</span>
                <select name="milestoneId" defaultValue={task.milestone?.id ?? ""} className={field}>
                  <option value="">No milestone</option>
                  {milestones.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Estimate (mins)</span>
                <input type="number" name="estimateMinutes" defaultValue={task.estimateMinutes ?? ""} className={field} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Start date</span>
                <input type="date" name="startDate" defaultValue={task.startDate ? task.startDate.toISOString().slice(0, 10) : ""} className={field} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Due date</span>
                <input type="date" name="dueDate" defaultValue={task.dueDate ? task.dueDate.toISOString().slice(0, 10) : ""} className={field} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Hourly rate</span>
                <input type="number" step="0.01" name="hourlyRate" defaultValue={toNumber(task.hourlyRate)} disabled={task.billed} className={field} />
              </label>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" name="billable" defaultChecked={task.billable} disabled={task.billed} /> Billable
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" name="visibleToClient" defaultChecked={task.visibleToClient} /> Visible to client
                </label>
              </div>
              <div className="sm:col-span-2">
                <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Save</button>
              </div>
            </form>
          </Card>

          {/* Checklist */}
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-zinc-700">Checklist</h3>
            <ul className="space-y-1">
              {task.checklistItems.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <form action={toggleChecklistAction} className="flex items-center gap-2">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="itemId" value={c.id} />
                    {c.finished ? <input type="hidden" name="finished" value="" /> : <input type="hidden" name="finished" value="1" />}
                    <button type="submit" className={`h-4 w-4 rounded border ${c.finished ? "border-green-500 bg-green-500 text-white" : "border-zinc-300"}`} aria-label="toggle">
                      {c.finished ? "✓" : ""}
                    </button>
                    <span className={c.finished ? "text-zinc-400 line-through" : "text-zinc-700"}>{c.description}</span>
                  </form>
                  <form action={deleteChecklistAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="itemId" value={c.id} />
                    <button className="text-xs text-red-600 hover:text-red-800">×</button>
                  </form>
                </li>
              ))}
              {task.checklistItems.length === 0 ? <li className="text-sm text-zinc-400">No items yet.</li> : null}
            </ul>
            <form action={addChecklistAction} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="taskId" value={task.id} />
              <input name="description" required placeholder="New item" className={`flex-1 ${field}`} />
              <button className="text-sm text-zinc-600 hover:text-zinc-900">Add</button>
            </form>
          </Card>

          {/* Comments */}
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-zinc-700">Comments</h3>
            <ul className="space-y-2">
              {task.taskComments.map((c) => (
                <li key={c.id} className="rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                  <div className="text-zinc-700">{c.content}</div>
                  <div className="mt-1 text-xs text-zinc-400">{c.author.name} · {formatDate(c.createdAt)}</div>
                </li>
              ))}
              {task.taskComments.length === 0 ? <li className="text-sm text-zinc-400">No comments yet.</li> : null}
            </ul>
            <form action={addTaskCommentAction} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="taskId" value={task.id} />
              <input name="content" required placeholder="Add a comment…" className={`flex-1 ${field}`} />
              <button className="text-sm text-zinc-600 hover:text-zinc-900">Comment</button>
            </form>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-5">
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-zinc-700">Timer</h3>
            <div className="mb-2 text-xs text-zinc-500">Logged: {formatHours(logged)}</div>
            {runningOnThis ? (
              <form action={stopTimerAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="redirectTo" value={`/projects/${projectId}/tasks/${task.id}`} />
                <button className="w-full rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Stop timer</button>
              </form>
            ) : (
              <form action={startTimerAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="redirectTo" value={`/projects/${projectId}/tasks/${task.id}`} />
                <button className="w-full rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Start timer</button>
              </form>
            )}
            {task.priority ? <div className="mt-3"><Badge className={taskPriorityClass[task.priority]}>{taskPriorityLabel[task.priority]}</Badge></div> : null}
          </Card>

          {/* Assignees */}
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-zinc-700">Assignees</h3>
            <form action={setAssigneesAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="taskId" value={task.id} />
              <select name="assigneeIds" multiple defaultValue={Array.from(assigneeIds)} className={`${field} h-28 w-full`}>
                {members.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
              </select>
              <button className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Save assignees</button>
            </form>
          </Card>

          {/* Followers */}
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-zinc-700">Followers</h3>
            <ul className="space-y-1 text-sm">
              {task.followers.map((f) => (
                <li key={f.id} className="flex items-center justify-between">
                  <span className="text-zinc-700">{f.user.name}</span>
                  <form action={removeFollowerAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="userId" value={f.user.id} />
                    <button className="text-xs text-red-600 hover:text-red-800">remove</button>
                  </form>
                </li>
              ))}
              {task.followers.length === 0 ? <li className="text-zinc-400">No followers.</li> : null}
            </ul>
            <form action={addFollowerAction} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="taskId" value={task.id} />
              <select name="userId" defaultValue="" required className={`flex-1 ${field}`}>
                <option value="" disabled>Add follower…</option>
                {members.filter((u) => !followerIds.has(u.id)).map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
              </select>
              <button className="text-sm text-zinc-600 hover:text-zinc-900">Add</button>
            </form>
          </Card>

          {admin && task.billable && !task.billed ? (
            <Card>
              <h3 className="mb-2 text-sm font-semibold text-zinc-700">Billing</h3>
              <p className="mb-2 text-xs text-zinc-400">Billing a task locks it, marks it complete, and stops re-billing.</p>
              <form action={billTaskAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="taskId" value={task.id} />
                <button className="w-full rounded-lg border border-green-300 bg-white px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50">Mark billed</button>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
