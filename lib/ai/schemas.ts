import { z } from "zod";

export const severityValues = ["INFO", "LOW", "MEDIUM", "HIGH"] as const;

const suggestionZ = z.object({
  text: z.string(),
  rationale: z.string().optional(),
  action: z.string().optional(),
});

export const deliverableReviewZ = z.object({
  severity: z.enum(severityValues),
  title: z.string(),
  summary: z.string(),
  voiceCompliant: z.boolean(),
  gruntPass: z.boolean().optional(),
  findings: z.array(z.string()),
  suggestions: z.array(suggestionZ),
});
export type DeliverableReview = z.infer<typeof deliverableReviewZ>;

export const healthReportZ = z.object({
  severity: z.enum(severityValues),
  title: z.string(),
  summary: z.string(),
  findings: z.array(z.string()),
  suggestions: z.array(suggestionZ),
});
export type HealthReport = z.infer<typeof healthReportZ>;

// Human-readable shape descriptions appended to the user message so the model
// returns exactly this JSON (we validate with the Zod schemas above).
export const deliverableReviewShape = `{
  "severity": "INFO" | "LOW" | "MEDIUM" | "HIGH",
  "title": string,
  "summary": string,
  "voiceCompliant": boolean,
  "gruntPass": boolean (optional, only for headlines/one-liners/taglines),
  "findings": string[],
  "suggestions": [{ "text": string, "rationale"?: string, "action"?: string }]
}`;

export const healthReportShape = `{
  "severity": "INFO" | "LOW" | "MEDIUM" | "HIGH",
  "title": string,
  "summary": string,
  "findings": string[],
  "suggestions": [{ "text": string, "rationale"?: string, "action"?: string }]
}`;

/** Strip code fences and parse the first JSON object out of a model reply. */
export function extractJson(text: string): unknown {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON object in reply");
  return JSON.parse(t.slice(start, end + 1));
}
