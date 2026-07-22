import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import webpush from "web-push";

import { prisma } from "@/lib/db/prisma";
import { upsertUserPushSubscription, deleteUserPushSubscription } from "../subscription-store";
import { sendPushToUser } from "../sender";
import { createNotificationForUser } from "@/lib/server/notifications/notification-service";
import {
  listNotificationsForUser,
  markNotificationReadForUser,
} from "@/lib/server/notifications/queries";

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

async function createTestCompany(namePrefix: string) {
  return prisma.company.create({
    data: {
      id: randomUUID(),
      name: `${namePrefix}-${randomUUID()}`,
      isActive: true,
    },
  });
}

async function createMembership(userId: string, companyId: string, isActive = true) {
  return prisma.companyMember.create({
    data: { companyId, userId, role: "staff", isActive },
  });
}

function sampleSub(suffix: string) {
  return {
    endpoint: `https://push.example/device-${suffix}`,
    p256dh: `p256dh-${suffix}`,
    auth: `auth-${suffix}`,
  };
}

describe("push subscription store", () => {
  it("authenticated user can save own subscription", async () => {
    const user = await createTestUser("push-save");
    const sub = sampleSub(user.id.slice(0, 8));

    const record = await upsertUserPushSubscription(user.id, sub);
    assert.equal(record.userId, user.id);
    assert.equal(record.endpoint, sub.endpoint);

    await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("endpoint unique does not create duplicates", async () => {
    const userA = await createTestUser("push-dup-a");
    const userB = await createTestUser("push-dup-b");
    const sub = sampleSub("shared-endpoint");

    await upsertUserPushSubscription(userA.id, sub);
    const moved = await upsertUserPushSubscription(userB.id, sub);

    assert.equal(moved.userId, userB.id);

    const count = await prisma.pushSubscription.count({ where: { endpoint: sub.endpoint } });
    assert.equal(count, 1);

    await prisma.pushSubscription.deleteMany({
      where: { endpoint: sub.endpoint },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });

  it("multi-device: user can have more than one subscription", async () => {
    const user = await createTestUser("push-multi");
    await upsertUserPushSubscription(user.id, sampleSub("phone"));
    await upsertUserPushSubscription(user.id, sampleSub("laptop"));

    const subs = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
    assert.equal(subs.length, 2);

    await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("user A cannot delete subscription owned by user B", async () => {
    const userA = await createTestUser("push-del-a");
    const userB = await createTestUser("push-del-b");
    const sub = sampleSub("protected");

    await upsertUserPushSubscription(userB.id, sub);

    const result = await deleteUserPushSubscription(userA.id, sub.endpoint);
    assert.equal(result.deleted, false);
    assert.equal(result.reason, "FORBIDDEN");

    const stillThere = await prisma.pushSubscription.findUnique({ where: { endpoint: sub.endpoint } });
    assert.ok(stillThere);

    await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });
});

describe("sendPushToUser", () => {
  it("does not send to inactive user", async () => {
    const user = await createTestUser("push-inactive", false);
    await upsertUserPushSubscription(user.id, sampleSub("inactive"));

    const result = await sendPushToUser(user.id, {
      title: "T",
      body: "B",
    });

    assert.equal(result.skippedInactiveUser, true);
    assert.equal(result.sent, 0);

    await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("fans out to all subscriptions and removes stale 410", async () => {
    const user = await createTestUser("push-fanout");
    await upsertUserPushSubscription(user.id, sampleSub("dev1"));
    await upsertUserPushSubscription(user.id, sampleSub("dev2"));

    const originalSend = webpush.sendNotification;
    let calls = 0;

    webpush.sendNotification = (async () => {
      calls += 1;
      if (calls === 1) {
        const err = new Error("gone") as Error & { statusCode: number };
        err.statusCode = 410;
        throw err;
      }
      return { statusCode: 201, body: "", headers: {} };
    }) as unknown as typeof webpush.sendNotification;

    try {
      const result = await sendPushToUser(user.id, { title: "Hi", body: "There" });
      assert.equal(result.sent, 1);
      assert.equal(result.removedStale, 1);

      const remaining = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
      assert.equal(remaining.length, 1);
    } finally {
      webpush.sendNotification = originalSend;
      await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});

describe("notification service", () => {
  it("persists notification even when push is not deliverable (no subscriptions)", async () => {
    const user = await createTestUser("notif-no-push");

    const notification = await createNotificationForUser({
      recipientUserId: user.id,
      companyId: null,
      type: "dev.test",
      title: "Hello",
      body: "World",
      url: "/notifications",
    });

    assert.ok(notification.id);

    const row = await prisma.notification.findUnique({ where: { id: notification.id } });
    assert.ok(row);

    await prisma.notification.delete({ where: { id: notification.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("company notification requires active CompanyMember", async () => {
    const worker = await createTestUser("notif-member");
    const company = await createTestCompany("notif-co");
    await createMembership(worker.id, company.id, true);

    const ok = await createNotificationForUser({
      recipientUserId: worker.id,
      companyId: company.id,
      type: "job.assigned",
      title: "Job",
      body: "Assigned",
    });
    assert.ok(ok.id);

    await prisma.companyMember.update({
      where: { companyId_userId: { companyId: company.id, userId: worker.id } },
      data: { isActive: false },
    });

    await assert.rejects(
      () =>
        createNotificationForUser({
          recipientUserId: worker.id,
          companyId: company.id,
          type: "job.assigned",
          title: "Blocked",
          body: "Blocked",
        }),
      /NOT_ACTIVE_MEMBER/
    );

    const companyB = await createTestCompany("notif-co-b");
    await assert.rejects(
      () =>
        createNotificationForUser({
          recipientUserId: worker.id,
          companyId: companyB.id,
          type: "job.assigned",
          title: "Wrong company",
          body: "Nope",
        }),
      /NOT_ACTIVE_MEMBER/
    );

    await prisma.notification.deleteMany({ where: { userId: worker.id } });
    await prisma.companyMember.deleteMany({ where: { userId: worker.id } });
    await prisma.company.deleteMany({ where: { id: { in: [company.id, companyB.id] } } });
    await prisma.user.delete({ where: { id: worker.id } });
  });

  it("worker in companies A and B can receive notifications from both", async () => {
    const worker = await createTestUser("notif-multi-co");
    const companyA = await createTestCompany("co-a");
    const companyB = await createTestCompany("co-b");
    await createMembership(worker.id, companyA.id);
    await createMembership(worker.id, companyB.id);

    const nA = await createNotificationForUser({
      recipientUserId: worker.id,
      companyId: companyA.id,
      type: "job.assigned",
      title: "A",
      body: "From A",
    });
    const nB = await createNotificationForUser({
      recipientUserId: worker.id,
      companyId: companyB.id,
      type: "job.assigned",
      title: "B",
      body: "From B",
    });

    assert.notEqual(nA.id, nB.id);
    assert.equal(nA.companyId, companyA.id);
    assert.equal(nB.companyId, companyB.id);

    await prisma.notification.deleteMany({ where: { userId: worker.id } });
    await prisma.companyMember.deleteMany({ where: { userId: worker.id } });
    await prisma.company.deleteMany({ where: { id: { in: [companyA.id, companyB.id] } } });
    await prisma.user.delete({ where: { id: worker.id } });
  });

  it("account notification can have companyId null", async () => {
    const user = await createTestUser("notif-account");
    const n = await createNotificationForUser({
      recipientUserId: user.id,
      companyId: null,
      type: "account.security",
      title: "Security",
      body: "Password changed",
    });
    assert.equal(n.companyId, null);

    await prisma.notification.delete({ where: { id: n.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

describe("notification queries", () => {
  it("lists only recipient notifications with pagination", async () => {
    const userA = await createTestUser("notif-list-a");
    const userB = await createTestUser("notif-list-b");

    for (let i = 0; i < 3; i += 1) {
      await prisma.notification.create({
        data: {
          userId: userA.id,
          type: "test",
          title: `A-${i}`,
          body: "body",
        },
      });
    }
    await prisma.notification.create({
      data: { userId: userB.id, type: "test", title: "B", body: "body" },
    });

    const page1 = await listNotificationsForUser({ userId: userA.id, limit: 2 });
    assert.equal(page1.notifications.length, 2);
    assert.ok(page1.nextCursor);
    assert.ok(page1.notifications.every((n) => n.title.startsWith("A-")));

    const page2 = await listNotificationsForUser({
      userId: userA.id,
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });
    assert.equal(page2.notifications.length, 1);

    await prisma.notification.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });

  it("mark-read cannot update another user notification", async () => {
    const userA = await createTestUser("notif-read-a");
    const userB = await createTestUser("notif-read-b");

    const n = await prisma.notification.create({
      data: { userId: userB.id, type: "test", title: "Secret", body: "body" },
    });

    const denied = await markNotificationReadForUser(userA.id, n.id);
    assert.equal(denied.updated, false);
    assert.equal(denied.reason, "FORBIDDEN");

    const allowed = await markNotificationReadForUser(userB.id, n.id);
    assert.equal(allowed.updated, true);

    await prisma.notification.delete({ where: { id: n.id } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });
});

describe("push foundation static guards", () => {
  it("subscribe route uses requireSessionUser and rejects client userId", async () => {
    const source = await readFile("app/api/push/subscribe/route.ts", "utf8");
    assert.match(source, /requireSessionUser/);
    assert.match(source, /userId_not_allowed/);
    assert.doesNotMatch(source, /body\.userId/);
  });

  it("VAPID private key is not exposed to client push helper", async () => {
    const clientSource = await readFile("lib/push/client.ts", "utf8");
    assert.doesNotMatch(clientSource, /VAPID_PRIVATE_KEY/);
    assert.match(clientSource, /vapid-public-key/);
  });

  it("service worker has push and notificationclick with same-origin guard", async () => {
    const sw = await readFile("public/sw.js", "utf8");
    assert.match(sw, /addEventListener\("push"/);
    assert.match(sw, /addEventListener\("notificationclick"/);
    assert.match(sw, /parsed\.origin !== self\.location\.origin/);
  });

  it("no business-event routes import notification service in PUSH 1", async () => {
    const jobRoute = await readFile("app/api/companies/[companyId]/jobs/route.ts", "utf8");
    assert.doesNotMatch(jobRoute, /notification-service/);
    const vacationRoute = await readFile("app/api/companies/[companyId]/vacations/route.ts", "utf8");
    assert.doesNotMatch(vacationRoute, /notification-service/);
  });
});
