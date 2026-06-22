import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth-helpers";
import { notDeleted } from "@/lib/soft-delete";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  billingTypeLabel,
  projectStatusClass,
  projectStatusLabel,
  templateKindLabel,
} from "@/lib/labels";
import { createProjectAction } from "./actions";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; new?: string }>;
}) {
  const user = await requireUser();
  const { error, new: showNew } = await searchParams;

  const [projects, clients, members, templates] = await Promise.all([
    prisma.project.findMany({
      where: notDeleted,
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { name: true } },
        owner: { select: { name: true } },
        tasks: { where: notDeleted, select: { status: true } },
      },
    }),
    prisma.client.findMany({ where: notDeleted, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { department: { not: null } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.projectTemplate.findMany({
      where: { isActive: true, ...notDeleted },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true },
    }),
  ]);

  // Default the picker to the blank (UNSTRUCTURED) template if one exists.
  const blankTemplateId = templates.find((t) => t.kind === "UNSTRUCTURED")?.id ?? "";

  const field = "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm";

  return (
    <div className="max-w-5xl">
      <PageHeader title="Projects" subtitle="Plan and deliver client work. Tasks, milestones, time and finance in one place.">
        {isAdmin(user) ? <LinkButton href="/templates">Templates</LinkButton> : null}
      </PageHeader>
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="mb-6">
        <details open={Boolean(showNew)}>
          <summary className="cursor-pointer text-sm font-medium text-zinc-900">New project</summary>
          <form action={createProjectAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-zinc-500">Template</span>
              <select name="templateId" defaultValue={blankTemplateId} className={field}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({templateKindLabel[t.kind].toLowerCase()})
                  </option>
                ))}
              </select>
              <span className="text-xs text-zinc-400">
                A template seeds milestones and tasks. Blank starts empty.
              </span>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-zinc-500">Name</span>
              <input name="name" required placeholder="Project name" className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Customer</span>
              <select name="clientId" defaultValue="" className={field}>
                <option value="">No customer</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Billing type</span>
              <select name="billingType" defaultValue="FIXED_RATE" className={field}>
                <option value="FIXED_RATE">Fixed rate</option>
                <option value="PROJECT_HOURS">Project hours</option>
                <option value="TASK_HOURS">Task hours</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Start date</span>
              <input type="date" name="startDate" className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Deadline</span>
              <input type="date" name="deadline" className={field} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-zinc-500">Members</span>
              <select name="memberIds" multiple className={`${field} h-24`}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
                Create project
              </button>
            </div>
          </form>
        </details>
      </Card>

      {projects.length === 0 ? (
        <EmptyState>No projects yet.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Billing</th>
                <th className="px-4 py-2 font-medium">Progress</th>
                <th className="px-4 py-2 font-medium">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                  <td className="px-4 py-2">
                    <Link href={`/projects/${p.id}`} className="font-medium text-zinc-900 hover:underline">
                      {p.name}
                    </Link>
                    <div className="text-xs text-zinc-400">{p.tasks.length} tasks</div>
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{p.client?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge className={projectStatusClass[p.status]}>{projectStatusLabel[p.status]}</Badge>
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{billingTypeLabel[p.billingType]}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full bg-zinc-900" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="text-xs text-zinc-500">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{formatDate(p.deadline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
