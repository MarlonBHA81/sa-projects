-- CreateEnum (idempotent: these may already exist from a partially-applied run)
DO $$ BEGIN
  CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'FINISHED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectBillingType" AS ENUM ('FIXED_RATE', 'PROJECT_HOURS', 'TASK_HOURS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.
-- IF NOT EXISTS keeps this safe to re-run after a partial apply.

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROJECT_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROJECT_FINISHED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MILESTONE_CREATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MILESTONE_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MILESTONE_MOVED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TASK_ASSIGNED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TASK_COMMENTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CHECKLIST_ITEM_ADDED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CHECKLIST_ITEM_TOGGLED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TIMESHEET_LOGGED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TIMESHEET_TIMER_STARTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TIMESHEET_TIMER_STOPPED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROJECT_MEMBER_ADDED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROJECT_MEMBER_REMOVED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROJECT_FILE_ADDED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROJECT_DISCUSSION_CREATED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROJECT_DISCUSSION_COMMENTED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PROJECT_NOTE_ADDED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'TASK_BILLED';

-- AlterEnum: reshape TaskStatus from the legacy set (OPEN, IN_PROGRESS, DONE)
-- to the Perfex set. Runs only while the legacy 'OPEN' value still exists, so
-- it is safe to re-run, and it MAPS existing rows (OPEN -> NOT_STARTED,
-- DONE -> COMPLETE) instead of a bare cast that would fail on real data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TaskStatus' AND e.enumlabel = 'OPEN'
  ) THEN
    CREATE TYPE "TaskStatus_new" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'TESTING', 'AWAITING_FEEDBACK', 'COMPLETE');
    ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Task" ALTER COLUMN "status" TYPE "TaskStatus_new" USING (
      CASE "status"::text
        WHEN 'OPEN' THEN 'NOT_STARTED'
        WHEN 'DONE' THEN 'COMPLETE'
        ELSE "status"::text
      END::"TaskStatus_new"
    );
    ALTER TYPE "TaskStatus" RENAME TO "TaskStatus_old";
    ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";
    DROP TYPE "TaskStatus_old";
    ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED';
  END IF;
END $$;

-- DropIndex
DROP INDEX IF EXISTS "Task_projectId_idx";

