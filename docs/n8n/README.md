# Slack updates through n8n

The app posts domain events to a single n8n webhook (`N8N_EVENT_WEBHOOK_URL`). n8n
then posts them to Slack. This keeps Slack credentials out of the app and reuses
your existing automation hub.

## What the app sends

A POST with a JSON body:

```json
{
  "type": "DELIVERABLE_APPROVED",
  "summary": "Landing page headline approved",
  "engagementId": "…",
  "buildId": "…",
  "deliverableId": "…",
  "occurredAt": "2026-06-15T20:00:00.000Z"
}
```

Event types: `DELIVERABLE_SUBMITTED`, `DELIVERABLE_APPROVED`,
`DELIVERABLE_CHANGES_NEEDED`, `STAGE_GATE_CLEARED`, `COPY_CHANGED_RESYNC`,
`BUILD_LIVE`, `DUE_SOON`, `OVERDUE`, `GHL_SYNCED`, `ENGAGEMENT_COMPLETED`,
`AI_INSIGHT_HIGH`.

## Set it up (one time)

1. In n8n, open Workflows, then Import from File, and choose
   `docs/n8n/story-advantage-slack.json`.
2. Open the **Post to Slack** node, connect your Slack credential, and choose the
   channel. The message is `*{{type}}*  {{summary}}`; adjust to taste, or add a
   Switch node before it to route by `{{ $json.body.type }}` to different channels.
3. Activate the workflow.
4. Open the **Story Advantage events** webhook node and copy the **Production URL**
   (it ends with `/webhook/sa-events`).
5. Set `N8N_EVENT_WEBHOOK_URL` to that URL:
   - locally in `.env`
   - on Vercel in the project's Environment Variables

That's it. Submitting, approving, gate-clearing, resync, GHL sync, completion, and
high-severity AI insights will now post to Slack. If `N8N_EVENT_WEBHOOK_URL` is
unset, the app simply skips the post (fire and forget, never blocking).
