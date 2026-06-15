import type {
  DeliverableStatus,
  StageStatus,
  Department,
  DeliveryType,
  EngagementStatus,
  BrsPhase,
} from "@prisma/client";

export const deliverableStatusLabel: Record<DeliverableStatus, string> = {
  BLOCKED: "Blocked",
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  CHANGES_NEEDED: "Changes needed",
  APPROVED: "Approved",
  PAUSED: "Paused",
};

export const deliverableStatusClass: Record<DeliverableStatus, string> = {
  BLOCKED: "bg-zinc-100 text-zinc-500",
  NOT_STARTED: "bg-zinc-200 text-zinc-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  SUBMITTED: "bg-amber-100 text-amber-800",
  CHANGES_NEEDED: "bg-orange-100 text-orange-800",
  APPROVED: "bg-green-100 text-green-700",
  PAUSED: "bg-purple-100 text-purple-700",
};

export const stageStatusLabel: Record<StageStatus, string> = {
  LOCKED: "Locked",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  PAUSED: "Paused",
};

export const stageStatusClass: Record<StageStatus, string> = {
  LOCKED: "bg-zinc-100 text-zinc-500",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  IN_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-700",
  PAUSED: "bg-purple-100 text-purple-700",
};

export const departmentLabel: Record<Department, string> = {
  STRATEGY: "Strategy",
  COPY: "Copy",
  DESIGN: "Design",
  DEV: "Web dev",
  SALES: "Sales",
};

export const deliveryTypeLabel: Record<DeliveryType, string> = {
  DIY: "Do it yourself",
  DWY: "Done with you",
  DFY: "Done for you",
};

export const engagementStatusLabel: Record<EngagementStatus, string> = {
  LEAD: "Lead",
  PROPOSED: "Proposed",
  WON: "Won",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  LOST: "Lost",
};

export const phaseLabel: Record<BrsPhase, string> = {
  DIFFERENTIATE: "Differentiate",
  INTEGRATE: "Integrate",
  ACTIVATE: "Activate",
};
