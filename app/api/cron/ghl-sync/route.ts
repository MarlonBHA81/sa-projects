import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeCron } from "@/lib/cron-auth";
import { ghlConfigured } from "@/lib/ghl/client";
import { importLeads } from "@/lib/ghl/sync";
import type { SessionUser } from "@/lib/auth-helpers";

export async function GET(req: Request) {
  if (!authorizeCron(req)) return new NextResponse("Unauthorized", { status: 401 });
  if (!ghlConfigured()) return NextResponse.json({ skipped: true, reason: "GHL not configured" });

  const admin = await prisma.user.findFirst({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    select: { id: true },
  });
  if (!admin) return NextResponse.json({ skipped: true, reason: "No admin user" });
  const actor: SessionUser = { id: admin.id, role: "ADMIN", department: null };

  const builds = await prisma.funnelBuild.findMany({
    where: { ghlLocationId: { not: null } },
    select: { id: true },
  });
  let imported = 0;
  for (const b of builds) {
    const r = await importLeads(b.id, actor);
    if ("imported" in r) imported += r.imported;
  }
  return NextResponse.json({ imported, builds: builds.length });
}
