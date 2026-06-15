"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { approveDeliverable, requestChanges } from "@/lib/deliverable-service";

export async function approveFromQueue(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get("deliverableId") ?? "");
  const buildId = String(fd.get("buildId") ?? "");
  try {
    await approveDeliverable(id, user);
  } catch (e) {
    redirect(
      `/builds/${buildId}/deliverables/${id}?error=${encodeURIComponent(
        e instanceof Error ? e.message : "Something went wrong",
      )}`,
    );
  }
  revalidatePath("/approvals");
  revalidatePath(`/builds/${buildId}`);
  redirect("/approvals");
}

export async function requestChangesFromQueue(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get("deliverableId") ?? "");
  const buildId = String(fd.get("buildId") ?? "");
  const note = String(fd.get("note") ?? "");
  try {
    await requestChanges(id, note || undefined, user);
  } catch (e) {
    redirect(
      `/builds/${buildId}/deliverables/${id}?error=${encodeURIComponent(
        e instanceof Error ? e.message : "Something went wrong",
      )}`,
    );
  }
  revalidatePath("/approvals");
  revalidatePath(`/builds/${buildId}`);
  redirect("/approvals");
}
