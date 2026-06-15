"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth-helpers";
import { analyseBuildHealth } from "@/lib/ai/analyse";
import { importLeads } from "@/lib/ghl/sync";

export async function analyseBuildAction(fd: FormData) {
  const user = await requireAdmin();
  const buildId = String(fd.get("buildId") ?? "");
  const path = `/builds/${buildId}`;
  try {
    await analyseBuildHealth(buildId, user.id);
  } catch (e) {
    redirect(`${path}?error=${encodeURIComponent(e instanceof Error ? e.message : "Analysis failed")}`);
  }
  revalidatePath("/insights");
  redirect("/insights");
}

export async function syncGhlAction(fd: FormData) {
  const user = await requireUser();
  const buildId = String(fd.get("buildId") ?? "");
  const path = `/builds/${buildId}/leads`;
  let skippedReason: string | null = null;
  try {
    const r = await importLeads(buildId, user);
    if ("skipped" in r) skippedReason = r.reason;
  } catch (e) {
    redirect(`/builds/${buildId}?error=${encodeURIComponent(e instanceof Error ? e.message : "Sync failed")}`);
  }
  if (skippedReason) {
    redirect(`/builds/${buildId}?error=${encodeURIComponent(`GHL sync skipped: ${skippedReason}`)}`);
  }
  revalidatePath(path);
  revalidatePath(`/builds/${buildId}`);
  redirect(path);
}
