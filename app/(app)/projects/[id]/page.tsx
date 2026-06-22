import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth-helpers";
import { notDeleted } from "@/lib/soft-delete";
import { projectFinance } from "@/lib/project-service";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDate, formatHours, formatMoney, toNumber } from "@/lib/format";
import {
  billingTypeLabel,
  projectStatusClass,
  projectStatusLabel,
  taskPriorityClass,
  taskPriorityLabel,
  taskStatusClass,
  taskStatusLabel,
  taskStatusOrder,
} from "@/lib/labels";
import { ganttBar, ganttWindow, progressFromTasks, countCompleted } from "@/lib/projects-pm";
import { nowMs } from "@/lib/now";
import { TaskStatusBoard, type StatusCard } from "@/components/task-status-board";
import { MilestoneBoard, type MilestoneCard } from "@/components/milestone-board";
import type { Prisma, TaskStatus } from "@prisma/client";
import {
  addFileAction,
  addMemberAction,
  addNoteAction,
  addTimesheetAction,
  createDiscussionAction,
  addDiscussionCommentAction,
  createMilestoneAction,
  createTaskAction,
  deleteMilestoneAction,
  deleteProjectAction,
  deleteTimesheetAction,
  markFinishedAction,
  moveTaskMilestoneAction,
  moveTaskStatusAction,
  removeMemberAction,
  startTimerAction,
  stopTimerAction,
  updateProjectAction,
  updateSettingsAction,
} from "../actions";
import { projectTimesheets, runningTimer } from "@/lib/timesheet-service";

const TABS = [
  ["overview", "Overview"],
  ["tasks", "Tasks"],
  ["milestones", "Milestones"],
  ["timesheet", "Timesheet"],
  ["gantt", "Gantt"],
  ["files", "Files"],
  ["discussions", "Discussions"],
  ["notes", "Notes"],
  ["activity", "Activity"],
  ["settings", "Settings"],
] as const;

