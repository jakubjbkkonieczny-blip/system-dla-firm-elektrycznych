-- Add business job number (per company, sequential from 1)
ALTER TABLE "Job" ADD COLUMN "jobNumber" INTEGER;

-- Backfill existing jobs: 1..N per companyId ordered by createdAt ASC
WITH "numbered" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "companyId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "rn"
  FROM "Job"
)
UPDATE "Job" AS "j"
SET "jobNumber" = "n"."rn"
FROM "numbered" AS "n"
WHERE "j"."id" = "n"."id";

ALTER TABLE "Job" ALTER COLUMN "jobNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Job_companyId_jobNumber_key" ON "Job"("companyId", "jobNumber");
