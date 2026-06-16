// The BRS funnel build template. Typed data, versioned by key, that drives
// stage and deliverable seeding. Each deliverable carries its default process
// steps and verification checklist, all editable on the instance, so the
// process starts from a sensible default and stays flexible.

import type { BrsPhase, ChecklistItemKind, Department, DeliverableKind } from "@prisma/client";

export type ChecklistItemTemplate = {
  label: string;
  kind?: ChecklistItemKind; // default MANUAL
  required?: boolean; // default true
};

export type ProcessStepTemplate = {
  title: string;
  description?: string;
  estimateMinutes?: number;
};

export type DeliverableTemplate = {
  key: string;
  title: string;
  description?: string;
  department: Department;
  kind?: DeliverableKind; // default STANDARD
  isCopy?: boolean;
  requiresGruntTest?: boolean;
  requireReviewResolved?: boolean;
  estimateMinutes?: number;
  dependsOnKeys?: string[];
  optionSet?: { prompt: string; minOptions?: number; maxOptions?: number };
  processSteps?: ProcessStepTemplate[];
  checklist?: ChecklistItemTemplate[];
};

export type StageTemplate = {
  key: string;
  order: number;
  title: string;
  phase: BrsPhase;
  initialStatus: "IN_PROGRESS" | "LOCKED";
  deliverables: DeliverableTemplate[];
};

export type BrsTemplate = {
  key: string;
  name: string;
  stages: StageTemplate[];
};

// Reusable checklist fragments (voice-aligned labels).
const voice = (): ChecklistItemTemplate => ({
  label: "Voice rules followed: British English, sentence case, no em or en dashes",
  kind: "VOICE",
});
const brief = (): ChecklistItemTemplate => ({ label: "Meets the creative brief" });
const grunt = (): ChecklistItemTemplate => ({
  label: "Passes the grunt test: a stranger gets it in five seconds",
  kind: "GRUNT_TEST",
});

