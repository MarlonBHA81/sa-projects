import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui";
import { deliverableStatusClass, deliverableStatusLabel, departmentLabel } from "@/lib/labels";
import { formatMinutes } from "@/lib/format";
import type { Department, DeliverableStatus } from "@prisma/client";

const COLUMNS: DeliverableStatus[] = [
  "BLOCKED",
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "CHANGES_NEEDED",
  "APPROVED",
  "PAUSED",
];

const DEPARTMENTS: Department[] = ["STRATEGY", "COPY", "DESIGN", "DEV", "SALES"];

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildId: string }>;
  searchParams: Promise<{ dept?: string }>;
}) {
  const { buildId } = await params;
  const { dept } = await searchParams;
  await requireUser();
  const activeDept = DEPARTMENTS.includes(dept as Department) ? (dept as Department) : null;

  const build = await prisma.funnelBuild.findUnique({
    where: { id: buildId },
    select: { name: true },
  });
  if (!build) notFound();

  const deliverables = await prisma.deliverable.findMany({
    where: { funnelBuildId: buildId, ...(activeDept ? { department: activeDept } : {}) },
    orderBy: { order: "asc" },
    include: { assignee: { select: { name: true } } },
  });

  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-1 text-sm ${active ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`;

  return (
    <div>
      <div className="mb-4 text-sm text-zinc-500">
        <Link href={`/builds/${buildId}`} className="hover:text-zinc-900">
          {build.name}
        </Link>
      </div>
      <PageHeader title="Board" subtitle="Work by status. Filter by department." />

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={`/builds/${buildId}/board`} className={tabClass(!activeDept)}>
          All
        </Link>
        {DEPARTMENTS.map((d) => (
          <Link key={d} href={`/builds/${buildId}/board?dept=${d}`} className={tabClass(activeDept === d)}>
            {departmentLabel[d]}
          </Link>
        ))}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((status) => {
          const items = deliverables.filter((d) => d.status === status);
          return (
            <div key={status} className="w-64 shrink-0">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700">{deliverableStatusLabel[status]}</span>
                <span className="text-xs text-zinc-400">{items.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((d) => (
                  <Link
                    key={d.id}
                    href={`/builds/${buildId}/deliverables/${d.id}`}
                    className="rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm hover:shadow"
                  >
                    <div className="font-medium text-zinc-900">{d.title}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>{departmentLabel[d.department]}</span>
                      <span>{formatMinutes(d.estimateMinutes)}</span>
                    </div>
                    {d.assignee?.name ? (
                      <div className="mt-1 text-xs text-zinc-400">{d.assignee.name}</div>
                    ) : null}
                  </Link>
                ))}
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-200 p-3 text-xs text-zinc-300">
                    Empty
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
