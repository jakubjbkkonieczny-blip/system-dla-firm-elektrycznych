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
import { recoverEmployerAccount } from "../recovery-service";
import { testSyncWorkerOrphanState } from "./test-worker-sync";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";

const PASSWORD = "Password123!";

async function createTestUser(accountRole: string, emailPrefix: string, password = PASSWORD) {
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.create({
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
}

async function createTestCompany(namePrefix: string) {
  return prisma.company.create({
    data: {
      id: randomUUID(),
      name: `${namePrefix}-${randomUUID()}`,
      isActive: true,
    },
  });
}

async function createOwnerMembership(userId: string, companyId: string) {
  return prisma.companyMember.create({
    data: { companyId, userId, role: "owner", isActive: true },
  });
}

async function createMembership(userId: string, companyId: string, role: string) {
  return prisma.companyMember.create({
    data: { companyId, userId, role, isActive: true },
  });
}

async function confirmDeactivation(userId: string) {
  const { code } = await createDeactivationVerificationToken(userId);
  const ok = await consumeDeactivationVerificationToken(userId, code);
  assert.equal(ok, true);
}

async function deactivateOwner(ownerId: string, companyId?: string) {
  await confirmDeactivation(ownerId);
  return deactivateEmployerAccount({
    actorUserId: ownerId,
    currentPassword: PASSWORD,
    companyId,
    syncWorkerOrphanStateFn: testSyncWorkerOrphanState,
  });
}

describe("employer account recovery service", () => {
  it("recovers a valid deactivated employer owner in the recovery window", async () => {
    const owner = await createTestUser("employer", "recover-owner");
    const company = await createTestCompany("recover-company");
    await createOwnerMembership(owner.id, company.id);
    await deactivateOwner(owner.id);

    const beforeSession = (
      await prisma.user.findUnique({ where: { id: owner.id }, select: { sessionVersion: true } })
    )!.sessionVersion;

    const outcome = await recoverEmployerAccount(owner.id);

    assert.equal(outcome.status, "recovered");
    assert.equal(outcome.companyId, company.id);

    const [user, refreshedCompany, ownerMembership, workerMemberships, auditLogs] =
      await Promise.all([
        prisma.user.findUnique({ where: { id: owner.id } }),
        prisma.company.findUnique({ where: { id: company.id } }),
        prisma.companyMember.findFirst({
          where: { userId: owner.id, companyId: company.id, role: "owner" },
        }),
        prisma.companyMember.findMany({
          where: { companyId: company.id, role: { not: "owner" } },
        }),
        prisma.auditLog.findMany({
          where: { companyId: company.id, action: "employer_account_recovered" },
        }),
      ]);

    assert(user);
    assert(refreshedCompany);
    assert(ownerMembership);
    assert.equal(user.isActive, true);
    assert.equal(user.deactivatedAt, null);
    assert.equal(user.scheduledDeletionAt, null);
    assert.equal(user.sessionVersion, beforeSession + 1);
    assert.equal(refreshedCompany.isActive, true);
    assert.equal(refreshedCompany.deactivatedAt, null);
    assert.equal(refreshedCompany.scheduledDeletionAt, null);
    assert.equal(ownerMembership.isActive, true);
    assert.equal(workerMemberships.every((member) => member.isActive === false), true);
    assert.equal(auditLogs.length, 1);
    const auditData = auditLogs[0]?.data as {
      previousState?: { companyActive?: boolean };
      newState?: { userActive?: boolean };
    };
    assert.equal(auditData?.previousState?.companyActive, false);
    assert.equal(auditData?.newState?.userActive, true);
  });

  it("rejects workers", async () => {
    const worker = await createTestUser("worker", "recover-worker");
    await assert.rejects(recoverEmployerAccount(worker.id), /FORBIDDEN/);
  });

  it("rejects admins who are not owners", async () => {
    const admin = await createTestUser("employer", "recover-admin");
    const company = await createTestCompany("recover-admin-company");
    await createMembership(admin.id, company.id, "admin");

    await prisma.user.update({
      where: { id: admin.id },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
      },
    });

    await assert.rejects(recoverEmployerAccount(admin.id), /NOT_DEACTIVATED/);
  });

  it("rejects staff employers who are not owners", async () => {
    const staff = await createTestUser("employer", "recover-staff");
    const company = await createTestCompany("recover-staff-company");
    await createMembership(staff.id, company.id, "staff");

    await prisma.user.update({
      where: { id: staff.id },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
      },
    });

    await assert.rejects(recoverEmployerAccount(staff.id), /NOT_DEACTIVATED/);
  });

  it("rejects recovery after the scheduled deletion deadline", async () => {
    const owner = await createTestUser("employer", "recover-expired");
    const company = await createTestCompany("recover-expired-company");
    await createOwnerMembership(owner.id, company.id);
    await deactivateOwner(owner.id);

    const deadline = getRecoveryDeadline(new Date("2024-01-01T00:00:00.000Z"), 12);
    await prisma.company.update({
      where: { id: company.id },
      data: { scheduledDeletionAt: deadline },
    });

    const originalNow = Date.now;
    Date.now = () => deadline.getTime() + 1;

    try {
      await assert.rejects(recoverEmployerAccount(owner.id), /RECOVERY_WINDOW_EXPIRED/);
    } finally {
      Date.now = originalNow;
    }

    const refreshed = await prisma.user.findUnique({ where: { id: owner.id } });
    assert.equal(refreshed?.isActive, false);
  });

  it("returns already_recovered without duplicate audit log or sessionVersion bump", async () => {
    const owner = await createTestUser("employer", "recover-repeat");
    const company = await createTestCompany("recover-repeat-company");
    await createOwnerMembership(owner.id, company.id);
    await deactivateOwner(owner.id);

    const first = await recoverEmployerAccount(owner.id);
    const sessionAfterFirst = (
      await prisma.user.findUnique({ where: { id: owner.id }, select: { sessionVersion: true } })
    )!.sessionVersion;
    const auditAfterFirst = await prisma.auditLog.count({
      where: { companyId: company.id, action: "employer_account_recovered" },
    });

    const second = await recoverEmployerAccount(owner.id);

    assert.equal(first.status, "recovered");
    assert.equal(second.status, "already_recovered");

    const sessionAfterSecond = (
      await prisma.user.findUnique({ where: { id: owner.id }, select: { sessionVersion: true } })
    )!.sessionVersion;
    const auditAfterSecond = await prisma.auditLog.count({
      where: { companyId: company.id, action: "employer_account_recovered" },
    });

    assert.equal(sessionAfterSecond, sessionAfterFirst);
    assert.equal(auditAfterSecond, auditAfterFirst);
  });

  it("handles concurrent recovery safely with a single audit log", async () => {
    const owner = await createTestUser("employer", "recover-concurrent");
    const company = await createTestCompany("recover-concurrent-company");
    await createOwnerMembership(owner.id, company.id);
    await deactivateOwner(owner.id);

    const [first, second] = await Promise.all([
      recoverEmployerAccount(owner.id),
      recoverEmployerAccount(owner.id),
    ]);

    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, ["already_recovered", "recovered"]);

    const auditCount = await prisma.auditLog.count({
      where: { companyId: company.id, action: "employer_account_recovered" },
    });
    assert.equal(auditCount, 1);
  });

  it("does not automatically reactivate worker memberships", async () => {
    const owner = await createTestUser("employer", "recover-workers-stay-inactive");
    const company = await createTestCompany("recover-workers-company");
    const worker = await createTestUser("worker", "recover-worker-member");
    await createOwnerMembership(owner.id, company.id);
    await createMembership(worker.id, company.id, "staff");
    await deactivateOwner(owner.id);

    await recoverEmployerAccount(owner.id);

    const memberships = await prisma.companyMember.findMany({
      where: { companyId: company.id },
      orderBy: { role: "asc" },
    });

    const ownerMembership = memberships.find((member) => member.role === "owner");
    const workerMembership = memberships.find((member) => member.userId === worker.id);

    assert(ownerMembership);
    assert(workerMembership);
    assert.equal(ownerMembership.isActive, true);
    assert.equal(workerMembership.isActive, false);

    const refreshedWorker = await prisma.user.findUnique({ where: { id: worker.id } });
    assert.equal(refreshedWorker?.isActive, true);
    assert.equal(refreshedWorker?.pendingDeletionAt, null);
  });

  it("rejects inactive employer without employer deactivation state", async () => {
    const owner = await createTestUser("employer", "recover-plain-disabled");
    await prisma.user.update({
      where: { id: owner.id },
      data: { isActive: false },
    });

    await assert.rejects(recoverEmployerAccount(owner.id), /NOT_DEACTIVATED/);
  });

  it("does not allow recovering another user's account", async () => {
    const ownerA = await createTestUser("employer", "recover-owner-a");
    const ownerB = await createTestUser("employer", "recover-owner-b");
    const companyA = await createTestCompany("recover-company-a");
    const companyB = await createTestCompany("recover-company-b");
    await createOwnerMembership(ownerA.id, companyA.id);
    await createOwnerMembership(ownerB.id, companyB.id);
    await deactivateOwner(ownerA.id);

    await assert.rejects(recoverEmployerAccount(ownerB.id), /NOT_DEACTIVATED/);

    const ownerAState = await prisma.user.findUnique({ where: { id: ownerA.id } });
    assert.equal(ownerAState?.isActive, false);
  });

  it("rejects multiple deactivated owned companies", async () => {
    const owner = await createTestUser("employer", "recover-multi-owner");
    const companyA = await createTestCompany("recover-multi-a");
    const companyB = await createTestCompany("recover-multi-b");
    await createOwnerMembership(owner.id, companyA.id);
    await createOwnerMembership(owner.id, companyB.id);

    const deactivatedAt = new Date("2025-06-15T00:00:00.000Z");
    const scheduledDeletionAt = getRecoveryDeadline(deactivatedAt, 12);

    await prisma.user.update({
      where: { id: owner.id },
      data: { isActive: false, deactivatedAt, scheduledDeletionAt },
    });
    await prisma.company.updateMany({
      where: { id: { in: [companyA.id, companyB.id] } },
      data: { isActive: false, deactivatedAt, scheduledDeletionAt },
    });
    await prisma.companyMember.updateMany({
      where: { userId: owner.id },
      data: { isActive: false },
    });

    await assert.rejects(recoverEmployerAccount(owner.id), /MULTIPLE_OWNED_COMPANIES/);
  });

  it("rejects unknown users", async () => {
    await assert.rejects(recoverEmployerAccount(randomUUID()), /USER_NOT_FOUND/);
  });

  it("does not call Stripe or resume subscriptions", async () => {
    const source = await readFile("lib/server/deactivation/recovery-service.ts", "utf8");
    assert.equal(/stripe/i.test(source), false);
    assert.equal(source.includes("syncSubscription"), false);
    assert.equal(source.includes("resume"), false);
  });
});

