import { createHmac, randomInt } from "crypto";

import { prisma } from "@/lib/db/prisma";

export const VERIFICATION_TOKEN_PURPOSE_EMPLOYER_ACCOUNT_DEACTIVATION =
  "EMPLOYER_ACCOUNT_DEACTIVATION";

export const VERIFICATION_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const VERIFICATION_TOKEN_SUCCESS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes after successful verification
export const VERIFICATION_TOKEN_COOLDOWN_MS = 30 * 1000; // 30 seconds between code generation for the same user/purpose
export const VERIFICATION_TOKEN_MAX_FAILED_ATTEMPTS = 5;

function getVerificationSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return secret;
}

export function generateVerificationCode(): string {
  const codeNumber = randomInt(0, 1_000_000);
  return codeNumber.toString().padStart(6, "0");
}

export function hashVerificationCode(code: string): string {
  return createHmac("sha256", getVerificationSecret()).update(code, "utf8").digest("hex");
}

export function getVerificationExpiration(now = new Date()): Date {
  return new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS);
}

export async function assertEmployerOwner(userId: string): Promise<void> {
  const ownerMembership = await prisma.companyMember.findFirst({
    where: { userId, role: "owner", isActive: true },
  });

  if (!ownerMembership) {
    throw new Error("NOT_OWNER");
  }
}

export async function invalidateActiveVerificationTokens(
  userId: string,
  purpose: string
): Promise<void> {
  await prisma.verificationToken.updateMany({
    where: { userId, purpose, usedAt: null },
    data: { expiresAt: new Date() },
  });
}

export async function enforceVerificationTokenCooldown(
  userId: string,
  purpose: string,
  now = new Date()
): Promise<void> {
  const recentToken = await prisma.verificationToken.findFirst({
    where: {
      userId,
      purpose,
      createdAt: { gt: new Date(now.getTime() - VERIFICATION_TOKEN_COOLDOWN_MS) },
    },
    orderBy: { createdAt: "desc" },
  });

  if (recentToken) {
    throw new Error("TOO_MANY_REQUESTS");
  }
}

export async function createDeactivationVerificationToken(
  userId: string
): Promise<{ code: string }> {
  const now = new Date();
  await enforceVerificationTokenCooldown(userId, VERIFICATION_TOKEN_PURPOSE_EMPLOYER_ACCOUNT_DEACTIVATION, now);

  const code = generateVerificationCode();
  const tokenHash = hashVerificationCode(code);
  const expiresAt = getVerificationExpiration(now);

  await invalidateActiveVerificationTokens(userId, VERIFICATION_TOKEN_PURPOSE_EMPLOYER_ACCOUNT_DEACTIVATION);

  await prisma.verificationToken.create({
    data: {
      userId,
      purpose: VERIFICATION_TOKEN_PURPOSE_EMPLOYER_ACCOUNT_DEACTIVATION,
      tokenHash,
      expiresAt,
    },
  });

  return { code };
}

export async function incrementVerificationTokenFailedAttempt(
  userId: string,
  purpose: string,
  now = new Date()
): Promise<number> {
  const result = await prisma.verificationToken.updateMany({
    where: {
      userId,
      purpose,
      usedAt: null,
      expiresAt: { gt: now },
      failedAttempts: { lt: VERIFICATION_TOKEN_MAX_FAILED_ATTEMPTS },
    },
    data: {
      failedAttempts: { increment: 1 },
    },
  });

  return result.count;
}

export async function consumeDeactivationVerificationToken(
  userId: string,
  code: string
): Promise<boolean> {
  const tokenHash = hashVerificationCode(code);
  const now = new Date();

  const result = await prisma.verificationToken.updateMany({
    where: {
      userId,
      purpose: VERIFICATION_TOKEN_PURPOSE_EMPLOYER_ACCOUNT_DEACTIVATION,
      tokenHash,
      usedAt: null,
      expiresAt: { gt: now },
      failedAttempts: { lt: VERIFICATION_TOKEN_MAX_FAILED_ATTEMPTS },
    },
    data: {
      usedAt: now,
    },
  });

  if (result.count === 1) {
    return true;
  }

  await incrementVerificationTokenFailedAttempt(
    userId,
    VERIFICATION_TOKEN_PURPOSE_EMPLOYER_ACCOUNT_DEACTIVATION,
    now
  );

  return false;
}

export async function hasRecentDeactivationVerification(userId: string): Promise<boolean> {
  const threshold = new Date(Date.now() - VERIFICATION_TOKEN_SUCCESS_WINDOW_MS);
  const token = await prisma.verificationToken.findFirst({
    where: {
      userId,
      purpose: VERIFICATION_TOKEN_PURPOSE_EMPLOYER_ACCOUNT_DEACTIVATION,
      usedAt: { gte: threshold },
    },
    orderBy: { usedAt: "desc" },
    select: { id: true },
  });
  return token !== null;
}

export { deliverDeactivationVerificationCode } from "./verification-delivery";
