-- CreateTable
CREATE TABLE "JobBudget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "totalBudgetCents" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobBudgetItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "taxCategory" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "netAmountCents" INTEGER,
    "vatRate" TEXT,
    "grossAmountCents" INTEGER NOT NULL,
    "deductible" BOOLEAN NOT NULL DEFAULT true,
    "documentType" TEXT,
    "plannedDate" TIMESTAMP(3),
    "assignedUserId" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobBudgetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobBudgetLaborItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "userId" TEXT,
    "plannedMinutes" INTEGER NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "plannedDate" TIMESTAMP(3),
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobBudgetLaborItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobBudget_jobId_key" ON "JobBudget"("jobId");

-- CreateIndex
CREATE INDEX "JobBudget_companyId_jobId_idx" ON "JobBudget"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobBudgetItem_companyId_jobId_idx" ON "JobBudgetItem"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobBudgetItem_budgetId_idx" ON "JobBudgetItem"("budgetId");

-- CreateIndex
CREATE INDEX "JobBudgetItem_companyId_jobId_createdAt_idx" ON "JobBudgetItem"("companyId", "jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobBudgetItem_companyId_jobId_category_idx" ON "JobBudgetItem"("companyId", "jobId", "category");

-- CreateIndex
CREATE INDEX "JobBudgetItem_companyId_jobId_taxCategory_idx" ON "JobBudgetItem"("companyId", "jobId", "taxCategory");

-- CreateIndex
CREATE INDEX "JobBudgetLaborItem_companyId_jobId_idx" ON "JobBudgetLaborItem"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "JobBudgetLaborItem_budgetId_idx" ON "JobBudgetLaborItem"("budgetId");

-- CreateIndex
CREATE INDEX "JobBudgetLaborItem_companyId_jobId_createdAt_idx" ON "JobBudgetLaborItem"("companyId", "jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "JobBudget" ADD CONSTRAINT "JobBudget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBudget" ADD CONSTRAINT "JobBudget_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBudgetItem" ADD CONSTRAINT "JobBudgetItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBudgetItem" ADD CONSTRAINT "JobBudgetItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBudgetItem" ADD CONSTRAINT "JobBudgetItem_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "JobBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBudgetItem" ADD CONSTRAINT "JobBudgetItem_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBudgetItem" ADD CONSTRAINT "JobBudgetItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBudgetLaborItem" ADD CONSTRAINT "JobBudgetLaborItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBudgetLaborItem" ADD CONSTRAINT "JobBudgetLaborItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBudgetLaborItem" ADD CONSTRAINT "JobBudgetLaborItem_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "JobBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBudgetLaborItem" ADD CONSTRAINT "JobBudgetLaborItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBudgetLaborItem" ADD CONSTRAINT "JobBudgetLaborItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
