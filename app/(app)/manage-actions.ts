"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth-helpers";
import { dependentTitles, purge, restore, softDelete, type SoftDeletable } from "@/lib/soft-delete";

// Soft-delete a major entity (client, engagement, build, deliverable). Admin
// only. Deliverables warn first when other work depends on them.
export async function deleteEntityAction(fd: FormData) {
  const user = await requireAdmin();
  const entity = String(fd.get("entity") ?? "") as SoftDeletable;
  const id = String(fd.get("id") ?? "");
  const redirectTo = String(fd.get("redirectTo") ?? "/dashboard");
  const warnTo = String(fd.get("warnTo") ?? redirectTo);
  const confirmed = String(fd.get("confirm") ?? "") === "1";

  if (!confirmed && entity === "deliverable") {
    const deps = await dependentTitles(entity, id);
    if (deps.length) {
      redirect(`${warnTo}?warn=${encodeURIComponent(deps.join(", "))}`);
    }
  }
  await softDelete(entity, id, user);
  revalidatePath(redirectTo);
  redirect(redirectTo);
}

export async function restoreAction(fd: FormData) {
  const user = await requireSuperAdmin();
  const entity = String(fd.get("entity") ?? "") as SoftDeletable;
  const id = String(fd.get("id") ?? "");
  await restore(entity, id, user);
  revalidatePath("/trash");
  redirect("/trash");
}

export async function purgeAction(fd: FormData) {
  const user = await requireSuperAdmin();
  const entity = String(fd.get("entity") ?? "") as SoftDeletable;
  const id = String(fd.get("id") ?? "");
  await purge(entity, id, user);
  revalidatePath("/trash");
  redirect("/trash");
}
