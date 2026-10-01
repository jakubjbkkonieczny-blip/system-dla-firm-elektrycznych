-- CreateTable
CREATE TABLE "JobPhoto" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobStageId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobPhoto_objectKey_key" ON "JobPhoto"("objectKey");

-- CreateIndex
CREATE INDEX "JobPhoto_companyId_createdAt_idx" ON "JobPhoto"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobPhoto_companyId_jobId_createdAt_idx" ON "JobPhoto"("companyId", "jobId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobPhoto_companyId_jobStageId_createdAt_idx" ON "JobPhoto"("companyId", "jobStageId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobPhoto_companyId_uploadedByUserId_createdAt_idx" ON "JobPhoto"("companyId", "uploadedByUserId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "JobPhoto" ADD CONSTRAINT "JobPhoto_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPhoto" ADD CONSTRAINT "JobPhoto_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPhoto" ADD CONSTRAINT "JobPhoto_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPhoto" ADD CONSTRAINT "JobPhoto_jobStageId_fkey" FOREIGN KEY ("jobStageId") REFERENCES "JobStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
