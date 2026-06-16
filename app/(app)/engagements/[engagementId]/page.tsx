import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { getEngagementFinancials } from "@/lib/finance-service";
import { Badge, Card, PageHeader } from "@/components/ui";
import { deliveryTypeLabel, engagementStatusLabel } from "@/lib/labels";
import { formatMoney, formatHours, formatDate } from "@/lib/format";
import { addBuildAction, addCostAction, generatePnLAction, syncPaymentsAction } from "./actions";
import { deleteEntityAction } from "@/app/(app)/manage-actions";

export default async function EngagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ engagementId: string }>;
  searchParams: Promise<{ error?: string; completed?: string }>;
}) {
  const { engagementId } = await params;
  const { error, completed } = await searchParams;
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    include: {
      client: true,
      funnelBuilds: {
        where: { deletedAt: null },
        include: { deliverables: { where: { deletedAt: null }, select: { status: true } } },
      },
      costs: { orderBy: { createdAt: "desc" } },
      pnl: true,
    },
  });
  if (!engagement) notFound();

  const fin = isAdmin ? await getEngagementFinancials(engagementId) : null;
  const currency = engagement.currency;

  return (
    <div className="max-w-3xl">
      <div className="mb-4 text-sm text-zinc-500">
        <Link href="/engagements" className="hover:text-zinc-900">
          Engagements
        </Link>
      </div>
      <PageHeader title={engagement.name} subtitle={engagement.client.name}>
        <Badge className="bg-zinc-100 text-zinc-600">{deliveryTypeLabel[engagement.deliveryType]}</Badge>
        <Badge className="bg-blue-100 text-blue-700">{engagementStatusLabel[engagement.status]}</Badge>
      </PageHeader>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {completed ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          Engagement completed and P&L generated.
        </div>
      ) : null}

      {/* Financials (admin only) */}
      {isAdmin && fin ? (
        <Card className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">Financials</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="Revenue" value={formatMoney(fin.revenueTotal, currency)} />
            <Figure label="Delivery cost" value={formatMoney(fin.deliveryCost, currency)} />
            <Figure label="Ad spend + other" value={formatMoney(fin.adSpend + fin.otherCosts, currency)} />
            <Figure
              label="Margin"
              value={`${fin.marginPct}%`}
              hint={formatMoney(fin.grossProfit, currency)}
            />
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            {formatHours(fin.loggedMinutes)} logged.{" "}
            {fin.paymentsTotal > 0
              ? "Revenue is actual payments synced from GoHighLevel."
              : "Revenue is the planned engagement price (no payments synced yet)."}
          </p>
        </Card>
      ) : null}

      {/* P&L (admin) */}
      {isAdmin && engagement.pnl ? (
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700">Profit and loss</h3>
            <span className="text-xs text-zinc-400">Generated {formatDate(engagement.pnl.generatedAt)}</span>
          </div>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {(engagement.pnl.lines as { label: string; type: string; amount: number }[]).map((l, i) => (
                <tr key={i} className="border-b border-zinc-100">
                  <td className="py-1.5 text-zinc-600">{l.label}</td>
                  <td className={`py-1.5 text-right ${l.type === "revenue" ? "text-green-700" : "text-zinc-700"}`}>
                    {l.type === "cost" ? "-" : ""}
                    {formatMoney(l.amount, currency)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 font-medium text-zinc-900">
                  Gross profit ({engagement.pnl.marginPct}%)
                </td>
                <td className="py-1.5 text-right font-medium text-zinc-900">
                  {formatMoney(engagement.pnl.grossProfit, currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      ) : null}

      {/* Builds */}
      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">Funnel builds</h3>
        <div className="flex flex-col gap-2">
          {engagement.funnelBuilds.map((b) => {
            const total = b.deliverables.length;
            const approved = b.deliverables.filter((d) => d.status === "APPROVED").length;
            return (
              <Link
                key={b.id}
                href={`/builds/${b.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
              >
                <span className="font-medium text-zinc-900">{b.name}</span>
                <span className="text-xs text-zinc-500">
                  {approved} of {total} approved
                </span>
              </Link>
            );
          })}
          {engagement.funnelBuilds.length === 0 ? (
            <p className="text-sm text-zinc-500">No builds yet.</p>
          ) : null}
        </div>
        {isAdmin ? (
          <form action={addBuildAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
            <input type="hidden" name="engagementId" value={engagementId} />
            <input
              name="name"
              placeholder="Build name"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
            />
            <select
              name="conversionGoal"
              defaultValue=""
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
            >
              <option value="">Goal…</option>
              <option value="BOOK_A_CALL">Book a call</option>
              <option value="BUY">Buy</option>
              <option value="REGISTER">Register</option>
            </select>
            <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Add build from template
            </button>
          </form>
        ) : null}
      </Card>

      {/* Costs + complete (admin) */}
      {isAdmin ? (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">Costs and completion</h3>
          {engagement.costs.length ? (
            <ul className="mb-3 flex flex-col gap-1 text-sm text-zinc-600">
              {engagement.costs.map((c) => (
                <li key={c.id} className="flex justify-between">
                  <span>{c.label}</span>
                  <span>{formatMoney(c.amount, currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-zinc-500">No ad-hoc costs recorded. Invoicing stays in GoHighLevel.</p>
          )}
          <form action={addCostAction} className="mb-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
            <input type="hidden" name="engagementId" value={engagementId} />
            <input name="label" placeholder="Cost label" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
            <input name="amount" type="number" min="0" placeholder="Amount" className="w-28 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
            <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Add cost
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <form action={syncPaymentsAction}>
              <input type="hidden" name="engagementId" value={engagementId} />
              <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                Sync payments from GHL
              </button>
            </form>
            <form action={generatePnLAction}>
              <input type="hidden" name="engagementId" value={engagementId} />
              <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
                {engagement.status === "COMPLETED" ? "Regenerate P&L" : "Complete and generate P&L"}
              </button>
            </form>
            <form action={deleteEntityAction}>
              <input type="hidden" name="entity" value="engagement" />
              <input type="hidden" name="id" value={engagementId} />
              <input type="hidden" name="redirectTo" value="/engagements" />
              <button className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
                Delete engagement
              </button>
            </form>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{value}</div>
      {hint ? <div className="text-xs text-zinc-400">{hint}</div> : null}
    </div>
  );
}
