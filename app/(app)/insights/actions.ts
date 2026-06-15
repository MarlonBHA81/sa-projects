"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { analyseTrends } from "@/lib/ai/analyse";
import type { AiInsightStatus } from "@prisma/client";

export async function resolveInsightAction(fd: FormData) {
  const user = await requireAdmin();
  const id = String(fd.get("insightId") ?? "");
  const status = String(fd.get("status") ?? "DISMISSED") as AiInsightStatus;
  await prisma.aiInsight.update({
    where: { id },
    data: { status, resolvedById: user.id, resolvedAt: new Date() },
  });
  revalidatePath("/insights");
  redirect("/insights");
}

export async function analyseTrendsAction() {
  const user = await requireAdmin();
  try {
    await analyseTrends(user.id);
  } catch (e) {
    redirect(`/insights?error=${encodeURIComponent(e instanceof Error ? e.message : "Analysis failed")}`);
  }
  revalidatePath("/insights");
  redirect("/insights");
}
