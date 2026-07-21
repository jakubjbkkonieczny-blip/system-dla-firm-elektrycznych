import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import {
  VERIFICATION_TOKEN_PURPOSE_EMPLOYER_ACCOUNT_DEACTIVATION,
  VERIFICATION_TOKEN_MAX_FAILED_ATTEMPTS,
  VERIFICATION_TOKEN_SUCCESS_WINDOW_MS,
  createDeactivationVerificationToken,
  consumeDeactivationVerificationToken,
  hashVerificationCode,
  hasRecentDeactivationVerification,
  assertEmployerOwner,
} from "../email-verification";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";

async function createTestUser(accountRole: string, emailPrefix: string) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      email: `${emailPrefix}-${id}@example.com`,
      passwordHash: "testhash",
      displayName: "Test User",
      accountRole,
      sessionVersion: 0,
    },
  });
}

async function createTestCompany() {
  return prisma.company.create({
    data: {
      id: randomUUID(),
      name: `Company-${randomUUID()}`,
      isActive: true,
    },
  });
}

describe("deactivation email verification flow", () => {
  it("preserves plaintext out of the database", async () => {
    const user = await createTestUser("employer", "plaintext");
    const { code } = await createDeactivationVerificationToken(user.id);

    const record = await prisma.verificationToken.findFirst({ where: { userId: user.id } });
    assert(record);
    assert.equal(record.tokenHash, hashVerificationCode(code));
    assert.notEqual(record.tokenHash, code);
    assert.equal(record.failedAttempts, 0);
  });

  it("enforces a cooldown between code generations for the same user and purpose", async () => {
    const user = await createTestUser("employer", "cooldown");
    await createDeactivationVerificationToken(user.id);

    let error: Error | null = null;
    try {
      await createDeactivationVerificationToken(user.id);
    } catch (e) {
      error = e instanceof Error ? e : new Error("unknown");
    }

    assert(error);
    assert.equal(error?.message, "TOO_MANY_REQUESTS");
  });

  it("invalidates the previous active token when a new one is created after cooldown", async () => {
    const user = await createTestUser("employer", "newtoken");
    const first = await createDeactivationVerificationToken(user.id);
    await prisma.verificationToken.updateMany({
      where: { userId: user.id, tokenHash: hashVerificationCode(first.code) },
      data: { createdAt: new Date(Date.now() - 60 * 1000) },
    });

    const second = await createDeactivationVerificationToken(user.id);

    const activeTokens = await prisma.verificationToken.findMany({
      where: {
        userId: user.id,
        purpose: VERIFICATION_TOKEN_PURPOSE_EMPLOYER_ACCOUNT_DEACTIVATION,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    assert.equal(activeTokens.length, 1);
    assert.equal(activeTokens[0].tokenHash, hashVerificationCode(second.code));
  });

  it("blocks invalid tokens after max failed attempts", async () => {
    const user = await createTestUser("employer", "failedattempts");
    const { code } = await createDeactivationVerificationToken(user.id);
    const wrongCode = code === "000000" ? "000001" : "000000";

    for (let i = 0; i < VERIFICATION_TOKEN_MAX_FAILED_ATTEMPTS; i++) {
      const ok = await consumeDeactivationVerificationToken(user.id, wrongCode);
      assert.equal(ok, false);
    }

    const blocked = await consumeDeactivationVerificationToken(user.id, code);
    assert.equal(blocked, false);

    const record = await prisma.verificationToken.findFirst({ where: { userId: user.id } });
    assert(record);
    assert(record.failedAttempts >= VERIFICATION_TOKEN_MAX_FAILED_ATTEMPTS);
  });

  it("allows only one successful concurrent consumption", async () => {
    const user = await createTestUser("employer", "concurrent");
    const { code } = await createDeactivationVerificationToken(user.id);

    const [first, second] = await Promise.all([
      consumeDeactivationVerificationToken(user.id, code),
      consumeDeactivationVerificationToken(user.id, code),
    ]);

    assert.equal(first || second, true);
    assert.equal(first && second, false);
  });

  it("does not treat expired token as valid confirmation state", async () => {
    const user = await createTestUser("employer", "expiredstate");
    const { code } = await createDeactivationVerificationToken(user.id);
    await prisma.verificationToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const ok = await consumeDeactivationVerificationToken(user.id, code);
    assert.equal(ok, false);
    const recent = await hasRecentDeactivationVerification(user.id);
    assert.equal(recent, false);
  });

  it("returns a recent confirmation state after successful token consumption", async () => {
    const user = await createTestUser("employer", "confirmationstate");
    const { code } = await createDeactivationVerificationToken(user.id);
    const ok = await consumeDeactivationVerificationToken(user.id, code);
    assert.equal(ok, true);

    const recent = await hasRecentDeactivationVerification(user.id);
    assert.equal(recent, true);
  });

  it("does not report confirmation state after the success window expires", async () => {
    const user = await createTestUser("employer", "confirmationexpired");
    const { code } = await createDeactivationVerificationToken(user.id);
    const ok = await consumeDeactivationVerificationToken(user.id, code);
    assert.equal(ok, true);

    await prisma.verificationToken.updateMany({
      where: { userId: user.id },
      data: { usedAt: new Date(Date.now() - (VERIFICATION_TOKEN_SUCCESS_WINDOW_MS + 1000)) },
    });

    const recent = await hasRecentDeactivationVerification(user.id);
    assert.equal(recent, false);
  });

  it("does not allow a different user to consume another user's token", async () => {
    const owner = await createTestUser("employer", "owner");
    const other = await createTestUser("employer", "other");
    const { code } = await createDeactivationVerificationToken(owner.id);

    const ok = await consumeDeactivationVerificationToken(other.id, code);
    assert.equal(ok, false);
  });

  it("does not allow wrong purpose token to be consumed by deactivation flow", async () => {
    const user = await createTestUser("employer", "wrongpurpose");
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        purpose: "OTHER_PURPOSE",
        tokenHash: hashVerificationCode("123456"),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    const ok = await consumeDeactivationVerificationToken(user.id, "123456");
    assert.equal(ok, false);
  });

  it("keeps user and company active flags unchanged during verification", async () => {
    const company = await createTestCompany();
    const user = await createTestUser("employer", "stateuser");
    await prisma.companyMember.create({
      data: {
        companyId: company.id,
        userId: user.id,
        role: "owner",
        isActive: true,
      },
    });

    const { code } = await createDeactivationVerificationToken(user.id);
    const ok = await consumeDeactivationVerificationToken(user.id, code);
    assert.equal(ok, true);

    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    const freshCompany = await prisma.company.findUnique({ where: { id: company.id } });

    assert(freshUser);
    assert(freshCompany);
    assert.equal(freshUser.isActive, true);
    assert.equal(freshCompany.isActive, true);
  });

  it("rejects non-owner company members in assertEmployerOwner", async () => {
    const company = await createTestCompany();
    const owner = await createTestUser("employer", "authowner");
    const admin = await createTestUser("employer", "authadmin");
    const staff = await createTestUser("employer", "authstaff");
    const worker = await createTestUser("worker", "authworker");

    await prisma.companyMember.create({
      data: {
        companyId: company.id,
        userId: owner.id,
        role: "owner",
        isActive: true,
      },
    });
    await prisma.companyMember.create({
      data: {
        companyId: company.id,
        userId: admin.id,
        role: "admin",
        isActive: true,
      },
    });
    await prisma.companyMember.create({
      data: {
        companyId: company.id,
        userId: staff.id,
        role: "staff",
        isActive: true,
      },
    });

    await assertEmployerOwner(owner.id);

    for (const nonOwnerId of [admin.id, staff.id, worker.id]) {
      let thrown = false;
      try {
        await assertEmployerOwner(nonOwnerId);
      } catch (e) {
        thrown = true;
        assert.equal((e as Error).message, "NOT_OWNER");
      }
      assert.equal(thrown, true);
    }
  });
});
