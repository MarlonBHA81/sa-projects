import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth-helpers";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatHours } from "@/lib/format";
import { activityForDepartment, activityForUser, recentActivity } from "@/lib/activity";
import { departmentLabel } from "@/lib/labels";
import { daysAgo } from "@/lib/now";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const view = searchParams ? (await searchParams).view ?? "mine" : "mine";

  let rows;
  if (view === "all" && admin) {
    rows = await recentActivity();
  } else if (view === "team" && user.department) {
    rows = await activityForDepartment(user.department);
  } else if (view === "team" && admin) {
    rows = await recentActivity();
  } else {
    rows = await activityForUser(user.id);
  }

  const since = daysAgo(7);
  const myTime = await prisma.timeEntry.aggregate({
    where: { userId: user.id, createdAt: { gte: since } },
    _sum: { durationMinutes: true },
  });

  const tab = (key: string, label: string) => (
    <Link
      href={`/activity?view=${key}`}
      className={`rounded-lg px-3 py-1 text-sm ${
        view === key ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="max-w-3xl">
      <PageHeader title="Activity" subtitle="Every interaction, by you and your team." />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {tab("mine", "Mine")}
        {tab("team", user.department ? departmentLabel[user.department] : "Team")}
        {admin ? tab("all", "Everyone") : null}
      </div>

      {view === "mine" ? (
        <p className="mb-4 text-sm text-zinc-500">
          You have logged {formatHours(myTime._sum.durationMinutes ?? 0)} in the last seven days.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState>No activity yet.</EmptyState>
      ) : (
        <Card className="divide-y divide-zinc-100 p-0">
          {rows.map((a) => (
            <div key={a.id} className="px-5 py-3">
              <div className="text-sm text-zinc-800">{a.summary}</div>
              <div className="mt-0.5 text-xs text-zinc-400">
                {a.actor.name}
                {a.actor.department ? ` · ${departmentLabel[a.actor.department]}` : ""} ·{" "}
                {a.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
