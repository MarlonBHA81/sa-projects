import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeCron } from "@/lib/cron-auth";
import { aiConfigured } from "@/lib/ai/client";
import { analyseBuildHealth } from "@/lib/ai/analyse";

export async function GET(req: Request) {
  if (!authorizeCron(req)) return new NextResponse("Unauthorized", { status: 401 });
  if (!aiConfigured()) return NextResponse.json({ skipped: true, reason: "AI not configured" });

  const builds = await prisma.funnelBuild.findMany({
    where: { engagement: { status: "ACTIVE" } },
    select: { id: true },
  });
  let analysed = 0;
  for (const b of builds) {
    const r = await analyseBuildHealth(b.id);
    if (!("skipped" in r)) analysed += 1;
  }
  return NextResponse.json({ analysed, builds: builds.length });
}
