-- CreateIndex
CREATE INDEX "AttendanceSession_companyId_userId_sessionDate_idx" ON "AttendanceSession"("companyId", "userId", "sessionDate");
