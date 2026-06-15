import { prisma } from "../db";

// Per-1M-token pricing (USD) for cost tracking.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function costUsd(model: string, usage: Usage): number {
  const p = PRICING[model] ?? { input: 5, output: 25 };
  const input = (usage.input_tokens ?? 0) * p.input;
  const output = (usage.output_tokens ?? 0) * p.output;
  return Math.round(((input + output) / 1_000_000) * 10000) / 10000;
}

export async function logUsage(
  operation: string,
  model: string,
  usage: Usage,
  userId?: string,
): Promise<number> {
  const cost = costUsd(model, usage);
  await prisma.aiUsageLog.create({
    data: {
      operation,
      model,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      costUsd: cost,
      userId,
    },
  });
  return cost;
}
