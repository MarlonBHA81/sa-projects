-- AlterTable
ALTER TABLE "Engagement" ADD COLUMN     "costAlertThreshold" INTEGER,
ADD COLUMN     "costBudget" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "billRatePerHour" DECIMAL(10,2);
