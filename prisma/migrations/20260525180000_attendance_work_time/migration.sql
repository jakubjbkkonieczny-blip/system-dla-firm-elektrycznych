-- AlterTable
ALTER TABLE "AttendanceSession" ADD COLUMN "totalBreakMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AttendanceSession" ADD COLUMN "totalWorkedMinutes" INTEGER;
ALTER TABLE "AttendanceSession" ADD COLUMN "managerProofPhotoUrl" TEXT;
ALTER TABLE "AttendanceSession" ADD COLUMN "managerProofPhotoExpiresAt" TIMESTAMP(3);

-- Normalize legacy break status
UPDATE "AttendanceSession" SET "status" = 'on_break' WHERE "status" = 'break';