const field = "rounded-lg border border-zinc-300 px-2 py-1 text-sm";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam, error } = await searchParams;
  const user = await requireUser();
  const admin = isAdmin(user);
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam! : "overview";

  const project = await prisma.project.findFirst({
    where: { id, ...notDeleted },
    include: {
      client: { select: { id: true, name: true } },
      owner: { select: { name: true } },
      settings: true,
      members: { include: { user: { select: { id: true, name: true } } } },
      milestones: { where: notDeleted, orderBy: { order: "asc" } },
    },
  });
  if (!project) notFound();

  const tasks = await prisma.task.findMany({
    where: { projectId: id, ...notDeleted },
    orderBy: [{ kanbanOrder: "asc" }, { createdAt: "asc" }],
    include: {
      assignee: { select: { name: true } },
      milestone: { select: { id: true, name: true } },
      timesheets: { select: { startTime: true, endTime: true } },
      _count: { select: { checklistItems: true, taskComments: true } },
    },
  });

  const [members, finance] = await Promise.all([
    prisma.user.findMany({ where: { department: { not: null } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    projectFinance(id),
  ]);

  const counts = countCompleted(tasks.map((t) => t.status));

  return (
    <div>
      <div className="mb-3 text-sm text-zinc-500">
        <Link href="/projects" className="hover:text-zinc-900">Projects</Link>
      </div>
      <PageHeader
        title={project.name}
        subtitle={`${project.client ? project.client.name + " · " : ""}Owner: ${project.owner.name}`}
      >
        <Badge className={projectStatusClass[project.status]}>{projectStatusLabel[project.status]}</Badge>
        {admin && project.status !== "FINISHED" ? (
          <form action={markFinishedAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <button className="rounded-lg border border-green-300 bg-white px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50">
              Mark finished
            </button>
          </form>
        ) : null}
        {admin || project.ownerId === user.id ? (
          <form action={deleteProjectAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <button className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
              Delete
            </button>
          </form>
        ) : null}
      </PageHeader>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {/* Tabs */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.filter(([k]) => k !== "settings" || admin).map(([key, label]) => (
          <Link
            key={key}
            href={`/projects/${id}?tab=${key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === key
                ? "border-zinc-900 font-medium text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "overview" ? (
        <OverviewTab project={project} finance={finance} members={members} counts={counts} admin={admin} />
      ) : null}
      {tab === "tasks" ? (
        <TasksTab projectId={id} tasks={tasks} milestones={project.milestones} members={members} />
      ) : null}
      {tab === "milestones" ? (
        <MilestonesTab projectId={id} milestones={project.milestones} tasks={tasks} />
      ) : null}
      {tab === "timesheet" ? <TimesheetTab projectId={id} tasks={tasks} userId={user.id} /> : null}
      {tab === "gantt" ? <GanttTab tasks={tasks} milestones={project.milestones} now={nowMs()} /> : null}
      {tab === "files" ? <FilesTab projectId={id} /> : null}
      {tab === "discussions" ? <DiscussionsTab projectId={id} /> : null}
      {tab === "notes" ? <NotesTab projectId={id} /> : null}
      {tab === "activity" ? <ActivityTab projectId={id} /> : null}
      {tab === "settings" && admin ? <SettingsTab project={project} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

type ProjectWithRels = Prisma.ProjectGetPayload<{
  include: {
    client: { select: { id: true; name: true } };
    owner: { select: { name: true } };
    settings: true;
    members: { include: { user: { select: { id: true; name: true } } } };
    milestones: true;
  };
}>;

function OverviewTab({
  project,
  finance,
  members,
  counts,
  admin,
}: {
  project: ProjectWithRels;
  finance: Awaited<ReturnType<typeof projectFinance>>;
  members: { id: string; name: string | null }[];
  counts: { total: number; completed: number };
  admin: boolean;
}) {
  const progress = project.progressFromTasks ? progressFromTasks(counts) : project.progress;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">Details</h3>
        <form action={updateProjectAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="projectId" value={project.id} />
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-zinc-500">Name</span>
            <input name="name" defaultValue={project.name} className={field} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-zinc-500">Description</span>
            <textarea name="description" defaultValue={project.description ?? ""} rows={2} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Status</span>
            <select name="status" defaultValue={project.status} className={field}>
              {(["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "FINISHED", "CANCELLED"] as const).map((s) => (
                <option key={s} value={s}>{projectStatusLabel[s]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Billing type</span>
            <select name="billingType" defaultValue={project.billingType} className={field}>
              {(["FIXED_RATE", "PROJECT_HOURS", "TASK_HOURS"] as const).map((b) => (
                <option key={b} value={b}>{billingTypeLabel[b]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Start date</span>
            <input type="date" name="startDate" defaultValue={dateInput(project.startDate)} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Deadline</span>
            <input type="date" name="deadline" defaultValue={dateInput(project.deadline)} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Fixed cost</span>
            <input type="number" step="0.01" name="projectCost" defaultValue={project.projectCost ? toNumber(project.projectCost) : ""} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Rate per hour</span>
            <input type="number" step="0.01" name="ratePerHour" defaultValue={project.ratePerHour ? toNumber(project.ratePerHour) : ""} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Estimated hours</span>
            <input type="number" step="0.01" name="estimatedHours" defaultValue={project.estimatedHours ? toNumber(project.estimatedHours) : ""} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Progress</span>
            <select name="progressFromTasks" defaultValue={project.progressFromTasks ? "tasks" : "manual"} className={field}>
              <option value="tasks">From tasks</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          {!project.progressFromTasks ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Manual progress %</span>
              <input type="number" min="0" max="100" name="progress" defaultValue={project.progress} className={field} />
            </label>
          ) : null}
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Save</button>
          </div>
        </form>
      </Card>

      <div className="flex flex-col gap-5">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">Progress</h3>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full bg-zinc-900" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-sm text-zinc-600">{progress}%</span>
          </div>
          <div className="mt-1 text-xs text-zinc-400">{counts.completed} of {counts.total} tasks complete</div>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">Finance overview</h3>
          <dl className="space-y-1 text-sm">
            <Row label="Billing" value={billingTypeLabel[project.billingType]} />
            <Row label="Logged" value={formatHours(finance.loggedMinutes)} />
            <Row label="Billable" value={formatHours(finance.billableMinutes)} />
            <Row label="Billed" value={formatHours(finance.billedMinutes)} />
            <Row label="Unbilled" value={formatHours(finance.unbilledMinutes)} />
            {finance.showAmount ? (
              <Row label="Amount" value={formatMoney(finance.amount, finance.currency)} />
            ) : (
              <Row label="Amount" value={formatMoney(toNumber(project.projectCost), finance.currency)} />
            )}
          </dl>
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700">Members</h3>
          </div>
          <ul className="space-y-1 text-sm text-zinc-700">
            {project.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between">
                <span>{m.user.name}</span>
                {admin ? (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="userId" value={m.user.id} />
                    <button className="text-xs text-red-600 hover:text-red-800">remove</button>
                  </form>
                ) : null}
              </li>
            ))}
            {project.members.length === 0 ? <li className="text-zinc-400">No members yet.</li> : null}
          </ul>
          <form action={addMemberAction} className="mt-3 flex items-center gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <select name="userId" defaultValue="" required className={`flex-1 ${field}`}>
              <option value="" disabled>Add member…</option>
              {members.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <button className="text-sm text-zinc-600 hover:text-zinc-900">Add</button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-800">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tasks (table + status Kanban)
// ---------------------------------------------------------------------------

type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: import("@prisma/client").TaskPriority | null;
  startDate: Date | null;
  dueDate: Date | null;
  billable: boolean;
  billed: boolean;
  assignee: { name: string | null } | null;
  milestone: { id: string; name: string } | null;
  timesheets: { startTime: Date; endTime: Date | null }[];
  _count: { checklistItems: number; taskComments: number };
};

function TasksTab({
  projectId,
  tasks,
  milestones,
  members,
}: {
  projectId: string;
  tasks: TaskRow[];
  milestones: { id: string; name: string }[];
  members: { id: string; name: string | null }[];
}) {
  const cards: StatusCard[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priorityLabel: t.priority ? taskPriorityLabel[t.priority] : null,
    priorityClass: t.priority ? taskPriorityClass[t.priority] : "",
    assignee: t.assignee?.name ?? "Unassigned",
    href: `/projects/${projectId}/tasks/${t.id}`,
  }));

  return (
    <div>
      <Card className="mb-5">
        <details>
          <summary className="cursor-pointer text-sm font-medium text-zinc-900">New task</summary>
          <form action={createTaskAction} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input name="title" required placeholder="Task title" className={`sm:col-span-3 ${field}`} />
            <select name="milestoneId" defaultValue="" className={field}>
              <option value="">No milestone</option>
              {milestones.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
            </select>
            <select name="priority" defaultValue="" className={field}>
              <option value="">No priority</option>
              {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => (<option key={p} value={p}>{taskPriorityLabel[p]}</option>))}
            </select>
            <select name="status" defaultValue="NOT_STARTED" className={field}>
              {taskStatusOrder.map((s) => (<option key={s} value={s}>{taskStatusLabel[s]}</option>))}
            </select>
            <input type="date" name="startDate" className={field} aria-label="Start date" />
            <input type="date" name="dueDate" className={field} aria-label="Due date" />
            <input type="number" step="0.01" name="hourlyRate" placeholder="Rate/hr" className={field} />
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input type="checkbox" name="billable" /> Billable
            </label>
            <select name="assigneeIds" multiple className={`${field} h-20 sm:col-span-2`}>
              {members.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
            <div className="sm:col-span-3">
              <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Add task</button>
            </div>
          </form>
        </details>
      </Card>

      <h3 className="mb-2 text-sm font-semibold text-zinc-700">Board</h3>
      <TaskStatusBoard
        projectId={projectId}
        columns={taskStatusOrder.map((s) => ({ key: s, label: taskStatusLabel[s] }))}
        cards={cards}
        onMove={moveTaskStatusAction}
      />

      <h3 className="mb-2 mt-6 text-sm font-semibold text-zinc-700">All tasks</h3>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="px-3 py-2 font-medium">Assignee</th>
              <th className="px-3 py-2 font-medium">Milestone</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 font-medium">Logged</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const logged = t.timesheets.reduce(
                (acc, s) => acc + (s.endTime ? Math.max(0, (s.endTime.getTime() - s.startTime.getTime()) / 60000) : 0),
                0,
              );
              return (
                <tr key={t.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                  <td className="px-3 py-2">
                    <Link href={`/projects/${projectId}/tasks/${t.id}`} className="font-medium text-zinc-900 hover:underline">{t.title}</Link>
                    <span className="ml-2 text-xs text-zinc-400">{t._count.checklistItems > 0 ? `☑ ${t._count.checklistItems}` : ""} {t._count.taskComments > 0 ? `💬 ${t._count.taskComments}` : ""}</span>
                    {t.billed ? <Badge className="ml-2 bg-green-100 text-green-700">billed</Badge> : t.billable ? <Badge className="ml-2 bg-zinc-100 text-zinc-600">billable</Badge> : null}
                  </td>
                  <td className="px-3 py-2"><Badge className={taskStatusClass[t.status]}>{taskStatusLabel[t.status]}</Badge></td>
                  <td className="px-3 py-2">{t.priority ? <Badge className={taskPriorityClass[t.priority]}>{taskPriorityLabel[t.priority]}</Badge> : <span className="text-zinc-300">—</span>}</td>
                  <td className="px-3 py-2 text-zinc-600">{t.assignee?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600">{t.milestone?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600">{formatDate(t.dueDate)}</td>
                  <td className="px-3 py-2 text-zinc-600">{formatHours(Math.round(logged))}</td>
                </tr>
              );
            })}
            {tasks.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-zinc-400">No tasks yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Milestones (list + milestone Kanban)
// ---------------------------------------------------------------------------

function MilestonesTab({
  projectId,
  milestones,
  tasks,
}: {
  projectId: string;
  milestones: { id: string; name: string; color: string | null; dueDate: Date | null; description: string | null }[];
  tasks: TaskRow[];
}) {
  const cards: MilestoneCard[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    milestoneId: t.milestone?.id ?? null,
    statusLabel: taskStatusLabel[t.status],
    statusClass: taskStatusClass[t.status],
    href: `/projects/${projectId}/tasks/${t.id}`,
  }));

  return (
    <div>
      <Card className="mb-5">
        <details>
          <summary className="cursor-pointer text-sm font-medium text-zinc-900">New milestone</summary>
          <form action={createMilestoneAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input name="name" required placeholder="Milestone name" className={`flex-1 ${field}`} />
            <input type="color" name="color" defaultValue="#03a9f4" className="h-9 w-12 rounded border border-zinc-300" aria-label="Colour" />
            <input type="date" name="dueDate" className={field} aria-label="Due date" />
            <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Add</button>
          </form>
        </details>
      </Card>

      <div className="mb-5 flex flex-col gap-2">
        {milestones.map((m) => {
          const mTasks = tasks.filter((t) => t.milestone?.id === m.id);
          const prog = progressFromTasks(countCompleted(mTasks.map((t) => t.status)));
          return (
            <Card key={m.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {m.color ? <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: m.color }} /> : null}
                  <span className="font-medium text-zinc-900">{m.name}</span>
                  <span className="text-xs text-zinc-400">due {formatDate(m.dueDate)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">{prog}%</span>
                  <form action={deleteMilestoneAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="milestoneId" value={m.id} />
                    <button className="text-xs text-red-600 hover:text-red-800">delete</button>
                  </form>
                </div>
              </div>
            </Card>
          );
        })}
        {milestones.length === 0 ? <div className="text-sm text-zinc-400">No milestones yet.</div> : null}
      </div>

      <h3 className="mb-2 text-sm font-semibold text-zinc-700">Tasks by milestone</h3>
      <p className="mb-2 text-xs text-zinc-400">Drag a task to change its milestone. This never changes a task status.</p>
      <MilestoneBoard
        projectId={projectId}
        columns={milestones.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
        cards={cards}
        onMove={moveTaskMilestoneAction}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timesheet
// ---------------------------------------------------------------------------

async function TimesheetTab({
  projectId,
  tasks,
  userId,
}: {
  projectId: string;
  tasks: { id: string; title: string }[];
  userId: string;
}) {
  const [rows, running] = await Promise.all([projectTimesheets(projectId), runningTimer(userId)]);
  return (
    <div className="max-w-3xl">
      <Card className="mb-5">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">Timer</h3>
        {running ? (
          <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm">
            <span>Running on <span className="font-medium">{running.task.title}</span></span>
            <form action={stopTimerAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="redirectTo" value={`/projects/${projectId}?tab=timesheet`} />
              <button className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700">Stop</button>
            </form>
          </div>
        ) : (
          <form action={startTimerAction} className="flex items-center gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="redirectTo" value={`/projects/${projectId}?tab=timesheet`} />
            <select name="taskId" required defaultValue="" className={`flex-1 ${field}`}>
              <option value="" disabled>Pick a task…</option>
              {tasks.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
            </select>
            <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Start timer</button>
          </form>
        )}
      </Card>

      <Card className="mb-5">
        <details>
          <summary className="cursor-pointer text-sm font-medium text-zinc-900">Add a manual entry</summary>
          <form action={addTimesheetAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <select name="taskId" required defaultValue="" className={field}>
              <option value="" disabled>Task…</option>
              {tasks.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
            </select>
            <input type="datetime-local" name="startTime" required className={field} aria-label="Start" />
            <input type="datetime-local" name="endTime" required className={field} aria-label="End" />
            <input name="note" placeholder="Note" className={field} />
            <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Add</button>
          </form>
        </details>
      </Card>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Start</th>
              <th className="px-3 py-2 font-medium">Duration</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-3 py-2 text-zinc-700">{r.taskTitle}</td>
                <td className="px-3 py-2 text-zinc-600">{r.staffName ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-600">{formatDate(r.startTime)}</td>
                <td className="px-3 py-2 text-zinc-600">{r.endTime ? formatHours(r.minutes) : "running"}</td>
                <td className="px-3 py-2 text-right">
                  <form action={deleteTimesheetAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="timesheetId" value={r.id} />
                    <button className="text-xs text-red-600 hover:text-red-800">delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-400">No time logged yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gantt / timeline
// ---------------------------------------------------------------------------

function GanttTab({
  tasks,
  milestones,
  now,
}: {
  tasks: TaskRow[];
  milestones: { id: string; name: string; color: string | null; startDate: Date | null; dueDate: Date | null }[];
  now: number;
}) {
  type Item = { label: string; start: Date | null; end: Date | null; color: string; kind: string };
  const items: Item[] = [
    ...milestones.map((m) => ({ label: m.name, start: m.startDate, end: m.dueDate, color: m.color ?? "#6366f1", kind: "milestone" })),
    ...tasks.map((t) => {
      const overdue = t.dueDate && t.dueDate.getTime() < now && t.status !== "COMPLETE";
      const color = t.status === "COMPLETE" ? "#16a34a" : overdue ? "#dc2626" : "#3b82f6";
      return { label: t.title, start: t.startDate, end: t.dueDate, color, kind: "task" };
    }),
  ];
  const win = ganttWindow(items);

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-zinc-700">Timeline</h3>
      <p className="mb-4 text-xs text-zinc-400">Blue: in progress · green: complete · red: overdue.</p>
      {!win ? (
        <div className="text-sm text-zinc-400">Add start and due dates to see the timeline.</div>
      ) : (
        <div className="space-y-1">
          <div className="mb-2 flex justify-between text-xs text-zinc-400">
            <span>{formatDate(win.min)}</span>
            <span>{formatDate(win.max)}</span>
          </div>
          {items.map((it, i) => {
            const bar = ganttBar(it, win);
            return (
              <div key={i} className="flex items-center gap-2">
                <div className="w-40 shrink-0 truncate text-xs text-zinc-600" title={it.label}>
                  {it.kind === "milestone" ? "◆ " : ""}{it.label}
                </div>
                <div className="relative h-4 flex-1 rounded bg-zinc-50">
                  <div
                    className="absolute top-0 h-4 rounded"
                    style={{ left: `${bar.offsetPct}%`, width: `${bar.widthPct}%`, backgroundColor: it.color }}
                    title={`${formatDate(it.start)} – ${formatDate(it.end)}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Files / Discussions / Notes / Activity / Settings
// ---------------------------------------------------------------------------

async function FilesTab({ projectId }: { projectId: string }) {
  const files = await prisma.projectFile.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
  return (
    <div className="max-w-2xl">
      <Card className="mb-5">
        <form action={addFileAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input name="subject" required placeholder="Name" className={field} />
          <input name="url" required placeholder="https://link to file" className={`flex-1 ${field}`} />
          <label className="flex items-center gap-2 text-sm text-zinc-600"><input type="checkbox" name="visibleToCustomer" /> Customer</label>
          <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Add file</button>
        </form>
      </Card>
      <div className="flex flex-col gap-2">
        {files.map((f) => (
          <Card key={f.id} className="flex items-center justify-between">
            <div>
              <a href={f.externalLink ?? f.url ?? "#"} target="_blank" rel="noreferrer" className="font-medium text-zinc-900 hover:underline">{f.subject ?? f.fileName}</a>
              {f.description ? <div className="text-xs text-zinc-500">{f.description}</div> : null}
            </div>
            {f.visibleToCustomer ? <Badge className="bg-green-100 text-green-700">customer</Badge> : null}
          </Card>
        ))}
        {files.length === 0 ? <div className="text-sm text-zinc-400">No files yet.</div> : null}
      </div>
    </div>
  );
}

async function DiscussionsTab({ projectId }: { projectId: string }) {
  const discussions = await prisma.projectDiscussion.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });
  return (
    <div className="max-w-2xl">
      <Card className="mb-5">
        <details>
          <summary className="cursor-pointer text-sm font-medium text-zinc-900">New discussion</summary>
          <form action={createDiscussionAction} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input name="subject" required placeholder="Subject" className={field} />
            <textarea name="description" rows={2} placeholder="Description" className={field} />
            <label className="flex items-center gap-2 text-sm text-zinc-600"><input type="checkbox" name="showToCustomer" /> Show to customer</label>
            <div><button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Open discussion</button></div>
          </form>
        </details>
      </Card>
      <div className="flex flex-col gap-3">
        {discussions.map((d) => (
          <Card key={d.id}>
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-900">{d.subject}</span>
              {d.showToCustomer ? <Badge className="bg-green-100 text-green-700">customer</Badge> : null}
            </div>
            {d.description ? <p className="mt-1 text-sm text-zinc-600">{d.description}</p> : null}
            <ul className="mt-3 space-y-2 border-l-2 border-zinc-100 pl-3">
              {d.comments.map((c) => (
                <li key={c.id} className="text-sm text-zinc-700">{c.content}<span className="ml-2 text-xs text-zinc-400">{formatDate(c.createdAt)}</span></li>
              ))}
            </ul>
            <form action={addDiscussionCommentAction} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="discussionId" value={d.id} />
              <input name="content" required placeholder="Reply…" className={`flex-1 ${field}`} />
              <button className="text-sm text-zinc-600 hover:text-zinc-900">Reply</button>
            </form>
          </Card>
        ))}
        {discussions.length === 0 ? <div className="text-sm text-zinc-400">No discussions yet.</div> : null}
      </div>
    </div>
  );
}

async function NotesTab({ projectId }: { projectId: string }) {
  const notes = await prisma.projectNote.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
  return (
    <div className="max-w-2xl">
      <Card className="mb-5">
        <form action={addNoteAction} className="flex flex-col gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <textarea name="content" required rows={2} placeholder="Add a note…" className={field} />
          <div><button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Add note</button></div>
        </form>
      </Card>
      <div className="flex flex-col gap-2">
        {notes.map((n) => (
          <Card key={n.id}><p className="text-sm text-zinc-700">{n.content}</p><div className="mt-1 text-xs text-zinc-400">{formatDate(n.createdAt)}</div></Card>
        ))}
        {notes.length === 0 ? <div className="text-sm text-zinc-400">No notes yet.</div> : null}
      </div>
    </div>
  );
}

async function ActivityTab({ projectId }: { projectId: string }) {
  const activities = await prisma.projectActivity.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true } } },
  });
  return (
    <div className="max-w-2xl">
      <ul className="space-y-2">
        {activities.map((a) => (
          <li key={a.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
            <span className="text-zinc-700">{a.summary}</span>
            <span className="text-xs text-zinc-400">{a.actor?.name ?? "System"} · {formatDate(a.createdAt)}</span>
          </li>
        ))}
        {activities.length === 0 ? <li className="text-sm text-zinc-400">No activity yet.</li> : null}
      </ul>
    </div>
  );
}

const SETTING_KEYS: [string, string][] = [
  ["viewTasks", "View tasks"],
  ["createTasks", "Create tasks"],
  ["editTasks", "Edit tasks"],
  ["commentOnTasks", "Comment on tasks"],
  ["viewTaskComments", "View task comments"],
  ["viewTaskAttachments", "View task attachments"],
  ["viewTaskChecklistItems", "View task checklists"],
  ["uploadOnTasks", "Upload on tasks"],
  ["viewTaskTotalLoggedTime", "View task logged time"],
  ["viewFinanceOverview", "View finance overview"],
  ["uploadFiles", "Upload files"],
  ["openDiscussions", "Open discussions"],
  ["viewMilestones", "View milestones"],
  ["viewGantt", "View Gantt"],
  ["viewTimesheets", "View timesheets"],
  ["viewActivityLog", "View activity log"],
  ["viewTeamMembers", "View team members"],
  ["hideTasksOnMainTable", "Hide tasks on main table"],
];

function SettingsTab({ project }: { project: ProjectWithRels }) {
  const settings = (project.settings ?? {}) as Record<string, boolean>;
  return (
    <div className="max-w-2xl">
      <Card>
        <h3 className="mb-1 text-sm font-semibold text-zinc-700">Customer visibility</h3>
        <p className="mb-3 text-xs text-zinc-400">What the customer can see in their portal for this project.</p>
        <form action={updateSettingsAction}>
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SETTING_KEYS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" name={key} defaultChecked={Boolean(settings[key])} /> {label}
              </label>
            ))}
          </div>
          <div className="mt-4"><button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Save settings</button></div>
        </form>
      </Card>
    </div>
  );
}

function dateInput(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}
