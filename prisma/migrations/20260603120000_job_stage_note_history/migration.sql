-- CreateTable
CREATE TABLE "JobStageNoteHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "editedByUserId" TEXT NOT NULL,
    "previousNote" TEXT NOT NULL,
    "newNote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobStageNoteHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobStageNoteHistory_companyId_jobId_stageId_createdAt_idx" ON "JobStageNoteHistory"("companyId", "jobId", "stageId", "createdAt");

-- CreateIndex
CREATE INDEX "JobStageNoteHistory_stageId_createdAt_idx" ON "JobStageNoteHistory"("stageId", "createdAt");

-- CreateIndex
CREATE INDEX "JobStageNoteHistory_editedByUserId_idx" ON "JobStageNoteHistory"("editedByUserId");

-- AddForeignKey
ALTER TABLE "JobStageNoteHistory" ADD CONSTRAINT "JobStageNoteHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStageNoteHistory" ADD CONSTRAINT "JobStageNoteHistory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStageNoteHistory" ADD CONSTRAINT "JobStageNoteHistory_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "JobStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStageNoteHistory" ADD CONSTRAINT "JobStageNoteHistory_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
