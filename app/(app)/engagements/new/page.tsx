import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth-helpers";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { deliveryTypeLabel, engagementStatusLabel } from "@/lib/labels";
import { createEngagementAction } from "./actions";
import type { DeliveryType, EngagementStatus } from "@prisma/client";

const DELIVERY: DeliveryType[] = ["DFY", "DWY", "DIY"];
const STATUS: EngagementStatus[] = ["LEAD", "PROPOSED", "WON", "ACTIVE", "COMPLETED", "LOST"];

export default async function NewEngagementPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/engagements");
  const { error } = await searchParams;
  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const field = "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm";

  return (
    <div className="max-w-lg">
      <div className="mb-4 text-sm text-zinc-500">
        <Link href="/engagements" className="hover:text-zinc-900">
          Engagements
        </Link>
      </div>
      <PageHeader title="New engagement" subtitle="The commercial deal and its delivery model." />
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {clients.length === 0 ? (
        <EmptyState>
          Create a client first. <Link href="/clients/new" className="font-medium text-zinc-700 underline">New client</Link>
        </EmptyState>
      ) : (
        <Card>
          <form action={createEngagementAction} className="flex flex-col gap-4">
            <label className="text-sm font-medium text-zinc-700">
              Client
              <select name="clientId" required className={field} defaultValue="">
                <option value="" disabled>
                  Pick a client
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Name
              <input name="name" required className={field} placeholder="e.g. Lead magnet funnel" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-zinc-700">
                Delivery model
                <select name="deliveryType" className={field} defaultValue="DFY">
                  {DELIVERY.map((d) => (
                    <option key={d} value={d}>
                      {deliveryTypeLabel[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-zinc-700">
                Status
                <select name="status" className={field} defaultValue="ACTIVE">
                  {STATUS.map((s) => (
                    <option key={s} value={s}>
                      {engagementStatusLabel[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-sm font-medium text-zinc-700">
                List price
                <input name="listPrice" type="number" min="0" className={field} />
              </label>
              <label className="text-sm font-medium text-zinc-700">
                Selling price
                <input name="price" type="number" min="0" className={field} />
              </label>
              <label className="text-sm font-medium text-zinc-700">
                Currency
                <input name="currency" defaultValue="ZAR" className={field} />
              </label>
            </div>
            <button className="self-start rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
              Create engagement
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}
