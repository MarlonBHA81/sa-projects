import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth-helpers";
import { notDeleted } from "@/lib/soft-delete";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import {
  billingTypeLabel,
  departmentLabel,
  templateKindClass,
  templateKindLabel,
} from "@/lib/labels";
import { useTemplateAction } from "../projects/actions";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/projects");
  const { error } = await searchParams;

  const templates = await prisma.projectTemplate.findMany({
    where: { ...notDeleted },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      milestones: { orderBy: { order: "asc" }, select: { id: true, name: true, color: true } },
      tasks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          templateMilestoneId: true,
          estimateMinutes: true,
          defaultAssigneeRole: true,
        },
      },
    },
  });

  const field = "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm";

  return (
    <div className="max-w-5xl">
      <div className="mb-4 text-sm text-zinc-500">
        <Link href="/projects" className="hover:text-zinc-900">
          Projects
        </Link>
      </div>
      <PageHeader
        title="Project templates"
        subtitle="Reusable project skeletons. Start a project from one to seed its milestones and tasks."
      />
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {templates.length === 0 ? (
        <EmptyState>No templates yet. Run the seed to add the standard ones.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {templates.map((t) => {
            const tasksByMilestone = (milestoneId: string | null) =>
              t.tasks.filter((task) => task.templateMilestoneId === milestoneId);
            const looseTasks = tasksByMilestone(null);
            return (
              <Card key={t.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-zinc-900">{t.name}</h2>
                      <Badge className={templateKindClass[t.kind]}>{templateKindLabel[t.kind]}</Badge>
                      {!t.isActive ? (
                        <Badge className="bg-zinc-100 text-zinc-500">Inactive</Badge>
                      ) : null}
                    </div>
                    {t.description ? (
                      <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t.description}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-400">
                      {t.milestones.length} milestones · {t.tasks.length} tasks
                      {t.defaultBillingType
                        ? ` · ${billingTypeLabel[t.defaultBillingType].toLowerCase()}`
                        : null}
                    </p>
                  </div>

                  {/* Use this template */}
                  <form action={useTemplateAction} className="flex shrink-0 flex-col gap-2">
                    <input type="hidden" name="templateId" value={t.id} />
                    <input
                      name="name"
                      required
                      placeholder="New project name"
                      defaultValue={t.name}
                      className={field}
                    />
                    <input type="date" name="startDate" className={field} />
                    <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
                      Use this template
                    </button>
                  </form>
                </div>

                {/* Preview of the milestone/task tree */}
                {t.milestones.length > 0 || looseTasks.length > 0 ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-2">
                    {t.milestones.map((m) => {
                      const tasks = tasksByMilestone(m.id);
                      return (
                        <div key={m.id} className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-800">
                            {m.color ? (
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: m.color }}
                              />
                            ) : null}
                            {m.name}
                            <span className="text-xs font-normal text-zinc-400">
                              {tasks.length} tasks
                            </span>
                          </div>
                          <ul className="flex flex-col gap-0.5 text-xs text-zinc-600">
                            {tasks.map((task) => (
                              <li key={task.id} className="flex items-center justify-between gap-2">
                                <span className="truncate">{task.title}</span>
                                <span className="shrink-0 text-zinc-400">
                                  {task.defaultAssigneeRole
                                    ? departmentLabel[task.defaultAssigneeRole]
                                    : ""}
                                  {task.estimateMinutes
                                    ? ` · ${formatMinutes(task.estimateMinutes)}`
                                    : ""}
                                </span>
                              </li>
                            ))}
                            {tasks.length === 0 ? (
                              <li className="text-zinc-400">No tasks</li>
                            ) : null}
                          </ul>
                        </div>
                      );
                    })}
                    {looseTasks.length > 0 ? (
                      <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                        <div className="mb-1 text-sm font-medium text-zinc-800">No milestone</div>
                        <ul className="flex flex-col gap-0.5 text-xs text-zinc-600">
                          {looseTasks.map((task) => (
                            <li key={task.id} className="truncate">
                              {task.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-400">
                    Empty template. Creates a project with no milestones or tasks.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
