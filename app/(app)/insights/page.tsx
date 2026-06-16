import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { aiConfigured } from "@/lib/ai/client";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { aiInsightStatusLabel, aiScopeLabel, aiSeverityClass } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { analyseTrendsAction, resolveInsightAction } from "./actions";

const btn = "rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50";

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const insights = await prisma.aiInsight.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 60,
  });

  // Resolve build links for deliverable- and build-scoped insights.
  const deliverableIds = insights.filter((i) => i.scope === "DELIVERABLE").map((i) => i.scopeId);
  const delivs = deliverableIds.length
    ? await prisma.deliverable.findMany({
        where: { id: { in: deliverableIds } },
        select: { id: true, funnelBuildId: true },
      })
    : [];
  const buildOfDeliverable = new Map(delivs.map((d) => [d.id, d.funnelBuildId]));

  const cost = isAdmin
    ? await prisma.aiUsageLog.aggregate({ _sum: { costUsd: true } })
    : null;

  function linkFor(scope: string, scopeId: string): string | null {
    if (scope === "BUILD") return `/builds/${scopeId}`;
    if (scope === "DELIVERABLE") {
      const b = buildOfDeliverable.get(scopeId);
      return b ? `/builds/${b}/deliverables/${scopeId}` : null;
    }
    return null;
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Insights" subtitle="What the advisory AI is seeing. It suggests; you decide.">
        {isAdmin ? (
          <form action={analyseTrendsAction}>
            <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
              Analyse portfolio trends
            </button>
          </form>
        ) : null}
      </PageHeader>

      {!aiConfigured() ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          AI monitoring is off. Add ANTHROPIC_API_KEY to enable it.
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {isAdmin && cost?._sum.costUsd ? (
        <p className="mb-4 text-xs text-zinc-400">AI spend to date: ${Number(cost._sum.costUsd).toFixed(2)}</p>
      ) : null}

      {insights.length === 0 ? (
        <EmptyState>No insights yet. Submit work or run an analysis to see suggestions.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {insights.map((i) => {
            const href = linkFor(i.scope, i.scopeId);
            const findings = (i.detail as { findings?: string[] } | null)?.findings ?? [];
            const suggestions = (i.suggestions as { text: string; rationale?: string }[] | null) ?? [];
            const resolved = i.status !== "NEW";
            return (
              <Card key={i.id} className={resolved ? "opacity-70" : ""}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge className={aiSeverityClass[i.severity]}>{i.severity}</Badge>
                    <Badge className="bg-zinc-100 text-zinc-600">{aiScopeLabel[i.scope]}</Badge>
                    <span className="text-sm font-medium text-zinc-900">{i.title}</span>
                  </div>
                  <span className="text-xs text-zinc-400">
                    {i.status !== "NEW" ? `${aiInsightStatusLabel[i.status]} · ` : ""}
                    {formatDate(i.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-600">{i.summary}</p>
                {findings.length ? (
                  <ul className="mt-2 list-disc pl-5 text-sm text-zinc-600">
                    {findings.map((f, idx) => (
                      <li key={idx}>{f}</li>
                    ))}
                  </ul>
                ) : null}
                {suggestions.length ? (
                  <div className="mt-2 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">
                    <div className="mb-1 text-xs font-semibold text-zinc-500">Suggested</div>
                    <ul className="list-disc pl-5">
                      {suggestions.map((s, idx) => (
                        <li key={idx}>
                          {s.text}
                          {s.rationale ? <span className="text-zinc-400"> — {s.rationale}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-3 flex items-center gap-2">
                  {href ? (
                    <Link href={href} className={btn}>
                      View
                    </Link>
                  ) : null}
                  {isAdmin && !resolved ? (
                    <>
                      <form action={resolveInsightAction}>
                        <input type="hidden" name="insightId" value={i.id} />
                        <input type="hidden" name="status" value="APPLIED" />
                        <button className={btn}>Apply</button>
                      </form>
                      <form action={resolveInsightAction}>
                        <input type="hidden" name="insightId" value={i.id} />
                        <input type="hidden" name="status" value="ACKNOWLEDGED" />
                        <button className={btn}>Acknowledge</button>
                      </form>
                      <form action={resolveInsightAction}>
                        <input type="hidden" name="insightId" value={i.id} />
                        <input type="hidden" name="status" value="DISMISSED" />
                        <button className={btn}>Dismiss</button>
                      </form>
                    </>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
