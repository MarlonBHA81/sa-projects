import type {
  DeliverableStatus,
  StageStatus,
  Department,
  DeliveryType,
  EngagementStatus,
  BrsPhase,
  AiSeverity,
  AiScope,
  AiInsightStatus,
  ProjectStatus,
  ProjectBillingType,
  TaskStatus,
  TaskPriority,
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

export const departmentClass: Record<Department, string> = {
  STRATEGY: "bg-purple-100 text-purple-700",
  COPY: "bg-blue-100 text-blue-700",
  DESIGN: "bg-pink-100 text-pink-700",
  DEV: "bg-emerald-100 text-emerald-700",
  SALES: "bg-amber-100 text-amber-700",
};

/** Chip styling for an ad-hoc task with no department. */
export const generalChipClass = "bg-zinc-100 text-zinc-600";

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

export const aiSeverityClass: Record<AiSeverity, string> = {
  INFO: "bg-zinc-100 text-zinc-600",
  LOW: "bg-blue-100 text-blue-700",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-red-100 text-red-700",
};

export const aiScopeLabel: Record<AiScope, string> = {
  DELIVERABLE: "Deliverable",
  STAGE: "Stage",
  BUILD: "Build",
  PORTFOLIO: "Portfolio",
};

export const aiInsightStatusLabel: Record<AiInsightStatus, string> = {
  NEW: "New",
  ACKNOWLEDGED: "Acknowledged",
  APPLIED: "Applied",
  DISMISSED: "Dismissed",
};

// ---------------------------------------------------------------------------
// Perfex project management
// ---------------------------------------------------------------------------

export const projectStatusLabel: Record<ProjectStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  FINISHED: "Finished",
  CANCELLED: "Cancelled",
};

export const projectStatusClass: Record<ProjectStatus, string> = {
  NOT_STARTED: "bg-zinc-200 text-zinc-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  ON_HOLD: "bg-purple-100 text-purple-700",
  FINISHED: "bg-green-100 text-green-700",
  CANCELLED: "bg-zinc-100 text-zinc-500",
};

export const billingTypeLabel: Record<ProjectBillingType, string> = {
  FIXED_RATE: "Fixed rate",
  PROJECT_HOURS: "Project hours",
  TASK_HOURS: "Task hours",
};

// Perfex board order: Not Started, In Progress, Testing, Awaiting Feedback, Complete.
export const taskStatusOrder: TaskStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "TESTING",
  "AWAITING_FEEDBACK",
  "COMPLETE",
];

export const taskStatusLabel: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  TESTING: "Testing",
  AWAITING_FEEDBACK: "Awaiting feedback",
  COMPLETE: "Complete",
};

export const taskStatusClass: Record<TaskStatus, string> = {
  NOT_STARTED: "bg-zinc-200 text-zinc-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  TESTING: "bg-amber-100 text-amber-800",
  AWAITING_FEEDBACK: "bg-orange-100 text-orange-800",
  COMPLETE: "bg-green-100 text-green-700",
};

export const taskPriorityLabel: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const taskPriorityClass: Record<TaskPriority, string> = {
  LOW: "bg-zinc-100 text-zinc-600",
  MEDIUM: "bg-sky-100 text-sky-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};
