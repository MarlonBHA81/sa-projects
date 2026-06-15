"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { addEngagementCost, generatePnL } from "@/lib/finance-service";
import { importPayments } from "@/lib/ghl/sync";

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
