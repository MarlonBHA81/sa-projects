import { prisma } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth-helpers";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export default async function ClientsPage() {
  const user = await requireUser();
  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: { engagements: { where: { deletedAt: null }, select: { id: true } } },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Clients" subtitle="The brands you serve.">
        {isAdmin(user) ? (
          <LinkButton href="/clients/new" variant="primary">
            New client
          </LinkButton>
        ) : null}
      </PageHeader>
      {clients.length === 0 ? (
        <EmptyState>No clients yet.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {clients.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-zinc-900">{c.name}</div>
                  {c.industry ? <div className="text-sm text-zinc-500">{c.industry}</div> : null}
                </div>
                <span className="text-sm text-zinc-500">
                  {c.engagements.length} {c.engagements.length === 1 ? "engagement" : "engagements"}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
