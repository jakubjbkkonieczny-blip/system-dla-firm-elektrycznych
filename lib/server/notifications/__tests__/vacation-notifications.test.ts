import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import webpush from "web-push";

import { prisma } from "@/lib/db/prisma";
import {
  notifyVacationApproved,
  notifyVacationRejected,
  notifyVacationRequestCreated,
  VACATION_NOTIFICATION_TYPES,
  vacationsDeepLink,
} from "@/lib/server/notifications/vacation-notifications";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";
process.env.VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ??
  "BFtfJxKSvWlKeqjIzS1ixF_jM_wF_U3VphmClpmAIEIwUP1ZXwZ4EqdWHwWb4vBKQNJMnvfslShiyiHAfkZmj7U";
process.env.VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ?? "qWsqAamZnxHKfwYhc0uEiaQsBWDzOaljf9OnOo7ASa4";
process.env.VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:test@example.com";

const PASSWORD = "Password123!";

async function createTestUser(emailPrefix: string, isActive = true) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      email: `${emailPrefix}-${id}@example.com`,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      displayName: `Test ${emailPrefix}`,
      accountRole: "worker",
      sessionVersion: 0,
      isActive,
    },
  });
}

async function createTestCompany(name: string) {
  return prisma.company.create({
    data: {
      id: randomUUID(),
      name,
      isActive: true,
    },
  });
}

async function createMembership(
  userId: string,
  companyId: string,
  role = "staff",
  isActive = true
) {
  return prisma.companyMember.create({
    data: { companyId, userId, role, scope: "assigned_only", isActive },
  });
}

async function cleanupVacationNotificationTest(ids: {
  userIds?: string[];
  companyIds?: string[];
}) {
  if (ids.companyIds?.length) {
    await prisma.vacationRequest.deleteMany({ where: { companyId: { in: ids.companyIds } } });
    await prisma.notification.deleteMany({
      where: { companyId: { in: ids.companyIds } },
    });
    await prisma.companyMember.deleteMany({ where: { companyId: { in: ids.companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: ids.companyIds } } });
  }
  if (ids.userIds?.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: ids.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }
}

describe("vacation request notifications", () => {
  it("new request notifies owner and admin", async () => {
    const owner = await createTestUser("vac-req-owner");
    const admin = await createTestUser("vac-req-admin");
    const worker = await createTestUser("vac-req-worker");
    const company = await createTestCompany("Firma Urlopy");
    await createMembership(owner.id, company.id, "owner");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);

    await notifyVacationRequestCreated({
      companyId: company.id,
      companyName: company.name,
      requesterUserId: worker.id,
    });

    const ownerRows = await prisma.notification.findMany({ where: { userId: owner.id } });
    const adminRows = await prisma.notification.findMany({ where: { userId: admin.id } });
    assert.equal(ownerRows.length, 1);
    assert.equal(adminRows.length, 1);
    assert.equal(ownerRows[0].type, VACATION_NOTIFICATION_TYPES.REQUEST_CREATED);
    assert.equal(ownerRows[0].companyId, company.id);
    assert.equal(ownerRows[0].companyNameSnapshot, "Firma Urlopy");
    assert.match(ownerRows[0].body, /Pracownik złożył/);
    assert.doesNotMatch(ownerRows[0].body, /SICK|chorob/i);
    assert.equal(ownerRows[0].url, vacationsDeepLink());

    await cleanupVacationNotificationTest({
      userIds: [owner.id, admin.id, worker.id],
      companyIds: [company.id],
    });
  });

  it("requester who is owner does not receive self-management notification", async () => {
    const owner = await createTestUser("vac-req-self-owner");
    const company = await createTestCompany("Firma Self Request");
    await createMembership(owner.id, company.id, "owner");

    await notifyVacationRequestCreated({
      companyId: company.id,
      companyName: company.name,
      requesterUserId: owner.id,
    });

    const count = await prisma.notification.count({ where: { userId: owner.id } });
    assert.equal(count, 0);

    await cleanupVacationNotificationTest({
      userIds: [owner.id],
      companyIds: [company.id],
    });
  });

  it("inactive management membership is skipped", async () => {
    const admin = await createTestUser("vac-req-inactive-admin");
    const worker = await createTestUser("vac-req-inactive-worker");
    const company = await createTestCompany("Firma Inactive Mgmt");
    await createMembership(admin.id, company.id, "admin", false);
    await createMembership(worker.id, company.id);

    await notifyVacationRequestCreated({
      companyId: company.id,
      companyName: company.name,
      requesterUserId: worker.id,
    });

    const count = await prisma.notification.count({ where: { userId: admin.id } });
    assert.equal(count, 0);

    await cleanupVacationNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
    });
  });

  it("worker in company A does not notify management in company B", async () => {
    const adminB = await createTestUser("vac-req-b-admin");
    const workerA = await createTestUser("vac-req-a-worker");
    const companyA = await createTestCompany("Firma A Vac");
    const companyB = await createTestCompany("Firma B Vac");
    await createMembership(workerA.id, companyA.id);
    await createMembership(adminB.id, companyB.id, "admin");

    await notifyVacationRequestCreated({
      companyId: companyA.id,
      companyName: companyA.name,
      requesterUserId: workerA.id,
    });

    const count = await prisma.notification.count({ where: { userId: adminB.id } });
    assert.equal(count, 0);

    await cleanupVacationNotificationTest({
      userIds: [adminB.id, workerA.id],
      companyIds: [companyA.id, companyB.id],
    });
  });
});

