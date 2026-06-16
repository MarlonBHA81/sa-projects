import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, isSuperAdmin } from "@/lib/auth-helpers";
import { ghlConfigured } from "@/lib/ghl/client";
import { aiConfigured, AI_MODEL_DEEP, AI_MODEL_FAST } from "@/lib/ai/client";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { testGhlAction } from "./actions";

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-2 text-sm last:border-0">
      <span className="text-zinc-700">{label}</span>
      <span className="flex items-center gap-2">
        {detail ? <span className="text-xs text-zinc-400">{detail}</span> : null}
        <Badge className={ok ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"}>
          {ok ? "Set" : "Not set"}
        </Badge>
      </span>
    </div>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ghl?: string }>;
}) {
  const user = await requireUser();
  if (!isSuperAdmin(user)) redirect("/dashboard");
  const { ghl } = await searchParams;

  const ghlOk = ghlConfigured();
  const aiOk = aiConfigured();
  const n8nOk = Boolean(process.env.N8N_EVENT_WEBHOOK_URL);
  const cronOk = Boolean(process.env.CRON_SECRET);

  const builds = await prisma.funnelBuild.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      ghlLocationId: true,
      ghlLastSyncedAt: true,
      engagement: { select: { client: { select: { name: true } } } },
    },
  });

  const ghlResult = ghl ? (ghl.startsWith("ok:") ? { ok: true, msg: ghl.slice(3) } : { ok: false, msg: ghl.replace(/^err:/, "") }) : null;
  const field = "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm";

  return (
    <div className="max-w-2xl">
      <PageHeader title="Admin" subtitle="Verify the integrations and how builds are wired up." />

      <Card className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-zinc-700">Integrations</h3>
        <StatusRow label="GoHighLevel token" ok={ghlOk} detail={process.env.GHL_API_VERSION} />
        <StatusRow label="Claude API key" ok={aiOk} detail={`${AI_MODEL_DEEP} / ${AI_MODEL_FAST}`} />
        <StatusRow label="n8n / Slack webhook" ok={n8nOk} />
        <StatusRow label="Cron secret" ok={cronOk} />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-1 text-sm font-semibold text-zinc-700">Test GoHighLevel</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Enter a sub-account (location) id to check the token can reach it. This is the quickest way
          to see why a sync is failing.
        </p>
        {ghlResult ? (
          <div
            className={`mb-3 rounded-lg border px-4 py-2 text-sm ${
              ghlResult.ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {ghlResult.msg}
          </div>
        ) : null}
        <form action={testGhlAction} className="flex flex-wrap items-center gap-2">
          <input name="locationId" placeholder="GoHighLevel location id" className={`flex-1 ${field}`} />
          <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            Test connection
          </button>
        </form>
        {!ghlOk ? (
          <p className="mt-2 text-xs text-amber-700">GHL_API_TOKEN is not set, so any test or sync will be skipped.</p>
        ) : null}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">Builds and their CRM link</h3>
        <div className="flex flex-col gap-2">
          {builds.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <div>
                <Link href={`/builds/${b.id}`} className="font-medium text-zinc-900 hover:underline">
                  {b.name}
                </Link>
                <div className="text-xs text-zinc-500">{b.engagement.client.name}</div>
              </div>
              <div className="text-right text-xs">
                {b.ghlLocationId ? (
                  <span className="text-zinc-600">location {b.ghlLocationId}</span>
                ) : (
                  <span className="text-amber-700">no CRM sub-account linked</span>
                )}
                <div className="text-zinc-400">
                  {b.ghlLastSyncedAt ? `synced ${formatDate(b.ghlLastSyncedAt)}` : "never synced"}
                </div>
              </div>
            </div>
          ))}
          {builds.length === 0 ? <p className="text-sm text-zinc-500">No builds yet.</p> : null}
        </div>
      </Card>
    </div>
  );
}
