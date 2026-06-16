"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { pingLocation } from "@/lib/ghl/client";

export async function testGhlAction(fd: FormData) {
  await requireSuperAdmin();
  const locationId = String(fd.get("locationId") ?? "").trim();
  if (!locationId) redirect(`/admin?ghl=${encodeURIComponent("Enter a location id to test")}`);
  const result = await pingLocation(locationId);
  const msg = result.ok ? `ok:Connected to ${result.name}` : `err:${result.error}`;
  revalidatePath("/admin");
  redirect(`/admin?ghl=${encodeURIComponent(msg)}`);
}