describe("billing after employer account recovery", () => {
  it("still treats inactive subscription as blocking access after recovery", async () => {
    const owner = await createTestUser("employer", "recover-billing");
    const company = await createTestCompany("recover-billing-company");
    await createOwnerMembership(owner.id, company.id);

    await prisma.user.update({
      where: { id: owner.id },
      data: {
        subscriptionStatus: "inactive",
        subscriptionEndsAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });

    await deactivateOwner(owner.id);
    await recoverEmployerAccount(owner.id);

    const user = await prisma.user.findUnique({
      where: { id: owner.id },
      select: {
        isActive: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        subscriptionCancelAtPeriodEnd: true,
      },
    });

    assert(user);
    assert.equal(user.isActive, true);
    assert.equal(user.subscriptionStatus, "inactive");
    assert(user.subscriptionEndsAt);
    assert(user.subscriptionEndsAt.getTime() < Date.now());
  });
});

describe("recovery route contract", () => {
  it("requires deactivated access and clears cookie on success", async () => {
    const routeSource = await readFile("app/api/deactivation/recover/route.ts", "utf8");
    assert.match(routeSource, /getDeactivatedAccessUserId/);
    assert.match(routeSource, /clearDeactivatedAccessCookie/);
    assert.match(routeSource, /requiresLogin:\s*true/);
    assert.doesNotMatch(routeSource, /setSessionCookie/);
    assert.doesNotMatch(routeSource, /createSignedSessionToken/);
  });
});
