import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { Badge, LinkButton, PageHeader } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { analyseBuildAction, syncGhlAction } from "./actions";
import { deleteEntityAction } from "@/app/(app)/manage-actions";
import {
  deliverableStatusClass,
  deliverableStatusLabel,
  departmentLabel,
  deliveryTypeLabel,
  phaseLabel,
  stageStatusClass,
  stageStatusLabel,
} from "@/lib/labels";

export default async function BuildPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { buildId } = await params;
  const { error } = await searchParams;
  const user = await requireUser();

  const build = await prisma.funnelBuild.findUnique({
    where: { id: buildId },
    include: {
      engagement: { include: { client: true } },
      stages: {
        orderBy: { order: "asc" },
        include: {
          deliverables: {
            where: { deletedAt: null },
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
        <LinkButton href={`/builds/${build.id}/board`}>Board</LinkButton>
        <LinkButton href={`/builds/${build.id}/leads`}>Leads</LinkButton>
        {user.role === "ADMIN" || user.role === "SUPER_ADMIN" || user.role === "SALES" ? (
          <form action={syncGhlAction}>
            <input type="hidden" name="buildId" value={build.id} />
            <button className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Sync from GHL
            </button>
          </form>
        ) : null}
        {user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? (
          <>
            <form action={analyseBuildAction}>
              <input type="hidden" name="buildId" value={build.id} />
              <button className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                Analyse build
              </button>
            </form>
            <form action={deleteEntityAction}>
              <input type="hidden" name="entity" value="funnelBuild" />
              <input type="hidden" name="id" value={build.id} />
              <input type="hidden" name="redirectTo" value={`/engagements/${build.engagementId}`} />
              <button className="inline-flex items-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
                Delete build
              </button>
            </form>
          </>
        ) : null}
      </PageHeader>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

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
