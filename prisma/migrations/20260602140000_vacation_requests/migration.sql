-- CreateTable
CREATE TABLE "VacationRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VacationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacationRequest_companyId_status_idx" ON "VacationRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "VacationRequest_companyId_userId_idx" ON "VacationRequest"("companyId", "userId");

-- CreateIndex
CREATE INDEX "VacationRequest_companyId_startDate_idx" ON "VacationRequest"("companyId", "startDate");

-- CreateIndex
CREATE INDEX "VacationRequest_companyId_endDate_idx" ON "VacationRequest"("companyId", "endDate");

-- CreateIndex
CREATE INDEX "VacationRequest_companyId_startDate_endDate_idx" ON "VacationRequest"("companyId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
