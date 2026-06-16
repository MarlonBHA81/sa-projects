"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { createFunnelBuildFromTemplate } from "@/lib/seed-funnel";
import { getLocation, ghlConfigured } from "@/lib/ghl/client";
import type { ConversionGoal, DeliveryType } from "@prisma/client";

function decimalOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : null;
}

export async function startProjectAction(fd: FormData) {
  const user = await requireAdmin();
  const clientMode = String(fd.get("clientMode") ?? "existing");

  let buildId = "";
  try {
    let clientId = String(fd.get("clientId") ?? "");
    let ghlLocationId: string | null = null;

    if (clientMode === "ghl") {
      const locId = String(fd.get("ghlLocationId") ?? "").trim();
      if (!locId) throw new Error("Enter the GoHighLevel location id");
      if (!ghlConfigured()) throw new Error("GoHighLevel is not configured (set GHL_API_TOKEN)");
      const loc = await getLocation(locId);
      if (!loc) throw new Error("Could not fetch that location from GoHighLevel");
      const client = await prisma.client.create({
        data: { name: loc.name?.trim() || `Location ${locId}`, ghlLocationId: locId },
      });
      clientId = client.id;
      ghlLocationId = locId;
      await recordActivity({
        type: "CLIENT_CREATED",
        actorId: user.id,
        entityType: "client",
        entityId: client.id,
        summary: `Imported client ${client.name} from GoHighLevel`,
      });
    } else if (clientMode === "new") {
      const name = String(fd.get("clientName") ?? "").trim();
      if (!name) throw new Error("Add a client name");
      const client = await prisma.client.create({ data: { name } });
      clientId = client.id;
      await recordActivity({
        type: "CLIENT_CREATED",
        actorId: user.id,
        entityType: "client",
        entityId: client.id,
        summary: `Created client ${name}`,
      });
    } else {
      if (!clientId) throw new Error("Pick a client");
      const existing = await prisma.client.findFirst({
        where: { id: clientId, deletedAt: null },
        select: { ghlLocationId: true },
      });
      if (!existing) throw new Error("That client no longer exists");
      ghlLocationId = existing.ghlLocationId;
    }

    const engagement = await prisma.engagement.create({
      data: {
        clientId,
        name: String(fd.get("engagementName") ?? "").trim() || "Engagement",
        deliveryType: (String(fd.get("deliveryType") ?? "DFY") as DeliveryType) || "DFY",
        status: "ACTIVE",
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
      summary: `Created engagement ${engagement.name}`,
    });

    buildId = await createFunnelBuildFromTemplate({
      engagementId: engagement.id,
      name: String(fd.get("buildName") ?? "").trim() || engagement.name,
      actorId: user.id,
      conversionGoal: (String(fd.get("conversionGoal") ?? "") || null) as ConversionGoal | null,
      audienceSegment: String(fd.get("audienceSegment") ?? "").trim() || null,
    });
    if (ghlLocationId) {
      await prisma.funnelBuild.update({ where: { id: buildId }, data: { ghlLocationId } });
    }
    await recordActivity({
      type: "BUILD_CREATED",
      actorId: user.id,
      engagementId: engagement.id,
      funnelBuildId: buildId,
      entityType: "funnelBuild",
      entityId: buildId,
      summary: "Created the funnel build",
    });
  } catch (e) {
    redirect(`/start?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not start the project")}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/engagements");
  // Brand messaging session starts first: land straight in the playbook.
  redirect(`/builds/${buildId}/playbook`);
}
