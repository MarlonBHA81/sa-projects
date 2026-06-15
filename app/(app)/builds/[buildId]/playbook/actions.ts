"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { savePlaybook } from "@/lib/deliverable-service";

export async function savePlaybookAction(fd: FormData) {
  const user = await requireUser();
  const buildId = String(fd.get("buildId") ?? "");
  const path = `/builds/${buildId}/playbook`;
  try {
    await savePlaybook(
      buildId,
      {
        brandMessage: String(fd.get("brandMessage") ?? ""),
        oneLiner: String(fd.get("oneLiner") ?? ""),
        tagline: String(fd.get("tagline") ?? ""),
        salesPitch: String(fd.get("salesPitch") ?? ""),
      },
      user,
    );
  } catch (e) {
    redirect(`${path}?error=${encodeURIComponent(e instanceof Error ? e.message : "Something went wrong")}`);
  }
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}
