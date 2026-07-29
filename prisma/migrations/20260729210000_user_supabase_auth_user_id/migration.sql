-- Phase 1 (additive only): map future Supabase Auth UUID → VectorWork User.
-- User.id (cuid) remains the business primary key. Column is nullable until Auth cutover.
-- Legacy auth (passwordHash, sessionVersion, HMAC sessions) is unchanged.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "supabaseAuthUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseAuthUserId_key" ON "User"("supabaseAuthUserId");
