"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import type { DeliveryType, EngagementStatus } from "@prisma/client";

function decimalOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : null;
}

export async function createEngagementAction(fd: FormData) {
  const user = await requireAdmin();
  const clientId = String(fd.get("clientId") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (!clientId || !name) redirect("/engagements/new?error=Pick+a+client+and+a+name");

  const engagement = await prisma.engagement.create({
    data: {
      clientId,
      name,
      deliveryType: (String(fd.get("deliveryType") ?? "DFY") as DeliveryType) ?? "DFY",
      status: (String(fd.get("status") ?? "ACTIVE") as EngagementStatus) ?? "ACTIVE",
      listPrice: decimalOrNull(fd.get("listPrice")),
      price: decimalOrNull(fd.get("price")),
      currency: String(fd.get("currency") ?? "ZAR") || "ZAR",
    },
  });
  await recordActivity({
    type: "ENGAGEMENT_CREATED",
    actorId: user.id,
    engagementId: engagement.id,
    entityType: "engagement",
    entityId: engagement.id,
    summary: `Created engagement ${name}`,
  });
  revalidatePath("/engagements");
  redirect(`/engagements/${engagement.id}`);
}
