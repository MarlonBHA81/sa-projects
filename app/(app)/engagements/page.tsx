import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { deliveryTypeLabel, engagementStatusLabel } from "@/lib/labels";
import { formatMoney } from "@/lib/format";

export default async function EngagementsPage() {
  await requireUser();
  const engagements = await prisma.engagement.findMany({
    orderBy: { createdAt: "desc" },
    include: { client: true, funnelBuilds: { select: { id: true, name: true } } },
  });

  return (
    <div>
      <PageHeader title="Engagements" subtitle="The commercial work, by delivery model." />
      {engagements.length === 0 ? (
        <EmptyState>No engagements yet.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {engagements.map((e) => (
            <Card key={e.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link
                    href={`/engagements/${e.id}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {e.name}
                  </Link>
                  <div className="text-sm text-zinc-500">{e.client.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-zinc-100 text-zinc-600">
                    {deliveryTypeLabel[e.deliveryType]}
                  </Badge>
                  <Badge className="bg-blue-100 text-blue-700">
                    {engagementStatusLabel[e.status]}
                  </Badge>
                  <span className="text-sm font-medium text-zinc-900">
                    {formatMoney(e.price, e.currency)}
                  </span>
                </div>
              </div>
              {e.funnelBuilds.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {e.funnelBuilds.map((b) => (
                    <Link
                      key={b.id}
                      href={`/builds/${b.id}`}
                      className="rounded-lg border border-zinc-200 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      {b.name}
                    </Link>
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