export const BRS_STANDARD: BrsTemplate = {
  key: "brs-standard-v1",
  name: "Standard BRS funnel",
  stages: [
    {
      key: "strategy",
      order: 0,
      title: "Strategy",
      phase: "DIFFERENTIATE",
      initialStatus: "IN_PROGRESS",
      deliverables: [
        {
          key: "brand_messaging_playbook",
          title: "Brand Messaging Playbook",
          description:
            "The core messaging: brand message, one-liner, tag-line, plus optional bios and sales pitch.",
          department: "STRATEGY",
          kind: "PLAYBOOK",
          requiresGruntTest: true,
          estimateMinutes: 240,
          processSteps: [
            { title: "Write the brand message", description: "The positioning narrative the funnel tells.", estimateMinutes: 90 },
            { title: "Draft the one-liner", description: "Problem, solution, result in one sentence.", estimateMinutes: 60 },
            { title: "Draft the tag-line", estimateMinutes: 30 },
            { title: "Optional: bios and sales pitch", estimateMinutes: 60 },
          ],
          checklist: [
            { label: "Brand message is clear and differentiated" },
            { label: "One-liner names the problem, the solution, and the result" },
            grunt(),
            { label: "Tag-line is short and memorable" },
            voice(),
          ],
        },
        {
          key: "positioning",
          title: "Positioning",
          department: "STRATEGY",
          estimateMinutes: 120,
          processSteps: [
            { title: "Map the competitive ocean", estimateMinutes: 60 },
            { title: "Define the differentiated position", estimateMinutes: 60 },
          ],
          checklist: [{ label: "Position is distinct and ownable" }, voice()],
        },
        {
          key: "audience_segment",
          title: "Audience segment",
          department: "STRATEGY",
          estimateMinutes: 90,
          processSteps: [
            { title: "Pick the micro-segment", estimateMinutes: 45 },
            { title: "Note where they live and how they communicate", estimateMinutes: 45 },
          ],
          checklist: [{ label: "Segment is specific, not everyone" }],
        },
        {
          key: "offer_and_goal",
          title: "Offer and conversion goal",
          description: "What the funnel sells and the single primary conversion.",
          department: "STRATEGY",
          estimateMinutes: 90,
          processSteps: [
            { title: "Define the offer", estimateMinutes: 45 },
            { title: "Set the single conversion goal", description: "Book a call, buy, or register.", estimateMinutes: 45 },
          ],
          checklist: [{ label: "One primary conversion goal is set" }, { label: "Listed price anchors above the selling price" }],
        },
        {
          key: "creative_brief",
          title: "Creative brief",
          department: "STRATEGY",
          estimateMinutes: 120,
          dependsOnKeys: ["brand_messaging_playbook", "positioning", "audience_segment", "offer_and_goal"],
          processSteps: [
            { title: "Assemble the brief from strategy outputs", estimateMinutes: 90 },
            { title: "Name the three-step plan", estimateMinutes: 30 },
          ],
          checklist: [{ label: "Brief covers message, audience, offer, and the named plan" }, voice()],
        },
      ],
    },
    {
      key: "copy",
      order: 1,
      title: "Copy",
      phase: "INTEGRATE",
      initialStatus: "LOCKED",
      deliverables: [
        {
          key: "lead_magnet_concept",
          title: "Lead magnet angle",
          department: "COPY",
          kind: "OPTIONS_REQUIRED",
          isCopy: true,
          estimateMinutes: 90,
          optionSet: { prompt: "Lead magnet angle", minOptions: 2, maxOptions: 3 },
          processSteps: [{ title: "Draft two or three lead magnet angles", estimateMinutes: 90 }],
          checklist: [{ label: "Two or three distinct angles presented" }, voice()],
        },
        {
          key: "lead_magnet_content",
          title: "Lead magnet content",
          department: "COPY",
          isCopy: true,
          estimateMinutes: 240,
          dependsOnKeys: ["lead_magnet_concept"],
          processSteps: [
            { title: "Outline the lead magnet", estimateMinutes: 60 },
            { title: "Write the content", estimateMinutes: 180 },
          ],
          checklist: [{ label: "Delivers real value for free" }, brief(), voice()],
        },
        {
          key: "landing_page_headline",
          title: "Landing page headline",
          department: "COPY",
          kind: "OPTIONS_REQUIRED",
          isCopy: true,
          requiresGruntTest: true,
          estimateMinutes: 90,
          optionSet: { prompt: "Headline treatment", minOptions: 2, maxOptions: 3 },
          processSteps: [{ title: "Draft two or three grunt-test headlines", estimateMinutes: 90 }],
          checklist: [{ label: "Two or three headline options presented" }, grunt(), voice()],
        },
        {
          key: "landing_page_body",
          title: "Landing page body",
          description: "Mapped to the wireframe: offer statement, CTAs, three benefit blocks, the named plan, success statement, the stakes.",
          department: "COPY",
          isCopy: true,
          estimateMinutes: 180,
          dependsOnKeys: ["landing_page_headline"],
          processSteps: [
            { title: "Write offer statement and CTAs (direct and transitional)", estimateMinutes: 60 },
            { title: "Write three benefit blocks and the named plan", estimateMinutes: 60 },
            { title: "Write the success statement and the stakes", estimateMinutes: 60 },
          ],
          checklist: [{ label: "Direct and transitional CTAs present" }, { label: "Named three-step plan present" }, brief(), voice()],
        },
        {
          key: "email_nurture_sequence",
          title: "Email nurture sequence",
          department: "COPY",
          isCopy: true,
          estimateMinutes: 240,
          processSteps: [
            { title: "Email one: thank and deliver the asset, no selling", estimateMinutes: 60 },
            { title: "Nurture emails toward the direct CTA", estimateMinutes: 180 },
          ],
          checklist: [{ label: "Email one delivers the asset with no pitch" }, voice()],
        },
        {
          key: "ad_copy",
          title: "Ad copy",
          department: "COPY",
          isCopy: true,
          estimateMinutes: 120,
          processSteps: [{ title: "Write ad copy for the traffic source", estimateMinutes: 120 }],
          checklist: [brief(), voice()],
        },
      ],
    },
    {
      key: "design_dev",
      order: 2,
      title: "Design and build prep",
      phase: "INTEGRATE",
      initialStatus: "LOCKED",
      deliverables: [
        {
          key: "visual_system",
          title: "Visual system",
          department: "DESIGN",
          estimateMinutes: 180,
          processSteps: [{ title: "Define the visual system from the brand kit", estimateMinutes: 180 }],
          checklist: [{ label: "Consistent with the brand kit" }],
        },
        {
          key: "hero_treatment",
          title: "Hero treatment",
          department: "DESIGN",
          kind: "OPTIONS_REQUIRED",
          estimateMinutes: 120,
          optionSet: { prompt: "Hero treatment", minOptions: 2, maxOptions: 3 },
          processSteps: [{ title: "Design two or three hero treatments", estimateMinutes: 120 }],
          checklist: [{ label: "Two or three directions presented" }, { label: "Mobile stacking planned" }],
        },
        {
          key: "landing_page_design",
          title: "Landing page design",
          department: "DESIGN",
          estimateMinutes: 240,
          dependsOnKeys: ["landing_page_body", "hero_treatment"],
          processSteps: [
            { title: "Lay out the page against the wireframe", estimateMinutes: 180 },
            { title: "Plan mobile stacking", estimateMinutes: 60 },
          ],
          checklist: [{ label: "Matches approved copy and wireframe" }, { label: "Mobile stacking designed" }],
        },
        {
          key: "lead_magnet_design",
          title: "Lead magnet design",
          department: "DESIGN",
          estimateMinutes: 180,
          dependsOnKeys: ["lead_magnet_content"],
          processSteps: [{ title: "Design the lead magnet", estimateMinutes: 180 }],
          checklist: [{ label: "On brand and readable" }],
        },
        {
          key: "ad_creative",
          title: "Ad creative",
          department: "DESIGN",
          estimateMinutes: 120,
          dependsOnKeys: ["ad_copy"],
          processSteps: [{ title: "Design the ad creative", estimateMinutes: 120 }],
          checklist: [{ label: "Matches approved ad copy" }],
        },
        {
          key: "build_env",
          title: "Build environment",
          department: "DEV",
          estimateMinutes: 60,
          processSteps: [{ title: "Prepare the funnel build environment", estimateMinutes: 60 }],
          checklist: [{ label: "Environment ready (GoHighLevel or WordPress)" }],
        },
        {
          key: "optin_capture",
          title: "Opt-in capture",
          department: "DEV",
          estimateMinutes: 90,
          processSteps: [{ title: "Build the form and opt-in capture", estimateMinutes: 90 }],
          checklist: [{ label: "Form captures and stores the lead" }],
        },
        {
          key: "crm_subaccount",
          title: "CRM sub-account",
          department: "DEV",
          estimateMinutes: 60,
          processSteps: [{ title: "Create the CRM sub-account", estimateMinutes: 60 }],
          checklist: [{ label: "Sub-account created and linked" }],
        },
        {
          key: "automation_wiring",
          title: "Automation wiring",
          department: "DEV",
          estimateMinutes: 180,
          processSteps: [{ title: "Wire WhatsApp and email automation (n8n, Evolution API)", estimateMinutes: 180 }],
          checklist: [{ label: "Automations fire on opt-in" }],
        },
        {
          key: "tracking_setup",
          title: "Tracking setup",
          department: "DEV",
          estimateMinutes: 90,
          processSteps: [{ title: "Add tracking on every touchpoint", estimateMinutes: 90 }],
          checklist: [{ label: "Tracking present on every touchpoint" }],
        },
      ],
    },
    {
      key: "build",
      order: 3,
      title: "Build",
      phase: "ACTIVATE",
      initialStatus: "LOCKED",
      deliverables: [
        {
          key: "assemble_funnel",
          title: "Assemble the live funnel",
          department: "DEV",
          estimateMinutes: 240,
          dependsOnKeys: ["landing_page_design", "build_env"],
          processSteps: [{ title: "Assemble the live page and opt-in", estimateMinutes: 240 }],
          checklist: [{ label: "Page is live and matches the design" }, { label: "Mobile QA done" }],
        },
        {
          key: "optin_live",
          title: "Opt-in live",
          department: "DEV",
          estimateMinutes: 90,
          checklist: [{ label: "Opt-in works end to end" }],
        },
        {
          key: "thankyou_asset_delivery",
          title: "Thank-you and asset delivery",
          department: "DEV",
          estimateMinutes: 90,
          checklist: [{ label: "Asset is delivered after opt-in" }],
        },
        {
          key: "email_sequence_loaded",
          title: "Email sequence loaded",
          department: "DEV",
          estimateMinutes: 120,
          dependsOnKeys: ["email_nurture_sequence"],
          checklist: [{ label: "Sequence loaded into automation" }],
        },
        {
          key: "ads_pointed",
          title: "Ads pointed at the page",
          department: "DEV",
          estimateMinutes: 60,
          dependsOnKeys: ["ad_creative"],
          checklist: [{ label: "Ads point at the live page" }],
        },
        {
          key: "tracking_live",
          title: "Tracking live end to end",
          department: "DEV",
          estimateMinutes: 60,
          dependsOnKeys: ["tracking_setup"],
          checklist: [{ label: "Tracking fires end to end" }],
        },
        {
          key: "sales_backend",
          title: "Sales back end",
          description: "The offer the funnel feeds and follow-up logic per lead source.",
          department: "SALES",
          estimateMinutes: 180,
          checklist: [{ label: "Follow-up logic set per lead source" }],
        },
        {
          key: "proposal_template",
          title: "Proposal",
          department: "SALES",
          estimateMinutes: 120,
          checklist: [{ label: "Proposal converts the booked call" }, voice()],
        },
      ],
    },
    {
      key: "optimise",
      order: 4,
      title: "Optimise",
      phase: "ACTIVATE",
      initialStatus: "LOCKED",
      deliverables: [
        {
          key: "revenue_tracking",
          title: "Revenue per channel",
          department: "SALES",
          estimateMinutes: 90,
          checklist: [{ label: "Revenue tracked per channel" }],
        },
        {
          key: "cpa_review",
          title: "Cost per acquisition review",
          department: "SALES",
          estimateMinutes: 60,
          checklist: [{ label: "CPA reviewed per channel" }],
        },
        {
          key: "performance_read",
          title: "Performance read",
          department: "STRATEGY",
          estimateMinutes: 90,
          checklist: [{ label: "Learnings fed back to strategy" }],
        },
        {
          key: "ab_tests",
          title: "A/B tests",
          department: "COPY",
          estimateMinutes: 120,
          checklist: [{ label: "Tests run against the data" }],
        },
        {
          key: "winning_formulas",
          title: "Documented winning formulas",
          department: "DESIGN",
          estimateMinutes: 90,
          checklist: [{ label: "Winning formula documented for reuse" }],
        },
      ],
    },
  ],
};

export const TEMPLATES: Record<string, BrsTemplate> = {
  [BRS_STANDARD.key]: BRS_STANDARD,
};

export function getTemplate(key: string): BrsTemplate {
  const t = TEMPLATES[key];
  if (!t) throw new Error(`Unknown template: ${key}`);
  return t;
}
