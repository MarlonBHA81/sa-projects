import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";

export default async function LeadsPage({ params }: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await params;
  await requireUser();

  const build = await prisma.funnelBuild.findUnique({
    where: { id: buildId },
    select: { name: true, ghlLastSyncedAt: true },
  });
  if (!build) notFound();

  const leads = await prisma.lead.findMany({
    where: { funnelBuildId: buildId },
    orderBy: { syncedAt: "desc" },
    take: 200,
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-4 text-sm text-zinc-500">
        <Link href={`/builds/${buildId}`} className="hover:text-zinc-900">
          {build.name}
        </Link>
      </div>
      <PageHeader
        title="Leads"
        subtitle={
          build.ghlLastSyncedAt
            ? `Last synced from GoHighLevel ${formatDate(build.ghlLastSyncedAt)}.`
            : "Not synced from GoHighLevel yet."
        }
      />
      {leads.length === 0 ? (
        <EmptyState>No leads yet. Sync from GoHighLevel from the build page.</EmptyState>
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Added</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-b border-zinc-50">
                  <td className="px-4 py-2 text-zinc-900">{l.name ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-600">{l.email ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-600">{l.source ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-500">{formatDate(l.ghlCreatedAt ?? l.syncedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
