import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { createProjectAction } from "./actions";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { name: true } },
      tasks: { where: { deletedAt: null }, select: { id: true, status: true } },
    },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Projects" subtitle="A free-form tracker alongside the funnel builds." />
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="mb-6">
        <form action={createProjectAction} className="flex flex-wrap items-center gap-2">
          <input
            name="name"
            required
            placeholder="New project name"
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
          />
          <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            Create project
          </button>
        </form>
      </Card>

      {projects.length === 0 ? (
        <EmptyState>No projects yet.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.map((p) => {
            const done = p.tasks.filter((t) => t.status === "DONE").length;
            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-zinc-900">{p.name}</div>
                      <div className="text-xs text-zinc-500">{p.owner.name}</div>
                    </div>
                    <span className="text-sm text-zinc-500">
                      {done} of {p.tasks.length} done
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