describe("vacation decision notifications", () => {
  it("approve notifies requester", async () => {
    const admin = await createTestUser("vac-approve-admin");
    const worker = await createTestUser("vac-approve-worker");
    const company = await createTestCompany("Firma Approve Vac");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);

    await notifyVacationApproved({
      companyId: company.id,
      companyName: company.name,
      requesterUserId: worker.id,
      actorUserId: admin.id,
    });

    const rows = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, VACATION_NOTIFICATION_TYPES.APPROVED);
    assert.match(rows[0].body, /zaakceptowany/i);

    await cleanupVacationNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
    });
  });

  it("reject notifies requester without sensitive reason", async () => {
    const admin = await createTestUser("vac-reject-admin");
    const worker = await createTestUser("vac-reject-worker");
    const company = await createTestCompany("Firma Reject Vac");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);

    await notifyVacationRejected({
      companyId: company.id,
      companyName: company.name,
      requesterUserId: worker.id,
      actorUserId: admin.id,
    });

    const rows = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, VACATION_NOTIFICATION_TYPES.REJECTED);
    assert.match(rows[0].body, /Otwórz VectorWork/);
    assert.doesNotMatch(rows[0].body, /tajny powód/i);
    assert.doesNotMatch(rows[0].title, /tajny powód/i);

    await cleanupVacationNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
    });
  });

  it("decision actor who is requester does not self-notify", async () => {
    const owner = await createTestUser("vac-decision-self");
    const company = await createTestCompany("Firma Decision Self");
    await createMembership(owner.id, company.id, "owner");

    await notifyVacationApproved({
      companyId: company.id,
      companyName: company.name,
      requesterUserId: owner.id,
      actorUserId: owner.id,
    });

    const count = await prisma.notification.count({ where: { userId: owner.id } });
    assert.equal(count, 0);

    await cleanupVacationNotificationTest({
      userIds: [owner.id],
      companyIds: [company.id],
    });
  });
});

describe("vacation notification safety", () => {
  it("notification DB failure does not throw from notifyVacationRequestCreated", async () => {
    const admin = await createTestUser("vac-safe-db-admin");
    const worker = await createTestUser("vac-safe-db-worker");
    const company = await createTestCompany("Firma Vac Safe DB");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);

    const originalCreate = prisma.notification.create.bind(prisma.notification);
    prisma.notification.create = (async () => {
      throw new Error("DB_FAIL");
    }) as unknown as typeof prisma.notification.create;

    await assert.doesNotReject(async () => {
      await notifyVacationRequestCreated({
        companyId: company.id,
        companyName: company.name,
        requesterUserId: worker.id,
      });
    });

    prisma.notification.create = originalCreate;

    await cleanupVacationNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
    });
  });

  it("push failure does not throw from notifyVacationApproved", async () => {
    const admin = await createTestUser("vac-safe-push-admin");
    const worker = await createTestUser("vac-safe-push-worker");
    const company = await createTestCompany("Firma Vac Safe Push");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);

    const originalSend = webpush.sendNotification;
    webpush.sendNotification = (async () => {
      throw new Error("PUSH_FAIL");
    }) as unknown as typeof webpush.sendNotification;

    await assert.doesNotReject(async () => {
      await notifyVacationApproved({
        companyId: company.id,
        companyName: company.name,
        requesterUserId: worker.id,
        actorUserId: admin.id,
      });
    });

    const row = await prisma.notification.findFirst({ where: { userId: worker.id } });
    assert.ok(row);

    webpush.sendNotification = originalSend;

    await cleanupVacationNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
    });
  });
});

describe("vacation notification static guards", () => {
  it("vacation-notifications resolves recipients with scoped batch queries only", async () => {
    const source = await readFile("lib/server/notifications/vacation-notifications.ts", "utf8");
    assert.doesNotMatch(source, /user\.findMany\(\s*\{\s*\}\)/);
    assert.match(source, /id:\s*\{\s*in:/);
  });

  it("vacation routes use vacation-notifications side effects, not notification-service directly", async () => {
    const meRoute = await readFile("app/api/companies/[companyId]/vacations/me/route.ts", "utf8");
    const idRoute = await readFile(
      "app/api/companies/[companyId]/vacations/[id]/route.ts",
      "utf8"
    );
    assert.match(meRoute, /vacation-notifications/);
    assert.match(idRoute, /vacation-notifications/);
    assert.doesNotMatch(meRoute, /notification-service/);
    assert.doesNotMatch(idRoute, /notification-service/);
  });
});
