"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";

export async function createClientAction(fd: FormData) {
  const user = await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  if (!name) redirect("/clients/new?error=Add+a+client+name");
  const client = await prisma.client.create({
    data: {
      name,
      industry: String(fd.get("industry") ?? "").trim() || null,
      notes: String(fd.get("notes") ?? "").trim() || null,
    },
  });
  await recordActivity({
    type: "CLIENT_CREATED",
    actorId: user.id,
    entityType: "client",
    entityId: client.id,
    summary: `Created client ${name}`,
  });
  revalidatePath("/clients");
  redirect("/clients");
}
