-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STRATEGY', 'COPY', 'DESIGN', 'DEV', 'SALES');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('STRATEGY', 'COPY', 'DESIGN', 'DEV', 'SALES');

-- CreateEnum
CREATE TYPE "BrsPhase" AS ENUM ('DIFFERENTIATE', 'INTEGRATE', 'ACTIVATE');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('LOCKED', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED', 'PAUSED');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('BLOCKED', 'NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'CHANGES_NEEDED', 'APPROVED', 'PAUSED');

-- CreateEnum
CREATE TYPE "DeliverableKind" AS ENUM ('STANDARD', 'OPTIONS_REQUIRED', 'PLAYBOOK');

-- CreateEnum
CREATE TYPE "ChecklistItemKind" AS ENUM ('MANUAL', 'GRUNT_TEST', 'VOICE', 'AI');

-- CreateEnum
CREATE TYPE "ProcessStepStatus" AS ENUM ('TODO', 'DONE');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'CHANGES_NEEDED');

-- CreateEnum
CREATE TYPE "GruntTestResult" AS ENUM ('PASS', 'FAIL', 'NOT_TESTED');

-- CreateEnum
CREATE TYPE "ConversionGoal" AS ENUM ('BOOK_A_CALL', 'BUY', 'REGISTER');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('DIY', 'DWY', 'DFY');

-- CreateEnum
CREATE TYPE "EngagementStatus" AS ENUM ('LEAD', 'PROPOSED', 'WON', 'ACTIVE', 'COMPLETED', 'LOST');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('PROJECT_CREATED', 'DELIVERABLE_STARTED', 'DELIVERABLE_SUBMITTED', 'DELIVERABLE_APPROVED', 'DELIVERABLE_CHANGES_NEEDED', 'OPTION_ADDED', 'OPTION_SELECTED', 'STAGE_GATE_CLEARED', 'COPY_CHANGED_RESYNC', 'GRUNT_TEST_RECORDED', 'CHECKLIST_ITEM_CHECKED', 'COMMENT_ADDED', 'PLAYBOOK_UPDATED', 'TIMER_STARTED', 'TIMER_STOPPED', 'TIME_LOGGED', 'DELIVERABLE_ASSIGNED', 'DUE_DATE_SET', 'GHL_SYNCED', 'LEAD_IMPORTED', 'LEAD_PUSHED', 'MILESTONE_PUSHED', 'SLACK_NOTIFIED', 'AI_INSIGHT_CREATED', 'AI_INSIGHT_RESOLVED', 'ENGAGEMENT_COMPLETED', 'PNL_GENERATED');

-- CreateEnum
CREATE TYPE "AiScope" AS ENUM ('DELIVERABLE', 'STAGE', 'BUILD', 'PORTFOLIO');

-- CreateEnum
CREATE TYPE "AiInsightType" AS ENUM ('GRUNT_TEST', 'VOICE', 'SB7_ALIGNMENT', 'BOTTLENECK', 'SLIPPAGE', 'TREND', 'PROCESS_SUGGESTION');

