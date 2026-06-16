// Create a FunnelBuild from a BRS template: five stages, the standard
// deliverables with their process steps and verification checklists,
// dependency edges, the empty Brand Messaging Playbook, and the option sets.

import { prisma } from "./db";
import { getTemplate } from "./brs-template";
import type { ConversionGoal, DeliverableStatus, Prisma } from "@prisma/client";

export type CreateFunnelBuildArgs = {
  engagementId: string;
  name: string;
  actorId: string;
  templateKey?: string;
  conversionGoal?: ConversionGoal | null;
  audienceSegment?: string | null;
};

function rollupEstimate(
  steps: { estimateMinutes?: number }[] | undefined,
  fallback?: number,
): number | null {
  if (steps && steps.length > 0) {
    const sum = steps.reduce((acc, s) => acc + (s.estimateMinutes ?? 0), 0);
    if (sum > 0) return sum;
  }
  return fallback ?? null;
}

export async function createFunnelBuildFromTemplate(args: CreateFunnelBuildArgs): Promise<string> {
  const template = getTemplate(args.templateKey ?? "brs-standard-v1");

  return prisma.$transaction(
    async (tx) => {
      const build = await tx.funnelBuild.create({
        data: {
          engagementId: args.engagementId,
          name: args.name,
          templateKey: template.key,
          conversionGoal: args.conversionGoal ?? null,
          audienceSegment: args.audienceSegment ?? null,
        },
      });

      const keyToId = new Map<string, string>();
      const deps: { dependentKey: string; prerequisiteKey: string }[] = [];

      for (const stage of template.stages) {
        const stageRow = await tx.stage.create({
          data: {
            funnelBuildId: build.id,
            order: stage.order,
            key: stage.key,
            title: stage.title,
            phase: stage.phase,
            status: stage.initialStatus,
          },
        });

        let order = 0;
        for (const d of stage.deliverables) {
          const hasDeps = (d.dependsOnKeys?.length ?? 0) > 0;
          const status: DeliverableStatus =
            stage.initialStatus === "IN_PROGRESS" && !hasDeps ? "NOT_STARTED" : "BLOCKED";

          const created = await tx.deliverable.create({
            data: {
              funnelBuildId: build.id,
              stageId: stageRow.id,
              key: d.key,
              title: d.title,
              description: d.description,
              department: d.department,
              kind: d.kind ?? "STANDARD",
              status,
              order: order++,
              isCopy: d.isCopy ?? false,
              requiresGruntTest: d.requiresGruntTest ?? false,
              requireReviewResolved: d.requireReviewResolved ?? true,
              estimateMinutes: rollupEstimate(d.processSteps, d.estimateMinutes),
              processSteps: {
                create: (d.processSteps ?? []).map((s, i) => ({
                  order: i,
                  title: s.title,
                  description: s.description,
                  estimateMinutes: s.estimateMinutes ?? null,
                })),
              },
              checklistItems: {
                create: (d.checklist ?? []).map((c, i) => ({
                  order: i,
                  label: c.label,
                  kind: c.kind ?? "MANUAL",
                  required: c.required ?? true,
                })),
              },
            },
          });
          keyToId.set(d.key, created.id);

          if (d.optionSet) {
            await tx.optionSet.create({
              data: {
                deliverableId: created.id,
                prompt: d.optionSet.prompt,
                minOptions: d.optionSet.minOptions ?? 2,
                maxOptions: d.optionSet.maxOptions ?? 3,
              },
            });
          }

          if ((d.kind ?? "STANDARD") === "PLAYBOOK") {
            await tx.brandPlaybook.create({
              data: { funnelBuildId: build.id, deliverableId: created.id },
            });
          }

          for (const pre of d.dependsOnKeys ?? []) {
            deps.push({ dependentKey: d.key, prerequisiteKey: pre });
          }
        }
      }

      const depRows: Prisma.DeliverableDependencyCreateManyInput[] = [];
      for (const dep of deps) {
        const dependentId = keyToId.get(dep.dependentKey);
        const prerequisiteId = keyToId.get(dep.prerequisiteKey);
        if (dependentId && prerequisiteId) depRows.push({ dependentId, prerequisiteId });
      }
      if (depRows.length) await tx.deliverableDependency.createMany({ data: depRows });

      await tx.activity.create({
        data: {
          type: "PROJECT_CREATED",
          funnelBuildId: build.id,
          engagementId: args.engagementId,
          actorId: args.actorId,
          summary: `Funnel build "${args.name}" created from ${template.name}`,
        },
      });

      return build.id;
    },
    { timeout: 30000, maxWait: 10000 },
  );
}
