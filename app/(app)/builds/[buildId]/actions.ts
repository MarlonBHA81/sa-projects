"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { analyseBuildHealth } from "@/lib/ai/analyse";

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
