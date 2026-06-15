import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { aiConfigured } from "@/lib/ai/client";
import { analyseTrends } from "@/lib/ai/analyse";

export async function GET(req: Request) {
  if (!authorizeCron(req)) return new NextResponse("Unauthorized", { status: 401 });
  if (!aiConfigured()) return NextResponse.json({ skipped: true, reason: "AI not configured" });

  const r = await analyseTrends();
  return NextResponse.json(r);
}
