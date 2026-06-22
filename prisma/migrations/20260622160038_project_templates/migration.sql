-- CreateEnum
CREATE TYPE "ProjectTemplateKind" AS ENUM ('PROCESS', 'SPRINT', 'UNSTRUCTURED');

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'PROJECT_CREATED_FROM_TEMPLATE';

-- CreateTable
CREATE TABLE "ProjectTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProjectTemplateKind" NOT NULL DEFAULT 'UNSTRUCTURED',
    "description" TEXT,
    "defaultBillingType" "ProjectBillingType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateMilestone" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "dueOffsetDays" INTEGER,
    "durationDays" INTEGER,
    "sprintIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateTask" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateMilestoneId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority",
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "hourlyRate" DECIMAL(15,2),
    "estimateMinutes" INTEGER,
    "startOffsetDays" INTEGER,
    "dueOffsetDays" INTEGER,
    "defaultAssigneeRole" "Department",
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateChecklistItem" (
    "id" TEXT NOT NULL,
    "templateTaskId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectTemplate_kind_order_idx" ON "ProjectTemplate"("kind", "order");

-- CreateIndex
CREATE INDEX "TemplateMilestone_templateId_order_idx" ON "TemplateMilestone"("templateId", "order");

-- CreateIndex
CREATE INDEX "TemplateTask_templateId_order_idx" ON "TemplateTask"("templateId", "order");

-- CreateIndex
CREATE INDEX "TemplateTask_templateMilestoneId_order_idx" ON "TemplateTask"("templateMilestoneId", "order");

-- CreateIndex
CREATE INDEX "TemplateChecklistItem_templateTaskId_order_idx" ON "TemplateChecklistItem"("templateTaskId", "order");

-- AddForeignKey
ALTER TABLE "TemplateMilestone" ADD CONSTRAINT "TemplateMilestone_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTask" ADD CONSTRAINT "TemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTask" ADD CONSTRAINT "TemplateTask_templateMilestoneId_fkey" FOREIGN KEY ("templateMilestoneId") REFERENCES "TemplateMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateChecklistItem" ADD CONSTRAINT "TemplateChecklistItem_templateTaskId_fkey" FOREIGN KEY ("templateTaskId") REFERENCES "TemplateTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
