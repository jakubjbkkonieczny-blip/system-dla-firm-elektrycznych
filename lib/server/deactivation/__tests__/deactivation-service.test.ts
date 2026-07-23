import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

import { prisma } from "@/lib/db/prisma";
import { getRecoveryDeadline } from "../lifecycle";
import { deactivateEmployerAccount } from "../deactivation-service";
import {
  VERIFICATION_TOKEN_SUCCESS_WINDOW_MS,
  createDeactivationVerificationToken,
  consumeDeactivationVerificationToken,
} from "../email-verification";
import { testSyncWorkerOrphanState } from "./test-worker-sync";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";

const PASSWORD = "Password123!";

async function createTestUser(accountRole: string, emailPrefix: string, password = PASSWORD) {
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      id,
      email: `${emailPrefix}-${id}@example.com`,
      passwordHash,
      displayName: `Test ${emailPrefix}`,
      accountRole,
      sessionVersion: 0,
      isActive: true,
    },
  });
  return user;
}

async function createTestCompany(namePrefix: string) {
  const company = await prisma.company.create({
    data: {
      id: randomUUID(),
      name: `${namePrefix}-${randomUUID()}`,
      isActive: true,
    },
  });
  return company;
}

async function createOwnerMembership(userId: string, companyId: string) {
  return prisma.companyMember.create({
    data: {
      companyId,
      userId,
      role: "owner",
      isActive: true,
    },
  });
}

async function createMembership(userId: string, companyId: string, role: string) {
  return prisma.companyMember.create({
    data: {
      companyId,
      userId,
      role,
      isActive: true,
    },
  });
}

async function confirmDeactivation(userId: string) {
  const { code } = await createDeactivationVerificationToken(userId);
  const ok = await consumeDeactivationVerificationToken(userId, code);
  assert.equal(ok, true);
}

function deactivate(input: {
  actorUserId: string;
  currentPassword?: string;
  companyId?: string;
}) {
  return deactivateEmployerAccount({
    actorUserId: input.actorUserId,
    currentPassword: input.currentPassword ?? PASSWORD,
    companyId: input.companyId,
    syncWorkerOrphanStateFn: testSyncWorkerOrphanState,
  });
}

