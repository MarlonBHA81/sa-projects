import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, canActOnDepartment } from "@/lib/auth-helpers";
import { Card, PageHeader } from "@/components/ui";
import { savePlaybookAction } from "./actions";

export default async function PlaybookPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { buildId } = await params;
  const { error, saved } = await searchParams;
  const user = await requireUser();

  const playbook = await prisma.brandPlaybook.findUnique({
    where: { funnelBuildId: buildId },
    include: {
      funnelBuild: { select: { name: true } },
      deliverable: { select: { id: true, department: true, status: true } },
    },
  });
  if (!playbook) notFound();

  const canEdit = canActOnDepartment(user, playbook.deliverable.department);
  const field = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50";

  return (
    <div className="max-w-2xl">
      <div className="mb-4 text-sm text-zinc-500">
        <Link href={`/builds/${buildId}`} className="hover:text-zinc-900">
          {playbook.funnelBuild.name}
        </Link>
      </div>
      <PageHeader
        title="Brand Messaging Playbook"
        subtitle="The core messaging the whole funnel flows from."
      />

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          Saved.
        </div>
      ) : null}

      <Card>
        <form action={savePlaybookAction} className="flex flex-col gap-4">
          <input type="hidden" name="buildId" value={buildId} />
          <label className="text-sm font-medium text-zinc-700">
            Brand message
            <textarea
              name="brandMessage"
              rows={4}
              defaultValue={playbook.brandMessage ?? ""}
              disabled={!canEdit}
              className={`mt-1 ${field}`}
              placeholder="The positioning narrative the funnel tells."
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            One-liner
            <input
              name="oneLiner"
              defaultValue={playbook.oneLiner ?? ""}
              disabled={!canEdit}
              className={`mt-1 ${field}`}
              placeholder="Problem, solution, result in one sentence."
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Tag-line
            <input
              name="tagline"
              defaultValue={playbook.tagline ?? ""}
              disabled={!canEdit}
              className={`mt-1 ${field}`}
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Sales pitch (optional)
            <textarea
              name="salesPitch"
              rows={3}
              defaultValue={playbook.salesPitch ?? ""}
              disabled={!canEdit}
              className={`mt-1 ${field}`}
            />
          </label>
          {canEdit ? (
            <button className="self-start rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
              Save playbook
            </button>
          ) : (
            <p className="text-xs text-zinc-400">Only the strategy team can edit the playbook.</p>
          )}
        </form>
      </Card>

      <p className="mt-4 text-sm text-zinc-500">
        Run the grunt test and submit this for approval from the{" "}
        <Link
          href={`/builds/${buildId}/deliverables/${playbook.deliverable.id}`}
          className="font-medium text-zinc-700 hover:text-zinc-900"
        >
          playbook task
        </Link>
        .
      </p>
    </div>
  );
}
