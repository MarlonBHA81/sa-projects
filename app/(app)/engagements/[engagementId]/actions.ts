"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireAdmin } from "@/lib/auth-helpers";
import { addEngagementCost, generatePnL } from "@/lib/finance-service";
import { importPayments } from "@/lib/ghl/sync";
import { createFunnelBuildFromTemplate } from "@/lib/seed-funnel";
import { recordActivity } from "@/lib/activity";
import type { ConversionGoal } from "@prisma/client";

export async function addCostAction(fd: FormData) {
  const user = await requireUser();
  const engagementId = String(fd.get("engagementId") ?? "");
  const path = `/engagements/${engagementId}`;
  try {
    await addEngagementCost(
      engagementId,
      {
        label: String(fd.get("label") ?? ""),
        category: String(fd.get("category") ?? "") || undefined,
        amount: Number(fd.get("amount")),
      },
      user,
    );
  } catch (e) {
    redirect(`${path}?error=${encodeURIComponent(e instanceof Error ? e.message : "Something went wrong")}`);
  }
  revalidatePath(path);
  redirect(path);
}

export async function generatePnLAction(fd: FormData) {
  const user = await requireUser();
  const engagementId = String(fd.get("engagementId") ?? "");
  const path = `/engagements/${engagementId}`;
  try {
    await generatePnL(engagementId, user);
  } catch (e) {
    redirect(`${path}?error=${encodeURIComponent(e instanceof Error ? e.message : "Something went wrong")}`);
  }
  revalidatePath(path);
  revalidatePath("/engagements");
  redirect(`${path}?completed=1`);
}

export async function addBuildAction(fd: FormData) {
  const user = await requireAdmin();
  const engagementId = String(fd.get("engagementId") ?? "");
  const path = `/engagements/${engagementId}`;
  const name = String(fd.get("name") ?? "").trim() || "Funnel build";
  const conversionGoal = (String(fd.get("conversionGoal") ?? "") || null) as ConversionGoal | null;
  const audienceSegment = String(fd.get("audienceSegment") ?? "").trim() || null;

  let buildId = "";
  try {
    buildId = await createFunnelBuildFromTemplate({
      engagementId,
      name,
      actorId: user.id,
      conversionGoal,
      audienceSegment,
    });
  } catch (e) {
    redirect(`${path}?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not create build")}`);
  }
  await recordActivity({
    type: "BUILD_CREATED",
    actorId: user.id,
    engagementId,
    funnelBuildId: buildId,
    entityType: "funnelBuild",
    entityId: buildId,
    summary: `Created build ${name}`,
  });
  revalidatePath(path);
  revalidatePath("/dashboard");
  redirect(`/builds/${buildId}`);
}

export async function syncPaymentsAction(fd: FormData) {
  const user = await requireUser();
  const engagementId = String(fd.get("engagementId") ?? "");
  const path = `/engagements/${engagementId}`;
  let skippedReason: string | null = null;
  try {
    const r = await importPayments(engagementId, user);
    if ("skipped" in r) skippedReason = r.reason;
  } catch (e) {
    redirect(`${path}?error=${encodeURIComponent(e instanceof Error ? e.message : "Sync failed")}`);
  }
  if (skippedReason) {
    redirect(`${path}?error=${encodeURIComponent(`Payment sync skipped: ${skippedReason}`)}`);
  }
  revalidatePath(path);
  redirect(path);
}
