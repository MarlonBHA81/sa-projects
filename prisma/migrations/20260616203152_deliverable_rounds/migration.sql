-- CreateTable
CREATE TABLE "DeliverableRound" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "body" JSONB,
    "note" TEXT,
    "submittedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverableRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliverableRound_deliverableId_roundNumber_idx" ON "DeliverableRound"("deliverableId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableRound_deliverableId_roundNumber_key" ON "DeliverableRound"("deliverableId", "roundNumber");

-- AddForeignKey
ALTER TABLE "DeliverableRound" ADD CONSTRAINT "DeliverableRound_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
