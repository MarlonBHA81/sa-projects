<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Story Advantage BRS funnel tool

A project management tool purpose-built for Story Advantage's Brand Resonance System (BRS): Differentiate, Integrate, Activate. It encodes the BRS process and enforces its gates in software (copy is locked before design or build, options before commitment, the grunt test, element-by-element approval), tracks time and capacity, connects to GoHighLevel, posts updates to Slack via n8n, and runs an advisory Claude AI layer. It serves both the consulting/coaching side (DIY, DWY) and the agency side (DFY), with financials, capacity, efficiency, and a P&L on completion.

The full build plan lives at `/root/.claude/plans/` (the approved plan file).

## Stack

- Next.js 16 (App Router, the `proxy.ts` convention replaces `middleware.ts`) + React 19 + TypeScript + Tailwind v4
- Prisma 6 + PostgreSQL
- Auth.js v5 (next-auth beta) with a Credentials provider, JWT sessions, Prisma adapter
- Anthropic SDK (`@anthropic-ai/sdk`) for the AI layer

## Local setup

```bash
npm install
# Postgres on localhost:5432 (docker compose up -d, or a local cluster)
npm run db:migrate     # apply migrations
npm run db:seed        # demo users, client, engagement, full build
npm run dev
```

Copy `.env.example` to `.env` and fill it in.

## Commands

- `npm run dev` / `npm run build` / `npm start`
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint`
- `npm run test` / `npm run test:watch` — Vitest (gate logic is the most-tested code)
- `npm run db:migrate` / `db:reset` / `db:seed` / `db:studio` / `db:generate`

## Architecture

- `prisma/schema.prisma` — the whole domain model.
- `lib/gates.ts` — pure gate/verification/approval state machine (most-tested).
- `lib/brs-template.ts`, `lib/seed-funnel.ts` — the BRS template and create-from-template seeding.
- `lib/deliverable-service.ts` — loads data, calls gates, writes with an Activity.
- `lib/ghl/*`, `lib/n8n/*`, `lib/ai/*`, `lib/finance.ts`, `lib/capacity.ts`, `lib/time.ts` — integrations and ops.
- `lib/board.ts`, `lib/sprints.ts`, `lib/tasks.ts` — the planning board (drag a card between lanes; this sets `planningLane`/`sprintId` only and never the gate status), per-build sprints, and the general tracker plus ad-hoc tasks.
- `lib/soft-delete.ts`, `lib/activity.ts` — soft delete (super-admin-only purge/restore via `/trash`) and the interaction/audit log (`/activity`, with my and team views).
- `auth.ts` / `auth.config.ts` / `proxy.ts` — Auth.js v5 (config split edge-safe for the proxy).
- Mutations are Server Actions; route handlers only for Auth.js, cron, and the GHL webhook.

## Conventions

- UI copy follows the brand voice: British English, sentence case, no em or en dashes, short and outcome-led.
- The AI layer is advisory only. It never clears a gate, approves, selects an option, or edits content.
- Roles: `SUPER_ADMIN` (Marlon) is the approver and the only one who can permanently delete; `ADMIN` is also an approver; `isApprover`/`isAdmin` in `lib/auth-helpers.ts` are the single source of truth, so never compare to the literal `"ADMIN"` in new code.
- The planning lanes and sprints are a separate layer from the BRS gates. Dragging a card must never change a deliverable's gate `status`.
