import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { Badge, Card, PageHeader } from "@/components/ui";
import { departmentLabel } from "@/lib/labels";
import { formatHours } from "@/lib/format";
import { summariseWorkload, utilisationPct } from "@/lib/workload";
import type { Department } from "@prisma/client";

function barClass(pct: number): string {
  if (pct > 100) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-green-500";
}

export default async function WorkloadPage() {
  await requireUser();

  const users = await prisma.user.findMany({
    where: { department: { not: null } },
    select: { id: true, name: true, department: true, weeklyCapacityHours: true },
    orderBy: [{ department: "asc" }, { name: "asc" }],
  });
  const deliverables = await prisma.deliverable.findMany({
    where: { deletedAt: null },
    select: { assigneeId: true, status: true, estimateMinutes: true },
  });
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const entries = await prisma.timeEntry.findMany({
    where: { createdAt: { gte: since } },
    select: { userId: true, durationMinutes: true },
  });

  const rows = summariseWorkload(
    users.map((u) => ({ id: u.id, name: u.name ?? "", weeklyCapacityHours: u.weeklyCapacityHours })),
    deliverables,
    entries,
  );
  const deptOf = new Map<string, Department>(users.map((u) => [u.id, u.department as Department]));

  const totalCapacity = rows.reduce((a, r) => a + r.weeklyCapacityMinutes, 0);
  const totalCommitted = rows.reduce((a, r) => a + r.committedMinutes, 0);
  const freeCapacity = Math.max(0, totalCapacity - totalCommitted);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Workload and capacity"
        subtitle="Committed work against weekly capacity. Can the team take more on?"
      />

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <div className="text-xs text-zinc-500">Weekly capacity</div>
          <div className="mt-1 text-xl font-semibold text-zinc-900">{formatHours(totalCapacity)}</div>
        </Card>
        <Card>
          <div className="text-xs text-zinc-500">Committed</div>
          <div className="mt-1 text-xl font-semibold text-zinc-900">{formatHours(totalCommitted)}</div>
        </Card>
        <Card>
          <div className="text-xs text-zinc-500">Free capacity</div>
          <div className="mt-1 text-xl font-semibold text-green-700">{formatHours(freeCapacity)}</div>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const pct = utilisationPct(r);
          const free = Math.max(0, r.weeklyCapacityMinutes - r.committedMinutes);
          const dept = deptOf.get(r.userId);
          return (
            <Card key={r.userId}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900">{r.name}</span>
                  {dept ? <Badge className="bg-zinc-100 text-zinc-600">{departmentLabel[dept]}</Badge> : null}
                </div>
                <span className="text-sm text-zinc-500">{pct}% committed</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                <div className={`h-full ${barClass(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-zinc-500">
                <span>
                  Committed {formatHours(r.committedMinutes)} of {formatHours(r.weeklyCapacityMinutes)}
                </span>
                <span>
                  {free > 0 ? `${formatHours(free)} free` : "at capacity"} · logged {formatHours(r.loggedMinutes)} this week
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
