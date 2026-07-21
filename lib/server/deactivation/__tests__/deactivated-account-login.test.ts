import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

import { prisma } from "@/lib/db/prisma";
import { getRecoveryDeadline } from "../lifecycle";
import { resolveDeactivatedEmployerAccountState } from "../get-deactivated-account-state";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";

async function createEmployer(emailPrefix: string, password = "Password123!") {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      email: `${emailPrefix}-${id}@example.com`,
      passwordHash: await bcrypt.hash(password, 10),
      displayName: "Employer",
      accountRole: "employer",
      isActive: true,
    },
  });
}

async function createCompany(namePrefix: string) {
  return prisma.company.create({
    data: {
      id: randomUUID(),
      name: `${namePrefix}-${randomUUID()}`,
      isActive: true,
    },
  });
}

async function createOwnerMembership(userId: string, companyId: string, isActive = true) {
  return prisma.companyMember.create({
    data: { companyId, userId, role: "owner", isActive },
  });
}

describe("resolveDeactivatedEmployerAccountState", () => {
  it("returns null for active employer", async () => {
    const owner = await createEmployer("active-owner");
    const company = await createCompany("active-company");
    await createOwnerMembership(owner.id, company.id);

    const state = await resolveDeactivatedEmployerAccountState(owner.id);
    assert.equal(state, null);
  });

  it("returns deactivated state for deactivated employer owner", async () => {
    const owner = await createEmployer("deactivated-owner");
    const company = await createCompany("deactivated-company");
    await createOwnerMembership(owner.id, company.id);

    const deactivatedAt = new Date("2025-06-15T00:00:00.000Z");
    const scheduledDeletionAt = getRecoveryDeadline(deactivatedAt, 12);

    await prisma.user.update({
      where: { id: owner.id },
      data: {
        isActive: false,
        deactivatedAt,
        scheduledDeletionAt,
      },
    });
    await prisma.company.update({
      where: { id: company.id },
      data: {
        isActive: false,
        deactivatedAt,
        scheduledDeletionAt,
      },
    });
    await prisma.companyMember.updateMany({
      where: { companyId: company.id, userId: owner.id },
      data: { isActive: false },
    });

    const now = new Date("2026-01-01T00:00:00.000Z");
    const state = await resolveDeactivatedEmployerAccountState(owner.id, now);

    assert.ok(state);
    assert.equal(state.userId, owner.id);
    assert.equal(state.companyId, company.id);
    assert.equal(state.isRecoverable, true);
    assert.equal(state.recoveryExpired, false);
    assert.equal(state.recoveryDeadline, scheduledDeletionAt.toISOString());
  });

  it("marks recovery as expired after scheduledDeletionAt", async () => {
    const owner = await createEmployer("expired-owner");
    const company = await createCompany("expired-company");
    await createOwnerMembership(owner.id, company.id, false);

    const deactivatedAt = new Date("2024-01-01T00:00:00.000Z");
    const scheduledDeletionAt = getRecoveryDeadline(deactivatedAt, 12);

    await prisma.user.update({
      where: { id: owner.id },
      data: {
        isActive: false,
        deactivatedAt,
        scheduledDeletionAt,
      },
    });
    await prisma.company.update({
      where: { id: company.id },
      data: {
        isActive: false,
        deactivatedAt,
        scheduledDeletionAt,
      },
    });

    const now = new Date("2026-06-15T00:00:00.000Z");
    const state = await resolveDeactivatedEmployerAccountState(owner.id, now);

    assert.ok(state);
    assert.equal(state.isRecoverable, false);
    assert.equal(state.recoveryExpired, true);
  });

  it("returns null for inactive employer without deactivatedAt", async () => {
    const owner = await createEmployer("disabled-owner");
    await prisma.user.update({
      where: { id: owner.id },
      data: { isActive: false },
    });

    const state = await resolveDeactivatedEmployerAccountState(owner.id);
    assert.equal(state, null);
  });

  it("returns null for active employer with inactive subscription billing state", async () => {
    const owner = await createEmployer("billing-inactive-owner");
    const company = await createCompany("billing-company");
    await createOwnerMembership(owner.id, company.id);

    await prisma.user.update({
      where: { id: owner.id },
      data: {
        subscriptionStatus: "inactive",
        subscriptionEndsAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });

    const state = await resolveDeactivatedEmployerAccountState(owner.id);
    assert.equal(state, null);
  });
});

describe("deactivated employer login detection", () => {
  it("distinguishes deactivated employer from subscription-inactive active employer", async () => {
    const deactivatedOwner = await createEmployer("login-deactivated");
    const billingOwner = await createEmployer("login-billing");
    const deactivatedCompany = await createCompany("login-deactivated-company");
    const billingCompany = await createCompany("login-billing-company");
    await createOwnerMembership(deactivatedOwner.id, deactivatedCompany.id);
    await createOwnerMembership(billingOwner.id, billingCompany.id);

    const deactivatedAt = new Date("2025-06-15T00:00:00.000Z");
    const scheduledDeletionAt = getRecoveryDeadline(deactivatedAt, 12);

    await prisma.user.update({
      where: { id: deactivatedOwner.id },
      data: {
        isActive: false,
        deactivatedAt,
        scheduledDeletionAt,
      },
    });
    await prisma.company.update({
      where: { id: deactivatedCompany.id },
      data: { isActive: false, deactivatedAt, scheduledDeletionAt },
    });
    await prisma.companyMember.updateMany({
      where: { companyId: deactivatedCompany.id, userId: deactivatedOwner.id },
      data: { isActive: false },
    });

    await prisma.user.update({
      where: { id: billingOwner.id },
      data: {
        subscriptionStatus: "inactive",
        subscriptionEndsAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });

    assert.ok(await resolveDeactivatedEmployerAccountState(deactivatedOwner.id));
    assert.equal(await resolveDeactivatedEmployerAccountState(billingOwner.id), null);
  });

  it("keeps deactivated user inactive in database", async () => {
    const owner = await createEmployer("persist-inactive");
    const company = await createCompany("persist-company");
    await createOwnerMembership(owner.id, company.id);

    const deactivatedAt = new Date("2025-06-15T00:00:00.000Z");
    const scheduledDeletionAt = getRecoveryDeadline(deactivatedAt, 12);

    await prisma.user.update({
      where: { id: owner.id },
      data: { isActive: false, deactivatedAt, scheduledDeletionAt },
    });
    await prisma.company.update({
      where: { id: company.id },
      data: { isActive: false, deactivatedAt, scheduledDeletionAt },
    });

    await resolveDeactivatedEmployerAccountState(owner.id);

    const refreshedUser = await prisma.user.findUnique({ where: { id: owner.id } });
    const refreshedCompany = await prisma.company.findUnique({ where: { id: company.id } });
    assert.equal(refreshedUser?.isActive, false);
    assert.equal(refreshedCompany?.isActive, false);
  });
});
