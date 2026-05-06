-- Align User and Company with schema.prisma (password auth, billing/integrations,
-- Company fields missing vs 20260416201503_init). Additive only; no data deletion.

-- User
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL;

ALTER TABLE "User" ADD COLUMN "accountRole" TEXT;

ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;

ALTER TABLE "User" ADD COLUMN "stripeSubscriptionId" TEXT;

ALTER TABLE "User" ADD COLUMN "subscriptionEndsAt" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN "subscriptionCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" ADD COLUMN "googleAccessToken" TEXT;

ALTER TABLE "User" ADD COLUMN "googleRefreshToken" TEXT;

ALTER TABLE "User" ADD COLUMN "pushSubscription" JSONB;

CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- Company
ALTER TABLE "Company" ADD COLUMN "apiKeyHash" TEXT;

ALTER TABLE "Company" ADD COLUMN "scheduledDeletionAt" TIMESTAMP(3);
