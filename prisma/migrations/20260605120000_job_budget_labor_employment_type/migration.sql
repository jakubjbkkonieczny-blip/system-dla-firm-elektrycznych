-- Add employment type to planned labor rows (default: B2B).
ALTER TABLE "JobBudgetLaborItem"
ADD COLUMN "employmentType" TEXT NOT NULL DEFAULT 'b2b';
