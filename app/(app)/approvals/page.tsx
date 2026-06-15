import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { departmentLabel } from "@/lib/labels";
import { approveFromQueue, requestChangesFromQueue } from "./actions";

const secondary =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50";
const primary = "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700";

export default async function ApprovalsPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");

  const submitted = await prisma.deliverable.findMany({
    where: { status: "SUBMITTED" },
    orderBy: { updatedAt: "asc" },
    include: {
      funnelBuild: { select: { id: true, name: true, engagement: { select: { client: { select: { name: true } } } } } },
      optionSet: { select: { selectedOptionId: true, options: { select: { id: true } } } },
      checklistItems: { select: { required: true, checked: true } },
    },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Approvals"
        subtitle="Clear each gate element by element. Nothing moves until you do."
      />
      {submitted.length === 0 ? (
        <EmptyState>Nothing is waiting on approval. Good place to be.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {submitted.map((d) => {
            const needsSelection = d.optionSet ? !d.optionSet.selectedOptionId : false;
            const checklistDone = d.checklistItems.filter((c) => c.required).every((c) => c.checked);
            return (
              <Card key={d.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/builds/${d.funnelBuild.id}/deliverables/${d.id}`}
                      className="text-sm font-medium text-zinc-900 hover:underline"
                    >
                      {d.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {d.funnelBuild.engagement.client.name} · {d.funnelBuild.name} ·{" "}
                      {departmentLabel[d.department]}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {needsSelection ? (
                      <Badge className="bg-amber-100 text-amber-800">choose an option</Badge>
                    ) : null}
                    {!checklistDone ? (
                      <Badge className="bg-orange-100 text-orange-800">checklist incomplete</Badge>
                    ) : null}
                    <Link href={`/builds/${d.funnelBuild.id}/deliverables/${d.id}`} className={secondary}>
                      Review
                    </Link>
                    <form action={approveFromQueue}>
                      <input type="hidden" name="deliverableId" value={d.id} />
                      <input type="hidden" name="buildId" value={d.funnelBuild.id} />
                      <button className={primary}>Approve</button>
                    </form>
                  </div>
                </div>
                <form action={requestChangesFromQueue} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="deliverableId" value={d.id} />
                  <input type="hidden" name="buildId" value={d.funnelBuild.id} />
                  <input
                    name="note"
                    placeholder="What needs changing?"
                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                  />
                  <button className={secondary}>Request changes</button>
                </form>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
