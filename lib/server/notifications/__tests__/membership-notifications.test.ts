import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import webpush from "web-push";

import { prisma } from "@/lib/db/prisma";
import {
  createNotificationForFormerCompanyMember,
  createNotificationForUser,
} from "@/lib/server/notifications/notification-service";
import {
  membershipAddedDeepLink,
  membershipLostDeepLink,
  MEMBERSHIP_NOTIFICATION_TYPES,
  notifyMemberAdded,
  notifyMemberDeactivated,
  notifyMemberRemoved,
} from "@/lib/server/notifications/membership-notifications";
import {
  deriveWorkerMembershipState,
  resolvePendingDeletionAt,
} from "@/lib/server/workers/worker-membership-state";

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

async function cleanupMembershipNotificationTest(ids: {
  userIds?: string[];
  companyIds?: string[];
}) {
  if (ids.companyIds?.length) {
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

describe("membership added notifications", () => {
  it("added existing user receives notification", async () => {
    const admin = await createTestUser("mem-add-admin");
    const worker = await createTestUser("mem-add-worker");
    const company = await createTestCompany("Firma Dodana");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);

    await notifyMemberAdded({
      companyId: company.id,
      companyName: company.name,
      memberUserId: worker.id,
      actorUserId: admin.id,
    });

    const rows = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, MEMBERSHIP_NOTIFICATION_TYPES.ADDED);
    assert.equal(rows[0].companyId, company.id);
    assert.equal(rows[0].companyNameSnapshot, "Firma Dodana");
    assert.equal(rows[0].url, membershipAddedDeepLink());

    await cleanupMembershipNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
    });
  });

  it("actor does not receive self-notification on add", async () => {
    const admin = await createTestUser("mem-add-self");
    const company = await createTestCompany("Firma Add Self");
    await createMembership(admin.id, company.id, "admin");

    await notifyMemberAdded({
      companyId: company.id,
      companyName: company.name,
      memberUserId: admin.id,
      actorUserId: admin.id,
    });

    const count = await prisma.notification.count({ where: { userId: admin.id } });
    assert.equal(count, 0);

    await cleanupMembershipNotificationTest({
      userIds: [admin.id],
      companyIds: [company.id],
    });
  });
});

describe("membership deactivated notifications", () => {
  it("deactivated member receives notification after membership loss", async () => {
    const worker = await createTestUser("mem-deact-worker");
    const company = await createTestCompany("Firma Dezaktywowana");
    await createMembership(worker.id, company.id);

    await prisma.companyMember.update({
      where: { companyId_userId: { companyId: company.id, userId: worker.id } },
      data: { isActive: false },
    });

    await notifyMemberDeactivated({
      companyId: company.id,
      companyName: company.name,
      memberUserId: worker.id,
    });

    const rows = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, MEMBERSHIP_NOTIFICATION_TYPES.DEACTIVATED);
    assert.equal(rows[0].companyNameSnapshot, "Firma Dezaktywowana");
    assert.equal(rows[0].url, membershipLostDeepLink());
    assert.doesNotMatch(rows[0].url, new RegExp(company.id));

    await cleanupMembershipNotificationTest({
      userIds: [worker.id],
      companyIds: [company.id],
    });
  });

  it("createNotificationForUser still rejects inactive membership for normal company events", async () => {
    const worker = await createTestUser("mem-deact-blocked");
    const company = await createTestCompany("Firma Blocked Normal");
    await createMembership(worker.id, company.id, "staff", false);

    await assert.rejects(
      () =>
        createNotificationForUser({
          recipientUserId: worker.id,
          companyId: company.id,
          type: MEMBERSHIP_NOTIFICATION_TYPES.ADDED,
          title: "X",
          body: "Y",
        }),
      /NOT_ACTIVE_MEMBER/
    );

    await cleanupMembershipNotificationTest({
      userIds: [worker.id],
      companyIds: [company.id],
    });
  });
});

