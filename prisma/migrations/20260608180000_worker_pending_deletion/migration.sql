-- AlterTable
ALTER TABLE "User" ADD COLUMN "pendingDeletionAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_pendingDeletionAt_idx" ON "User"("pendingDeletionAt");
