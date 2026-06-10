-- Job stage supervisor + approval workflow (minimal additive migration)

ALTER TABLE "JobStage" ADD COLUMN IF NOT EXISTS "supervisorUserId" TEXT;
ALTER TABLE "JobStage" ADD COLUMN IF NOT EXISTS "supervisorCanCreateStages" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JobStage" ADD COLUMN IF NOT EXISTS "supervisorAssignedAt" TIMESTAMP(3);
ALTER TABLE "JobStage" ADD COLUMN IF NOT EXISTS "supervisorAssignedByUserId" TEXT;
ALTER TABLE "JobStage" ADD COLUMN IF NOT EXISTS "submittedForApprovalAt" TIMESTAMP(3);
ALTER TABLE "JobStage" ADD COLUMN IF NOT EXISTS "submittedByUserId" TEXT;
ALTER TABLE "JobStage" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "JobStage" ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT;
ALTER TABLE "JobStage" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);
ALTER TABLE "JobStage" ADD COLUMN IF NOT EXISTS "rejectedByUserId" TEXT;
ALTER TABLE "JobStage" ADD COLUMN IF NOT EXISTS "rejectionComment" TEXT;

CREATE INDEX IF NOT EXISTS "JobStage_supervisorUserId_idx" ON "JobStage"("supervisorUserId");

ALTER TABLE "JobStage" ADD CONSTRAINT "JobStage_supervisorUserId_fkey"
  FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobStage" ADD CONSTRAINT "JobStage_supervisorAssignedByUserId_fkey"
  FOREIGN KEY ("supervisorAssignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobStage" ADD CONSTRAINT "JobStage_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobStage" ADD CONSTRAINT "JobStage_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobStage" ADD CONSTRAINT "JobStage_rejectedByUserId_fkey"
  FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "JobStageHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "comment" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobStageHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "JobStageHistory_companyId_jobId_stageId_createdAt_idx"
  ON "JobStageHistory"("companyId", "jobId", "stageId", "createdAt");
CREATE INDEX IF NOT EXISTS "JobStageHistory_stageId_createdAt_idx"
  ON "JobStageHistory"("stageId", "createdAt");
CREATE INDEX IF NOT EXISTS "JobStageHistory_actorUserId_idx"
  ON "JobStageHistory"("actorUserId");

ALTER TABLE "JobStageHistory" ADD CONSTRAINT "JobStageHistory_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobStageHistory" ADD CONSTRAINT "JobStageHistory_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobStageHistory" ADD CONSTRAINT "JobStageHistory_stageId_fkey"
  FOREIGN KEY ("stageId") REFERENCES "JobStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobStageHistory" ADD CONSTRAINT "JobStageHistory_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobStageHistory" ADD CONSTRAINT "JobStageHistory_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
