import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/auth-helpers";
import { ghlConfigured } from "@/lib/ghl/client";
import { PageHeader } from "@/components/ui";
import { StartWizard } from "./wizard";

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/dashboard");
  const { error } = await searchParams;

  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="max-w-xl">
      <PageHeader title="Start a project" subtitle="Bring in the client, set the engagement, build the funnel." />
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      <StartWizard clients={clients} ghlReady={ghlConfigured()} />
    </div>
  );
}