-- AlterTable
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "ghlContactId" TEXT,
ADD COLUMN IF NOT EXISTS "ghlOpportunityId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "billingType" "ProjectBillingType" NOT NULL DEFAULT 'FIXED_RATE',
ADD COLUMN IF NOT EXISTS "clientId" TEXT,
ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'ZAR',
ADD COLUMN IF NOT EXISTS "dateFinished" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deadline" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "estimatedHours" DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "progressFromTasks" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "projectCost" DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS "ratePerHour" DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "status" "ProjectStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "billable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "billed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "dateFinished" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "hourlyRate" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "kanbanOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "milestoneId" TEXT,
ADD COLUMN IF NOT EXISTS "milestoneOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "priority" "TaskPriority",
ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "visibleToClient" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED';

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectSettings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "viewTasks" BOOLEAN NOT NULL DEFAULT false,
    "createTasks" BOOLEAN NOT NULL DEFAULT false,
    "editTasks" BOOLEAN NOT NULL DEFAULT false,
    "commentOnTasks" BOOLEAN NOT NULL DEFAULT false,
    "viewTaskComments" BOOLEAN NOT NULL DEFAULT false,
    "viewTaskAttachments" BOOLEAN NOT NULL DEFAULT false,
    "viewTaskChecklistItems" BOOLEAN NOT NULL DEFAULT false,
    "uploadOnTasks" BOOLEAN NOT NULL DEFAULT false,
    "viewTaskTotalLoggedTime" BOOLEAN NOT NULL DEFAULT false,
    "viewFinanceOverview" BOOLEAN NOT NULL DEFAULT false,
    "uploadFiles" BOOLEAN NOT NULL DEFAULT false,
    "openDiscussions" BOOLEAN NOT NULL DEFAULT false,
    "viewMilestones" BOOLEAN NOT NULL DEFAULT false,
    "viewGantt" BOOLEAN NOT NULL DEFAULT false,
    "viewTimesheets" BOOLEAN NOT NULL DEFAULT false,
    "viewActivityLog" BOOLEAN NOT NULL DEFAULT false,
    "viewTeamMembers" BOOLEAN NOT NULL DEFAULT false,
    "hideTasksOnMainTable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "descriptionVisibleToCustomer" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "hideFromCustomer" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TaskAssignee" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TaskFollower" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TaskChecklistItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "finishedAt" TIMESTAMP(3),
    "finishedById" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Timesheet" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "hourlyRate" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT,
    "subject" TEXT,
    "description" TEXT,
    "fileType" TEXT,
    "url" TEXT,
    "external" TEXT,
    "externalLink" TEXT,
    "visibleToCustomer" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectDiscussion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "showToCustomer" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectDiscussion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DiscussionComment" (
    "id" TEXT NOT NULL,
    "discussionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectNote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectActivity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT,
    "visibleToCustomer" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectSettings_projectId_key" ON "ProjectSettings"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Milestone_projectId_order_idx" ON "Milestone"("projectId", "order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskAssignee_userId_idx" ON "TaskAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TaskAssignee_taskId_userId_key" ON "TaskAssignee"("taskId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskFollower_userId_idx" ON "TaskFollower"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TaskFollower_taskId_userId_key" ON "TaskFollower"("taskId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskChecklistItem_taskId_order_idx" ON "TaskChecklistItem"("taskId", "order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Timesheet_taskId_idx" ON "Timesheet"("taskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Timesheet_staffId_idx" ON "Timesheet"("staffId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectFile_projectId_idx" ON "ProjectFile"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectDiscussion_projectId_createdAt_idx" ON "ProjectDiscussion"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DiscussionComment_discussionId_createdAt_idx" ON "DiscussionComment"("discussionId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectNote_projectId_createdAt_idx" ON "ProjectNote"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectActivity_projectId_createdAt_idx" ON "ProjectActivity"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_projectId_status_idx" ON "Task"("projectId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_projectId_milestoneId_idx" ON "Task"("projectId", "milestoneId");

-- AddForeignKey (drop-if-exists then add keeps this safe to re-run)
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_clientId_fkey";
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSettings" DROP CONSTRAINT IF EXISTS "ProjectSettings_projectId_fkey";
ALTER TABLE "ProjectSettings" ADD CONSTRAINT "ProjectSettings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" DROP CONSTRAINT IF EXISTS "ProjectMember_projectId_fkey";
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" DROP CONSTRAINT IF EXISTS "ProjectMember_userId_fkey";
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" DROP CONSTRAINT IF EXISTS "Milestone_projectId_fkey";
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_milestoneId_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" DROP CONSTRAINT IF EXISTS "TaskAssignee_taskId_fkey";
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" DROP CONSTRAINT IF EXISTS "TaskAssignee_userId_fkey";
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFollower" DROP CONSTRAINT IF EXISTS "TaskFollower_taskId_fkey";
ALTER TABLE "TaskFollower" ADD CONSTRAINT "TaskFollower_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFollower" DROP CONSTRAINT IF EXISTS "TaskFollower_userId_fkey";
ALTER TABLE "TaskFollower" ADD CONSTRAINT "TaskFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChecklistItem" DROP CONSTRAINT IF EXISTS "TaskChecklistItem_taskId_fkey";
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" DROP CONSTRAINT IF EXISTS "TaskComment_taskId_fkey";
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" DROP CONSTRAINT IF EXISTS "TaskComment_authorId_fkey";
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" DROP CONSTRAINT IF EXISTS "Timesheet_taskId_fkey";
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" DROP CONSTRAINT IF EXISTS "Timesheet_staffId_fkey";
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" DROP CONSTRAINT IF EXISTS "ProjectFile_projectId_fkey";
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDiscussion" DROP CONSTRAINT IF EXISTS "ProjectDiscussion_projectId_fkey";
ALTER TABLE "ProjectDiscussion" ADD CONSTRAINT "ProjectDiscussion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionComment" DROP CONSTRAINT IF EXISTS "DiscussionComment_discussionId_fkey";
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "ProjectDiscussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNote" DROP CONSTRAINT IF EXISTS "ProjectNote_projectId_fkey";
ALTER TABLE "ProjectNote" ADD CONSTRAINT "ProjectNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivity" DROP CONSTRAINT IF EXISTS "ProjectActivity_projectId_fkey";
ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivity" DROP CONSTRAINT IF EXISTS "ProjectActivity_actorId_fkey";
ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
