// The advisory AI analysers: deliverable review, build health, and portfolio
// trends. Each loads data, calls Claude with the cached rules prompt, persists
// an AiInsight with token usage and cost, and emits an n8n event for HIGH
// findings. All degrade gracefully when ANTHROPIC_API_KEY is not set.

import { prisma } from "../db";
import { emitEvent } from "../n8n/notify";
import { anthropic, aiConfigured, AI_MODEL_DEEP } from "./client";
import { RULES_SYSTEM } from "./rules";
import {
  deliverableReviewShape,
  deliverableReviewZ,
  extractJson,
  healthReportShape,
  healthReportZ,
} from "./schemas";
import { logUsage, type Usage } from "./usage";
import { getMarginByDeliveryType } from "../finance-service";
import { summariseWorkload, utilisationPct } from "../workload";
import type { AiInsightType, AiScope, AiSeverity } from "@prisma/client";

export type AnalyseResult = { skipped: true } | { insightId: string; severity: AiSeverity };

async function callModel(model: string, userText: string): Promise<{ text: string; usage: Usage }> {
  const client = anthropic();
  const res = await client.messages.create({
    model,
    max_tokens: 1500,
    system: [{ type: "text", text: RULES_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userText }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { text, usage: res.usage as Usage };
}

async function persistInsight(args: {
  scope: AiScope;
  scopeId: string;
  type: AiInsightType;
  severity: AiSeverity;
  title: string;
  summary: string;
  detail?: unknown;
  suggestions?: unknown;
  model: string;
  usage: Usage;
  cost: number;
  buildId?: string;
  actorId?: string;
}): Promise<string> {
  const insight = await prisma.aiInsight.create({
    data: {
      scope: args.scope,
      scopeId: args.scopeId,
      type: args.type,
      severity: args.severity,
      title: args.title,
      summary: args.summary,
      detail: (args.detail ?? undefined) as never,
      suggestions: (args.suggestions ?? undefined) as never,
      modelUsed: args.model,
      inputTokens: args.usage.input_tokens ?? 0,
      outputTokens: args.usage.output_tokens ?? 0,
      cacheReadTokens: args.usage.cache_read_input_tokens ?? 0,
      costUsd: args.cost,
    },
  });
  if (args.buildId) {
    await prisma.activity.create({
      data: {
        type: "AI_INSIGHT_CREATED",
        funnelBuildId: args.buildId,
        actorId: args.actorId ?? (await systemActorId()),
        summary: `AI insight: ${args.title}`,
      },
    });
  }
  if (args.severity === "HIGH") {
    void emitEvent({ type: "AI_INSIGHT_HIGH", summary: args.title, buildId: args.buildId });
  }
  return insight.id;
}

// Activities require an actor; fall back to an admin when none is supplied (cron).
async function systemActorId(): Promise<string> {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!admin) throw new Error("No admin user to attribute the activity to");
  return admin.id;
}

function clip(s: string, n = 4000): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export async function reviewDeliverable(deliverableId: string, actorId?: string): Promise<AnalyseResult> {
  if (!aiConfigured()) return { skipped: true };
  const d = await prisma.deliverable.findUnique({
    where: { id: deliverableId },
    include: {
      checklistItems: { select: { label: true, kind: true } },
      optionSet: { include: { options: { select: { label: true, content: true } } } },
      brandPlaybook: true,
    },
  });
  if (!d) return { skipped: true };

  const parts: string[] = [
    `Deliverable: ${d.title} (department ${d.department}, kind ${d.kind}).`,
    d.requiresGruntTest ? "This needs to pass the grunt test." : "",
  ];
  if (d.brandPlaybook) {
    parts.push(
      `Brand message: ${d.brandPlaybook.brandMessage ?? "(empty)"}`,
      `One-liner: ${d.brandPlaybook.oneLiner ?? "(empty)"}`,
      `Tag-line: ${d.brandPlaybook.tagline ?? "(empty)"}`,
    );
  }
  const body = (d.body as { text?: string } | null)?.text;
  if (body) parts.push(`Content:\n${body}`);
  if (d.optionSet) {
    parts.push(
      `Options for "${d.optionSet.prompt}":`,
      ...d.optionSet.options.map((o) => `- ${o.label}: ${(o.content as { text?: string })?.text ?? ""}`),
    );
  }
  parts.push(
    `Checklist: ${d.checklistItems.map((c) => c.label).join("; ")}`,
    "",
    `Review this against the BRS rules and the voice rules. If it is a headline, one-liner, or tag-line, judge the grunt test. Respond with ONLY this JSON shape:\n${deliverableReviewShape}`,
  );

  const { text, usage } = await callModel(AI_MODEL_DEEP, clip(parts.filter(Boolean).join("\n")));
  const parsed = deliverableReviewZ.safeParse(extractJson(text));
  if (!parsed.success) return { skipped: true };
  const r = parsed.data;
  const cost = await logUsage("reviewDeliverable", AI_MODEL_DEEP, usage, actorId);
  const type: AiInsightType = d.requiresGruntTest ? "GRUNT_TEST" : d.kind === "PLAYBOOK" ? "SB7_ALIGNMENT" : "VOICE";
  const insightId = await persistInsight({
    scope: "DELIVERABLE",
    scopeId: deliverableId,
    type,
    severity: r.severity,
    title: r.title,
    summary: r.summary,
    detail: { findings: r.findings, voiceCompliant: r.voiceCompliant, gruntPass: r.gruntPass },
    suggestions: r.suggestions,
    model: AI_MODEL_DEEP,
    usage,
    cost,
    buildId: d.funnelBuildId,
    actorId,
  });
  return { insightId, severity: r.severity };
}

export async function analyseBuildHealth(buildId: string, actorId?: string): Promise<AnalyseResult> {
  if (!aiConfigured()) return { skipped: true };
  const build = await prisma.funnelBuild.findUnique({
    where: { id: buildId },
    include: {
      stages: { orderBy: { order: "asc" }, select: { title: true, status: true } },
      deliverables: { select: { status: true, department: true, dueDate: true, estimateMinutes: true } },
    },
  });
  if (!build) return { skipped: true };

  const now = Date.now();
  const overdue = build.deliverables.filter(
    (d) => d.dueDate && d.dueDate.getTime() < now && d.status !== "APPROVED",
  ).length;
  const byStatus = build.deliverables.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {});
  const changes = await prisma.activity.count({
    where: { funnelBuildId: buildId, type: "DELIVERABLE_CHANGES_NEEDED" },
  });

  const userText = clip(
    [
      `Funnel build "${build.name}" health check.`,
      `Stages: ${build.stages.map((s) => `${s.title}=${s.status}`).join(", ")}.`,
      `Deliverables by status: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
      `Overdue items: ${overdue}. Change-request rounds so far: ${changes}.`,
      "",
      `Find bottlenecks and slippage risk, and suggest concrete fixes. Respond with ONLY this JSON shape:\n${healthReportShape}`,
    ].join("\n"),
  );

  const { text, usage } = await callModel(AI_MODEL_DEEP, userText);
  const parsed = healthReportZ.safeParse(extractJson(text));
  if (!parsed.success) return { skipped: true };
  const r = parsed.data;
  const cost = await logUsage("analyseBuildHealth", AI_MODEL_DEEP, usage, actorId);
  const insightId = await persistInsight({
    scope: "BUILD",
    scopeId: buildId,
    type: "BOTTLENECK",
    severity: r.severity,
    title: r.title,
    summary: r.summary,
    detail: { findings: r.findings },
    suggestions: r.suggestions,
    model: AI_MODEL_DEEP,
    usage,
    cost,
    buildId,
    actorId,
  });
  return { insightId, severity: r.severity };
}

export async function analyseTrends(actorId?: string): Promise<AnalyseResult> {
  if (!aiConfigured()) return { skipped: true };

  const margins = await getMarginByDeliveryType();
  const users = await prisma.user.findMany({
    where: { department: { not: null } },
    select: { id: true, name: true, weeklyCapacityHours: true },
  });
  const deliverables = await prisma.deliverable.findMany({
    select: { assigneeId: true, status: true, estimateMinutes: true },
  });
  const workload = summariseWorkload(
    users.map((u) => ({ id: u.id, name: u.name ?? "", weeklyCapacityHours: u.weeklyCapacityHours })),
    deliverables,
    [],
  );
  const totalCapacity = workload.reduce((a, w) => a + w.weeklyCapacityMinutes, 0);
  const totalCommitted = workload.reduce((a, w) => a + w.committedMinutes, 0);
  const utilisation = utilisationPct({ committedMinutes: totalCommitted, weeklyCapacityMinutes: totalCapacity });
  const changes = await prisma.activity.count({ where: { type: "DELIVERABLE_CHANGES_NEEDED" } });

  const userText = clip(
    [
      "Portfolio and business trend analysis.",
      `Margin by delivery type: ${margins.map((m) => `${m.deliveryType} ${m.marginPct}% (n=${m.count})`).join(", ") || "no data"}.`,
      `Team utilisation: ${utilisation}% committed against weekly capacity.`,
      `Total change-request rounds across all builds: ${changes}.`,
      "",
      `Where is the business leaking time or money, and what concrete process or business updates do you suggest? Respond with ONLY this JSON shape:\n${healthReportShape}`,
    ].join("\n"),
  );

  const { text, usage } = await callModel(AI_MODEL_DEEP, userText);
  const parsed = healthReportZ.safeParse(extractJson(text));
  if (!parsed.success) return { skipped: true };
  const r = parsed.data;
  const cost = await logUsage("analyseTrends", AI_MODEL_DEEP, usage, actorId);
  const insightId = await persistInsight({
    scope: "PORTFOLIO",
    scopeId: "portfolio",
    type: "TREND",
    severity: r.severity,
    title: r.title,
    summary: r.summary,
    detail: { findings: r.findings },
    suggestions: r.suggestions,
    model: AI_MODEL_DEEP,
    usage,
    cost,
    actorId,
  });
  return { insightId, severity: r.severity };
}