-- CreateEnum
CREATE TYPE "AiSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AiInsightStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'APPLIED', 'DISMISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "department" "Department",
    "weeklyCapacityHours" INTEGER,
    "costRatePerHour" DECIMAL(10,2),
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deliveryType" "DeliveryType" NOT NULL,
    "status" "EngagementStatus" NOT NULL DEFAULT 'ACTIVE',
    "listPrice" DECIMAL(12,2),
    "price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    "paidAt" TIMESTAMP(3),
    "ghlRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementCost" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PnLStatement" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "revenueTotal" DECIMAL(12,2) NOT NULL,
    "deliveryCost" DECIMAL(12,2) NOT NULL,
    "adSpend" DECIMAL(12,2) NOT NULL,
    "otherCosts" DECIMAL(12,2) NOT NULL,
    "grossProfit" DECIMAL(12,2) NOT NULL,
    "marginPct" DOUBLE PRECISION NOT NULL,
    "lines" JSONB NOT NULL,
    "summary" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PnLStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelBuild" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conversionGoal" "ConversionGoal",
    "audienceSegment" TEXT,
    "currentPhase" "BrsPhase" NOT NULL DEFAULT 'DIFFERENTIATE',
    "templateKey" TEXT NOT NULL DEFAULT 'brs-standard-v1',
    "ghlLocationId" TEXT,
    "ghlLastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunnelBuild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "funnelBuildId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "phase" "BrsPhase" NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'LOCKED',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "funnelBuildId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "department" "Department" NOT NULL,
    "kind" "DeliverableKind" NOT NULL DEFAULT 'STANDARD',
    "status" "DeliverableStatus" NOT NULL DEFAULT 'BLOCKED',
    "order" INTEGER NOT NULL,
    "isCopy" BOOLEAN NOT NULL DEFAULT false,
    "requiresGruntTest" BOOLEAN NOT NULL DEFAULT false,
    "body" JSONB,
    "estimateMinutes" INTEGER,
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableDependency" (
    "id" TEXT NOT NULL,
    "dependentId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,

    CONSTRAINT "DeliverableDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessStep" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimateMinutes" INTEGER,
    "status" "ProcessStepStatus" NOT NULL DEFAULT 'TODO',
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "ChecklistItemKind" NOT NULL DEFAULT 'MANUAL',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GruntTestCheck" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "optionId" TEXT,
    "passWhatOffered" BOOLEAN NOT NULL DEFAULT false,
    "passHowItHelps" BOOLEAN NOT NULL DEFAULT false,
    "passWhatToDo" BOOLEAN NOT NULL DEFAULT false,
    "result" "GruntTestResult" NOT NULL DEFAULT 'NOT_TESTED',
    "testedText" TEXT NOT NULL,
    "note" TEXT,
    "testedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GruntTestCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionSet" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "minOptions" INTEGER NOT NULL DEFAULT 2,
    "maxOptions" INTEGER NOT NULL DEFAULT 3,
    "selectedOptionId" TEXT,
    "selectedAt" TIMESTAMP(3),
    "selectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "optionSetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandPlaybook" (
    "id" TEXT NOT NULL,
    "funnelBuildId" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "brandMessage" TEXT,
    "oneLiner" TEXT,
    "tagline" TEXT,
    "bios" JSONB,
    "salesPitch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandPlaybook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isHandoff" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "deliverableId" TEXT,
    "funnelBuildId" TEXT,
    "fromDept" "Department",
    "toDept" "Department",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "engagementId" TEXT,
    "funnelBuildId" TEXT,
    "deliverableId" TEXT,
    "actorId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "note" TEXT,
    "isRunning" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BurndownSnapshot" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remainingEstimateMinutes" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "approvedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BurndownSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueChannel" (
    "id" TEXT NOT NULL,
    "funnelBuildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadsCount" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "funnelBuildId" TEXT NOT NULL,
    "ghlContactId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "status" TEXT,
    "value" DECIMAL(12,2),
    "ghlCreatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GhlConnection" (
    "id" TEXT NOT NULL,
    "funnelBuildId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "tokenRef" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GhlConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "department" "Department",
    "steps" JSONB NOT NULL,
    "checklist" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "scope" "AiScope" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "type" "AiInsightType" NOT NULL,
    "severity" "AiSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "suggestions" JSONB,
    "status" "AiInsightStatus" NOT NULL DEFAULT 'NEW',
    "modelUsed" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "costUsd" DECIMAL(10,4),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Engagement_clientId_idx" ON "Engagement"("clientId");

-- CreateIndex
CREATE INDEX "Engagement_status_idx" ON "Engagement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_ghlRef_key" ON "Payment"("ghlRef");

-- CreateIndex
CREATE INDEX "Payment_engagementId_idx" ON "Payment"("engagementId");

-- CreateIndex
CREATE INDEX "EngagementCost_engagementId_idx" ON "EngagementCost"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "PnLStatement_engagementId_key" ON "PnLStatement"("engagementId");

-- CreateIndex
CREATE INDEX "FunnelBuild_engagementId_idx" ON "FunnelBuild"("engagementId");

-- CreateIndex
CREATE INDEX "Stage_funnelBuildId_status_idx" ON "Stage"("funnelBuildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_funnelBuildId_order_key" ON "Stage"("funnelBuildId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_funnelBuildId_key_key" ON "Stage"("funnelBuildId", "key");

-- CreateIndex
CREATE INDEX "Deliverable_stageId_status_idx" ON "Deliverable"("stageId", "status");

-- CreateIndex
CREATE INDEX "Deliverable_funnelBuildId_isCopy_status_idx" ON "Deliverable"("funnelBuildId", "isCopy", "status");

-- CreateIndex
CREATE INDEX "Deliverable_department_status_idx" ON "Deliverable"("department", "status");

-- CreateIndex
CREATE INDEX "Deliverable_assigneeId_idx" ON "Deliverable"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_funnelBuildId_key_key" ON "Deliverable"("funnelBuildId", "key");

-- CreateIndex
CREATE INDEX "DeliverableDependency_prerequisiteId_idx" ON "DeliverableDependency"("prerequisiteId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableDependency_dependentId_prerequisiteId_key" ON "DeliverableDependency"("dependentId", "prerequisiteId");

-- CreateIndex
CREATE INDEX "ProcessStep_deliverableId_order_idx" ON "ProcessStep"("deliverableId", "order");

-- CreateIndex
CREATE INDEX "ChecklistItem_deliverableId_order_idx" ON "ChecklistItem"("deliverableId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "GruntTestCheck_checklistItemId_key" ON "GruntTestCheck"("checklistItemId");

-- CreateIndex
CREATE INDEX "GruntTestCheck_deliverableId_createdAt_idx" ON "GruntTestCheck"("deliverableId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OptionSet_deliverableId_key" ON "OptionSet"("deliverableId");

-- CreateIndex
CREATE UNIQUE INDEX "OptionSet_selectedOptionId_key" ON "OptionSet"("selectedOptionId");

-- CreateIndex
CREATE INDEX "Option_optionSetId_idx" ON "Option"("optionSetId");

-- CreateIndex
CREATE INDEX "Approval_deliverableId_createdAt_idx" ON "Approval"("deliverableId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrandPlaybook_funnelBuildId_key" ON "BrandPlaybook"("funnelBuildId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandPlaybook_deliverableId_key" ON "BrandPlaybook"("deliverableId");

-- CreateIndex
CREATE INDEX "Comment_deliverableId_createdAt_idx" ON "Comment"("deliverableId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_funnelBuildId_createdAt_idx" ON "Comment"("funnelBuildId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_funnelBuildId_createdAt_idx" ON "Activity"("funnelBuildId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_engagementId_createdAt_idx" ON "Activity"("engagementId", "createdAt");

-- CreateIndex
CREATE INDEX "TimeEntry_deliverableId_idx" ON "TimeEntry"("deliverableId");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_isRunning_idx" ON "TimeEntry"("userId", "isRunning");

-- CreateIndex
CREATE INDEX "BurndownSnapshot_stageId_date_idx" ON "BurndownSnapshot"("stageId", "date");

-- CreateIndex
CREATE INDEX "RevenueChannel_funnelBuildId_idx" ON "RevenueChannel"("funnelBuildId");

-- CreateIndex
CREATE INDEX "Lead_funnelBuildId_idx" ON "Lead"("funnelBuildId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_funnelBuildId_ghlContactId_key" ON "Lead"("funnelBuildId", "ghlContactId");

-- CreateIndex
CREATE UNIQUE INDEX "GhlConnection_funnelBuildId_key" ON "GhlConnection"("funnelBuildId");

-- CreateIndex
CREATE INDEX "ProcessTemplate_name_idx" ON "ProcessTemplate"("name");

-- CreateIndex
CREATE INDEX "AiInsight_scope_scopeId_idx" ON "AiInsight"("scope", "scopeId");

-- CreateIndex
CREATE INDEX "AiInsight_status_severity_idx" ON "AiInsight"("status", "severity");

-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementCost" ADD CONSTRAINT "EngagementCost_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PnLStatement" ADD CONSTRAINT "PnLStatement_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelBuild" ADD CONSTRAINT "FunnelBuild_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_funnelBuildId_fkey" FOREIGN KEY ("funnelBuildId") REFERENCES "FunnelBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_funnelBuildId_fkey" FOREIGN KEY ("funnelBuildId") REFERENCES "FunnelBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableDependency" ADD CONSTRAINT "DeliverableDependency_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableDependency" ADD CONSTRAINT "DeliverableDependency_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GruntTestCheck" ADD CONSTRAINT "GruntTestCheck_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GruntTestCheck" ADD CONSTRAINT "GruntTestCheck_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GruntTestCheck" ADD CONSTRAINT "GruntTestCheck_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionSet" ADD CONSTRAINT "OptionSet_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionSet" ADD CONSTRAINT "OptionSet_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "Option"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_optionSetId_fkey" FOREIGN KEY ("optionSetId") REFERENCES "OptionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandPlaybook" ADD CONSTRAINT "BrandPlaybook_funnelBuildId_fkey" FOREIGN KEY ("funnelBuildId") REFERENCES "FunnelBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandPlaybook" ADD CONSTRAINT "BrandPlaybook_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_funnelBuildId_fkey" FOREIGN KEY ("funnelBuildId") REFERENCES "FunnelBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_funnelBuildId_fkey" FOREIGN KEY ("funnelBuildId") REFERENCES "FunnelBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BurndownSnapshot" ADD CONSTRAINT "BurndownSnapshot_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueChannel" ADD CONSTRAINT "RevenueChannel_funnelBuildId_fkey" FOREIGN KEY ("funnelBuildId") REFERENCES "FunnelBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_funnelBuildId_fkey" FOREIGN KEY ("funnelBuildId") REFERENCES "FunnelBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