describe("membership removed notifications", () => {
  it("removed member receives notification with company snapshot", async () => {
    const worker = await createTestUser("mem-remove-worker");
    const company = await createTestCompany("Firma Usunięta");
    await createMembership(worker.id, company.id);

    await prisma.companyMember.delete({
      where: { companyId_userId: { companyId: company.id, userId: worker.id } },
    });

    await notifyMemberRemoved({
      companyId: company.id,
      companyName: company.name,
      memberUserId: worker.id,
    });

    const rows = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, MEMBERSHIP_NOTIFICATION_TYPES.REMOVED);
    assert.equal(rows[0].companyId, company.id);
    assert.equal(rows[0].companyNameSnapshot, "Firma Usunięta");
    assert.equal(rows[0].url, membershipLostDeepLink());

    await cleanupMembershipNotificationTest({
      userIds: [worker.id],
      companyIds: [company.id],
    });
  });

  it("worker removed from A still has active membership in B", async () => {
    const worker = await createTestUser("mem-multi-worker");
    const companyA = await createTestCompany("Firma Alpha Mem");
    const companyB = await createTestCompany("Firma Beta Mem");
    await createMembership(worker.id, companyA.id);
    await createMembership(worker.id, companyB.id);

    await prisma.companyMember.delete({
      where: { companyId_userId: { companyId: companyA.id, userId: worker.id } },
    });

    await notifyMemberRemoved({
      companyId: companyA.id,
      companyName: companyA.name,
      memberUserId: worker.id,
    });

    const membershipB = await prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId: companyB.id, userId: worker.id } },
    });
    assert.ok(membershipB?.isActive);

    const rows = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].companyId, companyA.id);
    assert.equal(rows[0].companyNameSnapshot, "Firma Alpha Mem");

    await cleanupMembershipNotificationTest({
      userIds: [worker.id],
      companyIds: [companyA.id, companyB.id],
    });
  });

  it("last-company removal still allows orphan lifecycle after notification side effect", async () => {
    const worker = await createTestUser("mem-orphan-worker");
    const company = await createTestCompany("Firma Last Mem");
    await createMembership(worker.id, company.id);

    await prisma.companyMember.delete({
      where: { companyId_userId: { companyId: company.id, userId: worker.id } },
    });

    const state = deriveWorkerMembershipState(0, 0);
    await prisma.user.update({
      where: { id: worker.id },
      data: { pendingDeletionAt: resolvePendingDeletionAt(state) },
    });

    const originalCreate = prisma.notification.create.bind(prisma.notification);
    prisma.notification.create = (async () => {
      throw new Error("DB_FAIL");
    }) as unknown as typeof prisma.notification.create;

    await assert.doesNotReject(async () => {
      await notifyMemberRemoved({
        companyId: company.id,
        companyName: company.name,
        memberUserId: worker.id,
      });
    });

    prisma.notification.create = originalCreate;

    const updated = await prisma.user.findUnique({ where: { id: worker.id } });
    assert.ok(updated?.pendingDeletionAt);

    await cleanupMembershipNotificationTest({
      userIds: [worker.id],
      companyIds: [company.id],
    });
  });
});

describe("membership notification safety", () => {
  it("notification DB failure does not throw from notifyMemberRemoved", async () => {
    const worker = await createTestUser("mem-safe-db-worker");
    const company = await createTestCompany("Firma Mem Safe DB");

    const originalCreate = prisma.notification.create.bind(prisma.notification);
    prisma.notification.create = (async () => {
      throw new Error("DB_FAIL");
    }) as unknown as typeof prisma.notification.create;

    await assert.doesNotReject(async () => {
      await notifyMemberRemoved({
        companyId: company.id,
        companyName: company.name,
        memberUserId: worker.id,
      });
    });

    prisma.notification.create = originalCreate;

    await cleanupMembershipNotificationTest({
      userIds: [worker.id],
      companyIds: [company.id],
    });
  });

  it("push failure does not throw from notifyMemberDeactivated", async () => {
    const worker = await createTestUser("mem-safe-push-worker");
    const company = await createTestCompany("Firma Mem Safe Push");

    const originalSend = webpush.sendNotification;
    webpush.sendNotification = (async () => {
      throw new Error("PUSH_FAIL");
    }) as unknown as typeof webpush.sendNotification;

    await assert.doesNotReject(async () => {
      await notifyMemberDeactivated({
        companyId: company.id,
        companyName: company.name,
        memberUserId: worker.id,
      });
    });

    const row = await prisma.notification.findFirst({ where: { userId: worker.id } });
    assert.ok(row);

    webpush.sendNotification = originalSend;

    await cleanupMembershipNotificationTest({
      userIds: [worker.id],
      companyIds: [company.id],
    });
  });

  it("createNotificationForFormerCompanyMember rejects inactive users", async () => {
    const worker = await createTestUser("mem-former-inactive", false);
    const company = await createTestCompany("Firma Former Inactive");

    await assert.rejects(
      () =>
        createNotificationForFormerCompanyMember({
          recipientUserId: worker.id,
          companyId: company.id,
          companyNameSnapshot: company.name,
          type: MEMBERSHIP_NOTIFICATION_TYPES.REMOVED,
          title: "X",
          body: "Y",
        }),
      /USER_NOT_FOUND/
    );

    await cleanupMembershipNotificationTest({
      userIds: [worker.id],
      companyIds: [company.id],
    });
  });
});

describe("membership notification static guards", () => {
  it("membership routes use membership-notifications side effects", async () => {
    const inviteRoute = await readFile(
      "app/api/companies/[companyId]/members/invite/route.ts",
      "utf8"
    );
    const memberRoute = await readFile(
      "app/api/companies/[companyId]/members/[memberUid]/route.ts",
      "utf8"
    );
    assert.match(inviteRoute, /membership-notifications/);
    assert.match(memberRoute, /membership-notifications/);
    assert.doesNotMatch(inviteRoute, /notification-service/);
    assert.doesNotMatch(memberRoute, /notification-service/);
  });

  it("invite route returns USER_NOT_FOUND before notification when email has no account", async () => {
    const inviteRoute = await readFile(
      "app/api/companies/[companyId]/members/invite/route.ts",
      "utf8"
    );
    assert.match(inviteRoute, /USER_NOT_FOUND/);
    assert.match(inviteRoute, /shouldNotifyAdded/);
  });

  it("attendance route still does not import vacation or membership notification modules", async () => {
    const attendanceRoute = await readFile(
      "app/api/companies/[companyId]/attendance/route.ts",
      "utf8"
    );
    assert.doesNotMatch(attendanceRoute, /vacation-notifications/);
    assert.doesNotMatch(attendanceRoute, /membership-notifications/);
  });
});
