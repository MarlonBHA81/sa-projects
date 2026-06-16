import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth-helpers";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import {
  deliverableStatusClass,
  deliverableStatusLabel,
  deliveryTypeLabel,
  phaseLabel,
} from "@/lib/labels";

export default async function DashboardPage() {
  const user = await requireUser();

  const builds = await prisma.funnelBuild.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      engagement: { include: { client: true } },
      deliverables: { where: { deletedAt: null }, select: { status: true } },
    },
  });

  const myWork = await prisma.deliverable.findMany({
    where: {
      assigneeId: user.id,
      deletedAt: null,
      status: { in: ["NOT_STARTED", "IN_PROGRESS", "CHANGES_NEEDED"] },
    },
    include: { funnelBuild: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 12,
  });

  const pendingApprovals =
    (user.role === "ADMIN" || user.role === "SUPER_ADMIN") ? await prisma.deliverable.count({ where: { status: "SUBMITTED", deletedAt: null } }) : 0;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Where every funnel build stands right now.">
        {isAdmin(user) ? (
          <LinkButton href="/start" variant="primary">
            Start a project
          </LinkButton>
        ) : null}
      </PageHeader>

      {(user.role === "ADMIN" || user.role === "SUPER_ADMIN") && pendingApprovals > 0 ? (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-5 py-3">
          <span className="text-sm text-amber-900">
            {pendingApprovals} {pendingApprovals === 1 ? "item is" : "items are"} waiting on your approval.
          </span>
          <LinkButton href="/approvals" variant="primary">
            Review approvals
          </LinkButton>
        </div>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold text-zinc-500">Funnel builds</h2>
      {builds.length === 0 ? (
        <EmptyState>No funnel builds yet. Create an engagement to get started.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {builds.map((b) => {
            const total = b.deliverables.length;
            const approved = b.deliverables.filter((d) => d.status === "APPROVED").length;
            const pct = total ? Math.round((approved / total) * 100) : 0;
            return (
              <Link key={b.id} href={`/builds/${b.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">{b.engagement.client.name}</span>
                    <Badge className="bg-zinc-100 text-zinc-600">
                      {deliveryTypeLabel[b.engagement.deliveryType]}
                    </Badge>
                  </div>
                  <div className="mt-1 font-medium text-zinc-900">{b.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{phaseLabel[b.currentPhase]}</div>
                  <div className="mt-4">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {approved} of {total} approved
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-500">Your queue</h2>
      {myWork.length === 0 ? (
        <EmptyState>Nothing assigned to you right now.</EmptyState>
      ) : (
        <Card className="divide-y divide-zinc-100 p-0">
          {myWork.map((d) => (
            <Link
              key={d.id}
              href={`/builds/${d.funnelBuild.id}/deliverables/${d.id}`}
              className="flex items-center justify-between px-5 py-3 hover:bg-zinc-50"
            >
              <div>
                <div className="text-sm font-medium text-zinc-900">{d.title}</div>
                <div className="text-xs text-zinc-500">{d.funnelBuild.name}</div>
              </div>
              <Badge className={deliverableStatusClass[d.status]}>
                {deliverableStatusLabel[d.status]}
              </Badge>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