describe("deactivation service", () => {
  it("allows employer owner to deactivate company and members with valid password and verification", async () => {
    const owner = await createTestUser("employer", "owner-deactivate");
    const company = await createTestCompany("company-deactivate");
    await createOwnerMembership(owner.id, company.id);

    const admin = await createTestUser("employer", "admin-deactivate");
    const staff = await createTestUser("employer", "staff-deactivate");
    const worker = await createTestUser("worker", "worker-deactivate");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(staff.id, company.id, "staff");
    await createMembership(worker.id, company.id, "staff");

    await confirmDeactivation(owner.id);

    const deactivatedAt = new Date();
    const result = await deactivate({ actorUserId: owner.id });

    assert.equal(result.status, "deactivated");
    assert.equal(result.companyId, company.id);

    const refreshedCompany = await prisma.company.findUnique({ where: { id: company.id } });
    const refreshedOwner = await prisma.user.findUnique({ where: { id: owner.id } });
    const auditLogs = await prisma.auditLog.findMany({
      where: { companyId: company.id, action: "employer_account_deactivated" },
    });
    const members = await prisma.companyMember.findMany({ where: { companyId: company.id } });

    assert(refreshedCompany);
    assert(refreshedOwner);
    assert.equal(refreshedCompany.isActive, false);
    assert(refreshedCompany.deactivatedAt);
    assert(refreshedCompany.scheduledDeletionAt);
    assert.equal(refreshedOwner.isActive, false);
    assert(refreshedOwner.deactivatedAt);
    assert.equal(refreshedOwner.sessionVersion, 1);
    assert.ok(members.every((member) => member.isActive === false));
    assert.equal(auditLogs.length, 1);

    const expectedDeadline = getRecoveryDeadline(deactivatedAt);
    const actualDeadline = refreshedCompany.scheduledDeletionAt!;
    assert.equal(
      actualDeadline.getFullYear() * 12 + actualDeadline.getMonth(),
      expectedDeadline.getFullYear() * 12 + expectedDeadline.getMonth()
    );
  });

  it("rejects workers", async () => {
    const worker = await createTestUser("worker", "worker-blocked");
    const company = await createTestCompany("company-worker-blocked");
    await createMembership(worker.id, company.id, "staff");

    await assert.rejects(deactivate({ actorUserId: worker.id }), /FORBIDDEN/);
  });

  it("rejects admins", async () => {
    const admin = await createTestUser("employer", "admin-blocked");
    const company = await createTestCompany("company-admin-blocked");
    await createMembership(admin.id, company.id, "admin");

    await assert.rejects(deactivate({ actorUserId: admin.id }), /NOT_OWNER/);
  });

  it("rejects staff employers who are not owners", async () => {
    const staff = await createTestUser("employer", "staff-blocked");
    const company = await createTestCompany("company-staff-blocked");
    await createMembership(staff.id, company.id, "staff");

    await assert.rejects(deactivate({ actorUserId: staff.id }), /NOT_OWNER/);
  });

  it("rejects invalid password", async () => {
    const owner = await createTestUser("employer", "owner-bad-password");
    const company = await createTestCompany("company-bad-password");
    await createOwnerMembership(owner.id, company.id);
    await confirmDeactivation(owner.id);

    await assert.rejects(
      deactivateEmployerAccount({
        actorUserId: owner.id,
        currentPassword: "WrongPassword",
        syncWorkerOrphanStateFn: testSyncWorkerOrphanState,
      }),
      /INVALID_PASSWORD/
    );
  });

  it("rejects missing recent verification", async () => {
    const owner = await createTestUser("employer", "owner-no-verification");
    const company = await createTestCompany("company-no-verification");
    await createOwnerMembership(owner.id, company.id);

    await assert.rejects(deactivate({ actorUserId: owner.id }), /EMAIL_VERIFICATION_REQUIRED/);
  });

  it("rejects expired verification confirmation state", async () => {
    const owner = await createTestUser("employer", "owner-expired-verification");
    const company = await createTestCompany("company-expired-verification");
    await createOwnerMembership(owner.id, company.id);

    const { code } = await createDeactivationVerificationToken(owner.id);
    await consumeDeactivationVerificationToken(owner.id, code);
    await prisma.verificationToken.updateMany({
      where: { userId: owner.id },
      data: {
        usedAt: new Date(Date.now() - (VERIFICATION_TOKEN_SUCCESS_WINDOW_MS + 1000)),
      },
    });

    await assert.rejects(deactivate({ actorUserId: owner.id }), /EMAIL_VERIFICATION_REQUIRED/);
  });

  it("rejects cross-tenant company selection", async () => {
    const owner = await createTestUser("employer", "owner-cross-tenant");
    const ownedCompany = await createTestCompany("company-owned");
    const foreignCompany = await createTestCompany("company-foreign");
    await createOwnerMembership(owner.id, ownedCompany.id);
    await confirmDeactivation(owner.id);

    await assert.rejects(
      deactivate({ actorUserId: owner.id, companyId: foreignCompany.id }),
      /FORBIDDEN/
    );
  });

  it("returns already_deactivated for repeat request without side effects", async () => {
    const owner = await createTestUser("employer", "owner-repeat");
    const company = await createTestCompany("company-repeat");
    await createOwnerMembership(owner.id, company.id);
    await confirmDeactivation(owner.id);

    const first = await deactivate({ actorUserId: owner.id });
    const sessionAfterFirst = (
      await prisma.user.findUnique({ where: { id: owner.id }, select: { sessionVersion: true } })
    )!.sessionVersion;
    const auditAfterFirst = await prisma.auditLog.count({
      where: { companyId: company.id, action: "employer_account_deactivated" },
    });

    const second = await deactivate({ actorUserId: owner.id });

    assert.equal(first.status, "deactivated");
    assert.equal(second.status, "already_deactivated");
    assert.equal(second.companyId, company.id);

    const sessionAfterSecond = (
      await prisma.user.findUnique({ where: { id: owner.id }, select: { sessionVersion: true } })
    )!.sessionVersion;
    const auditAfterSecond = await prisma.auditLog.count({
      where: { companyId: company.id, action: "employer_account_deactivated" },
    });

    assert.equal(sessionAfterSecond, sessionAfterFirst);
    assert.equal(auditAfterSecond, auditAfterFirst);
  });

  it("handles concurrent requests safely with a single audit log", async () => {
    const owner = await createTestUser("employer", "owner-concurrent");
    const company = await createTestCompany("company-concurrent");
    await createOwnerMembership(owner.id, company.id);
    await confirmDeactivation(owner.id);

    const [first, second] = await Promise.all([
      deactivate({ actorUserId: owner.id }),
      deactivate({ actorUserId: owner.id }),
    ]);

    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, ["already_deactivated", "deactivated"]);

    const auditCount = await prisma.auditLog.count({
      where: { companyId: company.id, action: "employer_account_deactivated" },
    });
    assert.equal(auditCount, 1);
  });

  it("keeps workers in other companies active", async () => {
    const owner = await createTestUser("employer", "owner-worker-other");
    const company = await createTestCompany("company-worker-other");
    await createOwnerMembership(owner.id, company.id);

    const worker = await createTestUser("worker", "worker-other");
    const otherCompany = await createTestCompany("company-worker-remains");
    await createMembership(worker.id, company.id, "staff");
    await createMembership(worker.id, otherCompany.id, "staff");

    await confirmDeactivation(owner.id);
    await deactivate({ actorUserId: owner.id });

    const workerMemberships = await prisma.companyMember.findMany({
      where: { userId: worker.id },
      orderBy: { companyId: "asc" },
    });
    const refreshedWorker = await prisma.user.findUnique({ where: { id: worker.id } });

    assert.equal(workerMemberships.length, 2);
    const targetMembership = workerMemberships.find((m) => m.companyId === company.id);
    const otherMembership = workerMemberships.find((m) => m.companyId === otherCompany.id);
    assert(targetMembership);
    assert(otherMembership);
    assert.equal(targetMembership.isActive, false);
    assert.equal(otherMembership.isActive, true);
    assert(refreshedWorker);
    assert.equal(refreshedWorker.isActive, true);
    assert.equal(refreshedWorker.pendingDeletionAt, null);
  });

  it("applies worker lifecycle for single-company workers after company deactivation", async () => {
    const owner = await createTestUser("employer", "owner-orphan-worker");
    const company = await createTestCompany("company-orphan-worker");
    await createOwnerMembership(owner.id, company.id);

    const worker = await createTestUser("worker", "worker-orphan");
    await createMembership(worker.id, company.id, "staff");

    await confirmDeactivation(owner.id);
    await deactivate({ actorUserId: owner.id });

    const membership = await prisma.companyMember.findFirst({
      where: { userId: worker.id, companyId: company.id },
    });
    const refreshedWorker = await prisma.user.findUnique({ where: { id: worker.id } });
    assert(membership);
    assert(refreshedWorker);
    assert.equal(membership.isActive, false);
    assert.equal(refreshedWorker.isActive, true);
    // Membership row still exists → SUSPENDED (not ORPHAN), so no orphan countdown.
    assert.equal(refreshedWorker.pendingDeletionAt, null);
  });

  it("does not delete business data such as jobs", async () => {
    const owner = await createTestUser("employer", "owner-jobs");
    const company = await createTestCompany("company-jobs");
    await createOwnerMembership(owner.id, company.id);

    const job = await prisma.job.create({
      data: {
        companyId: company.id,
        jobNumber: Math.floor(Math.random() * 1_000_000),
        customerName: "Test Customer",
        customerPhone: "123456789",
        addressCity: "City",
        addressStreet: "Street 1",
        description: "Test description",
        priority: "normal",
        status: "new",
        createdByUserId: owner.id,
      },
    });

    await confirmDeactivation(owner.id);
    await deactivate({ actorUserId: owner.id });

    const refreshedJob = await prisma.job.findUnique({ where: { id: job.id } });
    assert(refreshedJob);
    assert.equal(refreshedJob.description, "Test description");
  });

  it("legacy DELETE /me path requires full verification flow for employers", async () => {
    const owner = await createTestUser("employer", "legacy-bypass");
    const company = await createTestCompany("company-legacy-bypass");
    await createOwnerMembership(owner.id, company.id);

    await assert.rejects(deactivate({ actorUserId: owner.id }), /EMAIL_VERIFICATION_REQUIRED/);
  });

  it("deactivation service source does not call Stripe directly", async () => {
    const source = await readFile("lib/server/deactivation/deactivation-service.ts", "utf8");
    assert.equal(/stripe/i.test(source), false);
    assert.equal(source.includes("syncSubscription"), false);
  });
});

describe("legacy DELETE /api/me employer guard", () => {
  it("blocks employers from using the legacy self-delete path", async () => {
    const source = await readFile("app/api/me/route.ts", "utf8");
    assert.match(source, /resolveManualSelfDelete/);
    assert.doesNotMatch(source, /deactivateEmployerAccount/);
    assert.doesNotMatch(source, /prisma\.user\.update/);
  });

  it("blocks workers from using the legacy self-delete path", async () => {
    const source = await readFile("app/api/me/route.ts", "utf8");
    assert.match(source, /WORKER_SELF_DELETE_NOT_ALLOWED|resolveManualSelfDelete/);
    assert.doesNotMatch(source, /deactivatedAt/);
  });
});
