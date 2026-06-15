import Anthropic from "@anthropic-ai/sdk";

// Default to the latest, most capable model for deep analysis; a fast, cheap
// model for high-volume lint-style checks. Both overridable by env.
export const AI_MODEL_DEEP = process.env.AI_MODEL_DEEP || "claude-opus-4-8";
export const AI_MODEL_FAST = process.env.AI_MODEL_FAST || "claude-haiku-4-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  cached ??= new Anthropic();
  return cached;
}
