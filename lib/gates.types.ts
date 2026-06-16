// Plain-data views the gate functions operate on. They are decoupled from
// Prisma so the gate logic stays pure and trivially unit-testable. The service
// layer maps Prisma rows into these shapes.

import type {
  Department,
  DeliverableKind,
  DeliverableStatus,
  GruntTestResult,
  StageStatus,
  ChecklistItemKind,
  Role,
} from "@prisma/client";

export type GateResult = { ok: boolean; reason?: string };

export const ALLOW: GateResult = { ok: true };
export function deny(reason: string): GateResult {
  return { ok: false, reason };
}

export type ChecklistItemView = {
  id: string;
  kind: ChecklistItemKind;
  required: boolean;
  checked: boolean;
  /** For GRUNT_TEST items, the latest recorded result (or null if none yet). */
  gruntResult?: GruntTestResult | null;
};

export type OptionSetView = {
  minOptions: number;
  maxOptions: number;
  optionCount: number;
  selectedOptionId: string | null;
};

export type DeliverableView = {
  id: string;
  stageId: string;
  department: Department;
  kind: DeliverableKind;
  status: DeliverableStatus;
  isCopy: boolean;
  requiresGruntTest: boolean;
  /** When true, open change requests must be resolved before approval. */
  requireReviewResolved: boolean;
  /** Status of the stage this deliverable belongs to. */
  stageStatus: StageStatus;
  /** True when every explicit prerequisite deliverable is APPROVED. */
  prerequisitesApproved: boolean;
};

export type StageView = {
  id: string;
  order: number;
  status: StageStatus;
  deliverableStatuses: DeliverableStatus[];
};

export type PlaybookView = {
  brandMessage?: string | null;
  oneLiner?: string | null;
  tagline?: string | null;
};

export type CopyApprovalItem = { isCopy: boolean; status: DeliverableStatus };

export type ResyncPlan = {
  shouldResync: boolean;
  deliverableIds: string[];
  stageIds: string[];
};

export type GruntBooleans = {
  passWhatOffered: boolean;
  passHowItHelps: boolean;
  passWhatToDo: boolean;
};

export type { Role };
