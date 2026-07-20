-- AlterTable
ALTER TABLE "VerificationToken" ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "VerificationToken_userPurposeCreatedAt_idx" ON "VerificationToken"("userId", "purpose", "createdAt");
