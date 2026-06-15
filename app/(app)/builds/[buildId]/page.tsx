import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { Badge, LinkButton, PageHeader } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import {
  deliverableStatusClass,
  deliverableStatusLabel,
  departmentLabel,
  deliveryTypeLabel,
  phaseLabel,
  stageStatusClass,
  stageStatusLabel,
} from "@/lib/labels";

export default async function BuildPage({ params }: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await params;
  await requireUser();

  const build = await prisma.funnelBuild.findUnique({
    where: { id: buildId },
    include: {
      engagement: { include: { client: true } },
      stages: {
        orderBy: { order: "asc" },
        include: {
          deliverables: {
            orderBy: { order: "asc" },
            include: { assignee: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!build) notFound();

  const paused = build.stages.some((s) => s.status === "PAUSED");

  return (
    <div>
      <PageHeader
        title={build.name}
        subtitle={`${build.engagement.client.name} · ${deliveryTypeLabel[build.engagement.deliveryType]} · ${phaseLabel[build.currentPhase]}`}
      >
        <LinkButton href={`/builds/${build.id}/playbook`}>Brand Messaging Playbook</LinkButton>
      </PageHeader>

      {paused ? (
        <div className="mb-6 rounded-xl border border-purple-200 bg-purple-50 px-5 py-3 text-sm text-purple-900">
          Copy changed. Design and build are paused. Re-sync before you carry on.
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        {build.stages.map((stage) => (
          <section key={stage.id} className="rounded-xl border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-zinc-400">
                  Stage {stage.order}
                </span>
                <span className="font-medium text-zinc-900">{stage.title}</span>
                <span className="text-xs text-zinc-400">{phaseLabel[stage.phase]}</span>
              </div>
              <Badge className={stageStatusClass[stage.status]}>
                {stageStatusLabel[stage.status]}
              </Badge>
            </div>
            <div className="divide-y divide-zinc-100">
              {stage.deliverables.map((d) => (
                <Link
                  key={d.id}
                  href={`/builds/${build.id}/deliverables/${d.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900">{d.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                      <span>{departmentLabel[d.department]}</span>
                      {d.assignee?.name ? <span>· {d.assignee.name}</span> : null}
                      <span>· est {formatMinutes(d.estimateMinutes)}</span>
                      {d.kind === "OPTIONS_REQUIRED" ? <span>· options</span> : null}
                      {d.requiresGruntTest ? <span>· grunt test</span> : null}
                    </div>
                  </div>
                  <Badge className={deliverableStatusClass[d.status]}>
                    {deliverableStatusLabel[d.status]}
                  </Badge>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
