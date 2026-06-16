-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "isChangeRequest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT;

-- AlterTable
ALTER TABLE "Deliverable" ADD COLUMN     "requireReviewResolved" BOOLEAN NOT NULL DEFAULT true;
