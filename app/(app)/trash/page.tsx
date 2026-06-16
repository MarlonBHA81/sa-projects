import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, isSuperAdmin } from "@/lib/auth-helpers";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { restoreAction, purgeAction } from "../manage-actions";

type TrashRow = { entity: string; id: string; label: string };

export default async function TrashPage() {
  const user = await requireUser();
  if (!isSuperAdmin(user)) redirect("/dashboard");

  const deleted = { deletedAt: { not: null } } as const;
  const [clients, engagements, builds, deliverables, sprints, projects, tasks] = await Promise.all([
    prisma.client.findMany({ where: deleted, select: { id: true, name: true } }),
    prisma.engagement.findMany({ where: deleted, select: { id: true, name: true } }),
    prisma.funnelBuild.findMany({ where: deleted, select: { id: true, name: true } }),
    prisma.deliverable.findMany({ where: deleted, select: { id: true, title: true } }),
    prisma.sprint.findMany({ where: deleted, select: { id: true, name: true } }),
    prisma.project.findMany({ where: deleted, select: { id: true, name: true } }),
    prisma.task.findMany({ where: deleted, select: { id: true, title: true } }),
  ]);

  const rows: TrashRow[] = [
    ...clients.map((c) => ({ entity: "client", id: c.id, label: `Client: ${c.name}` })),
    ...engagements.map((e) => ({ entity: "engagement", id: e.id, label: `Engagement: ${e.name}` })),
    ...builds.map((b) => ({ entity: "funnelBuild", id: b.id, label: `Build: ${b.name}` })),
    ...deliverables.map((d) => ({ entity: "deliverable", id: d.id, label: `Deliverable: ${d.title}` })),
    ...sprints.map((s) => ({ entity: "sprint", id: s.id, label: `Sprint: ${s.name}` })),
    ...projects.map((p) => ({ entity: "project", id: p.id, label: `Project: ${p.name}` })),
    ...tasks.map((t) => ({ entity: "task", id: t.id, label: `Task: ${t.title}` })),
  ];

  const ghost = "rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50";

  return (
    <div className="max-w-2xl">
      <PageHeader title="Trash" subtitle="Deleted items. Restore them, or remove them for good." />
      {rows.length === 0 ? (
        <EmptyState>Nothing in the trash.</EmptyState>
      ) : (
        <Card className="divide-y divide-zinc-100 p-0">
          {rows.map((r) => (
            <div key={`${r.entity}:${r.id}`} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-zinc-700">{r.label}</span>
              <div className="flex items-center gap-2">
                <form action={restoreAction}>
                  <input type="hidden" name="entity" value={r.entity} />
                  <input type="hidden" name="id" value={r.id} />
                  <button className={ghost}>Restore</button>
                </form>
                <form action={purgeAction}>
                  <input type="hidden" name="entity" value={r.entity} />
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700">
                    Delete for good
                  </button>
                </form>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
