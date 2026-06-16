// Outbound domain events to n8n, which posts to Slack. Fire and forget: a slow
// or down n8n must never block a user action. Callers can `void emitEvent(...)`.

export type AppEventType =
  | "DELIVERABLE_SUBMITTED"
  | "DELIVERABLE_APPROVED"
  | "DELIVERABLE_CHANGES_NEEDED"
  | "STAGE_GATE_CLEARED"
  | "COPY_CHANGED_RESYNC"
  | "BUILD_LIVE"
  | "DUE_SOON"
  | "OVERDUE"
  | "AWAITING_APPROVAL"
  | "BUDGET_ALERT"
  | "GHL_SYNCED"
  | "ENGAGEMENT_COMPLETED"
  | "AI_INSIGHT_HIGH";

export type AppEvent = {
  type: AppEventType;
  summary: string;
  engagementId?: string;
  buildId?: string;
  deliverableId?: string;
  meta?: Record<string, unknown>;
  occurredAt?: string;
};

export async function emitEvent(event: AppEvent): Promise<void> {
  const url = process.env.N8N_EVENT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...event, occurredAt: event.occurredAt ?? new Date().toISOString() }),
    });
  } catch (err) {
    console.error("[n8n] emitEvent failed", err);
  }
}
