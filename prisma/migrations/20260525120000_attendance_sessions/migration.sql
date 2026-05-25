-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "startedAt" TIMESTAMP(3),
    "breakStartedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "checkInPhotoUrl" TEXT,
    "checkInPhotoExpiresAt" TIMESTAMP(3),
    "checkOutPhotoUrl" TEXT,
    "checkOutPhotoExpiresAt" TIMESTAMP(3),
    "locationText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceSession_companyId_sessionDate_idx" ON "AttendanceSession"("companyId", "sessionDate");

-- CreateIndex
CREATE INDEX "AttendanceSession_companyId_status_idx" ON "AttendanceSession"("companyId", "status");

-- CreateIndex
CREATE INDEX "AttendanceSession_userId_idx" ON "AttendanceSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSession_companyId_userId_sessionDate_key" ON "AttendanceSession"("companyId", "userId", "sessionDate");

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
