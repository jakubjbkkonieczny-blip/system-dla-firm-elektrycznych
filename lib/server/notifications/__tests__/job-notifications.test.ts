import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import webpush from "web-push";

import { prisma } from "@/lib/db/prisma";
import { createNotificationForUser } from "@/lib/server/notifications/notification-service";
import {
  buildJobNotificationContext,
  computeAssignmentDiff,
  excludeActor,
  formatJobDisplayTitle,
  JOB_NOTIFICATION_TYPES,
  notifyInitialJobAssignments,
  notifyJobAssignmentChanges,
  notifyJobStatusChange,
} from "@/lib/server/notifications/job-notifications";

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

async function createTestJob(params: {
  companyId: string;
  createdByUserId: string;
  customerName?: string;
  status?: string;
}) {
  return prisma.job.create({
    data: {
      companyId: params.companyId,
      jobNumber: Math.floor(Math.random() * 1_000_000),
      customerName: params.customerName ?? "Jan Kowalski",
      customerPhone: "500600700",
      addressCity: "Warszawa",
      addressStreet: "Testowa 1",
      description: "Instalacja",
      priority: "normal",
      status: params.status ?? "new",
      statusUpdatedAt: new Date(),
      createdByUserId: params.createdByUserId,
    },
  });
}

function jobContext(params: {
  companyId: string;
  companyName: string;
  job: { id: string; jobNumber: number; customerName: string };
  actorUserId: string;
}) {
  return buildJobNotificationContext({
    companyId: params.companyId,
    companyName: params.companyName,
    jobId: params.job.id,
    jobNumber: params.job.jobNumber,
    customerName: params.job.customerName,
    actorUserId: params.actorUserId,
  });
}

async function cleanupJobNotificationTest(ids: {
  userIds?: string[];
  companyIds?: string[];
  jobIds?: string[];
}) {
  if (ids.jobIds?.length) {
    await prisma.jobAssignment.deleteMany({ where: { jobId: { in: ids.jobIds } } });
    await prisma.notification.deleteMany({
      where: { companyId: { in: ids.companyIds ?? [] } },
    });
    await prisma.job.deleteMany({ where: { id: { in: ids.jobIds } } });
  }
  if (ids.companyIds?.length) {
    await prisma.companyMember.deleteMany({ where: { companyId: { in: ids.companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: ids.companyIds } } });
  }
  if (ids.userIds?.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: ids.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }
}

describe("job notification helpers", () => {
  it("computeAssignmentDiff detects newly assigned and removed workers", () => {
    const diff = computeAssignmentDiff(["a", "b"], ["b", "c"]);
    assert.deepEqual(diff.newlyAssigned, ["c"]);
    assert.deepEqual(diff.removed, ["a"]);
  });

  it("excludeActor removes actor from recipient list", () => {
    assert.deepEqual(excludeActor(["a", "b", "c"], "b"), ["a", "c"]);
  });

  it("formatJobDisplayTitle uses job number and customer name without sensitive fields", () => {
    const title = formatJobDisplayTitle({ jobNumber: 42, customerName: "Jan Kowalski" });
    assert.equal(title, "#42 — Jan Kowalski");
    assert.doesNotMatch(title, /Testowa/);
    assert.doesNotMatch(title, /500600700/);
  });
});

describe("job assignment notifications", () => {
  it("newly assigned worker receives notification", async () => {
    const admin = await createTestUser("job-notif-admin");
    const worker = await createTestUser("job-notif-worker");
    const company = await createTestCompany("Elektro Kowalski");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });

    await notifyJobAssignmentChanges({
      context: jobContext({ companyId: company.id, companyName: company.name, job, actorUserId: admin.id }),
      previousAssignedToUids: [],
      newAssignedToUids: [worker.id],
    });

    const notifications = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, JOB_NOTIFICATION_TYPES.ASSIGNED);
    assert.equal(notifications[0].companyId, company.id);
    assert.equal(notifications[0].companyNameSnapshot, "Elektro Kowalski");
    assert.match(notifications[0].title, /Elektro Kowalski/);
    assert.match(notifications[0].body, new RegExp(`#${job.jobNumber}`));
    assert.equal(notifications[0].url, `/jobs/${job.id}`);

    await cleanupJobNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("unchanged assignment does not create duplicate notifications", async () => {
    const admin = await createTestUser("job-notif-dup-admin");
    const worker = await createTestUser("job-notif-dup-worker");
    const company = await createTestCompany("Firma Dup");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const context = jobContext({ companyId: company.id, companyName: company.name, job, actorUserId: admin.id });
    const assigned = [worker.id];

    await notifyJobAssignmentChanges({
      context,
      previousAssignedToUids: assigned,
      newAssignedToUids: assigned,
    });

    const notifications = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(notifications.length, 0);

    await cleanupJobNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("removed worker receives removal notification with safe jobs list url", async () => {
    const admin = await createTestUser("job-notif-remove-admin");
    const worker = await createTestUser("job-notif-remove-worker");
    const company = await createTestCompany("Firma Remove");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });

    await notifyJobAssignmentChanges({
      context: jobContext({ companyId: company.id, companyName: company.name, job, actorUserId: admin.id }),
      previousAssignedToUids: [worker.id],
      newAssignedToUids: [],
    });

    const notifications = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, JOB_NOTIFICATION_TYPES.UNASSIGNED);
    assert.equal(notifications[0].url, "/jobs");

    await cleanupJobNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("worker in company A does not receive notification scoped to company B", async () => {
    const adminA = await createTestUser("job-notif-a-admin");
    const worker = await createTestUser("job-notif-a-worker");
    const companyA = await createTestCompany("Firma A");
    const companyB = await createTestCompany("Firma B");
    await createMembership(adminA.id, companyA.id, "admin");
    await createMembership(worker.id, companyA.id);
    const jobB = await createTestJob({ companyId: companyB.id, createdByUserId: adminA.id });

    await notifyJobAssignmentChanges({
      context: jobContext({
        companyId: companyB.id,
        companyName: companyB.name,
        job: jobB,
        actorUserId: adminA.id,
      }),
      previousAssignedToUids: [],
      newAssignedToUids: [worker.id],
    });

    const notifications = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(notifications.length, 0);

    await cleanupJobNotificationTest({
      userIds: [adminA.id, worker.id],
      companyIds: [companyA.id, companyB.id],
      jobIds: [jobB.id],
    });
  });

  it("worker in companies A and B receives correctly scoped notification from A", async () => {
    const adminA = await createTestUser("job-notif-multi-admin");
    const worker = await createTestUser("job-notif-multi-worker");
    const companyA = await createTestCompany("Firma Alpha");
    const companyB = await createTestCompany("Firma Beta");
    await createMembership(adminA.id, companyA.id, "admin");
    await createMembership(worker.id, companyA.id);
    await createMembership(worker.id, companyB.id);
    const jobA = await createTestJob({ companyId: companyA.id, createdByUserId: adminA.id });

    await notifyJobAssignmentChanges({
      context: jobContext({
        companyId: companyA.id,
        companyName: companyA.name,
        job: jobA,
        actorUserId: adminA.id,
      }),
      previousAssignedToUids: [],
      newAssignedToUids: [worker.id],
    });

    const notifications = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].companyId, companyA.id);
    assert.equal(notifications[0].companyNameSnapshot, "Firma Alpha");

    await cleanupJobNotificationTest({
      userIds: [adminA.id, worker.id],
      companyIds: [companyA.id, companyB.id],
      jobIds: [jobA.id],
    });
  });

  it("actor who assigns themselves does not receive self-notification", async () => {
    const admin = await createTestUser("job-notif-self-admin");
    const company = await createTestCompany("Firma Self");
    await createMembership(admin.id, company.id, "admin");
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });

    await notifyJobAssignmentChanges({
      context: jobContext({ companyId: company.id, companyName: company.name, job, actorUserId: admin.id }),
      previousAssignedToUids: [],
      newAssignedToUids: [admin.id],
    });

    const notifications = await prisma.notification.findMany({ where: { userId: admin.id } });
    assert.equal(notifications.length, 0);

    await cleanupJobNotificationTest({
      userIds: [admin.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("inactive user and inactive membership are skipped", async () => {
    const admin = await createTestUser("job-notif-inactive-admin");
    const inactiveUser = await createTestUser("job-notif-inactive-user", false);
    const inactiveMember = await createTestUser("job-notif-inactive-member");
    const company = await createTestCompany("Firma Inactive");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(inactiveMember.id, company.id, "staff", false);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const context = jobContext({ companyId: company.id, companyName: company.name, job, actorUserId: admin.id });

    await notifyJobAssignmentChanges({
      context,
      previousAssignedToUids: [],
      newAssignedToUids: [inactiveUser.id, inactiveMember.id],
    });

    const count = await prisma.notification.count({
      where: { userId: { in: [inactiveUser.id, inactiveMember.id] } },
    });
    assert.equal(count, 0);

    await cleanupJobNotificationTest({
      userIds: [admin.id, inactiveUser.id, inactiveMember.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });
});

describe("job status notifications", () => {
  it("status change notifies assigned workers with readable label", async () => {
    const admin = await createTestUser("job-status-admin");
    const worker = await createTestUser("job-status-worker");
    const company = await createTestCompany("Firma Status");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);
    const job = await createTestJob({
      companyId: company.id,
      createdByUserId: admin.id,
      status: "new",
    });

    await notifyJobStatusChange({
      context: jobContext({ companyId: company.id, companyName: company.name, job, actorUserId: admin.id }),
      previousStatus: "new",
      newStatus: "in_progress",
      assignedToUids: [worker.id],
    });

    const notifications = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, JOB_NOTIFICATION_TYPES.STATUS_CHANGED);
    assert.match(notifications[0].body, /W trakcie/);
    assert.equal(notifications[0].url, `/jobs/${job.id}`);

    await cleanupJobNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("no status change produces no notification", async () => {
    const admin = await createTestUser("job-status-same-admin");
    const worker = await createTestUser("job-status-same-worker");
    const company = await createTestCompany("Firma Same Status");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });

    await notifyJobStatusChange({
      context: jobContext({ companyId: company.id, companyName: company.name, job, actorUserId: admin.id }),
      previousStatus: "new",
      newStatus: "new",
      assignedToUids: [worker.id],
    });

    const count = await prisma.notification.count({ where: { userId: worker.id } });
    assert.equal(count, 0);

    await cleanupJobNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("status change actor who is assigned does not self-notify", async () => {
    const worker = await createTestUser("job-status-self-worker");
    const company = await createTestCompany("Firma Status Self");
    await createMembership(worker.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: worker.id });

    await notifyJobStatusChange({
      context: jobContext({ companyId: company.id, companyName: company.name, job, actorUserId: worker.id }),
      previousStatus: "new",
      newStatus: "scheduled",
      assignedToUids: [worker.id],
    });

    const count = await prisma.notification.count({ where: { userId: worker.id } });
    assert.equal(count, 0);

    await cleanupJobNotificationTest({
      userIds: [worker.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });
});

describe("job notification safety", () => {
  it("notification DB failure does not throw from notifyJobAssignmentChanges", async () => {
    const admin = await createTestUser("job-safe-db-admin");
    const worker = await createTestUser("job-safe-db-worker");
    const company = await createTestCompany("Firma Safe DB");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });

    const originalCreate = prisma.notification.create.bind(prisma.notification);
    prisma.notification.create = (async () => {
      throw new Error("DB_FAIL");
    }) as unknown as typeof prisma.notification.create;

    await assert.doesNotReject(async () => {
      await notifyJobAssignmentChanges({
        context: jobContext({ companyId: company.id, companyName: company.name, job, actorUserId: admin.id }),
        previousAssignedToUids: [],
        newAssignedToUids: [worker.id],
      });
    });

    prisma.notification.create = originalCreate;

    await cleanupJobNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("push failure does not throw from notifyJobAssignmentChanges", async () => {
    const admin = await createTestUser("job-safe-push-admin");
    const worker = await createTestUser("job-safe-push-worker");
    const company = await createTestCompany("Firma Safe Push");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });

    const originalSend = webpush.sendNotification;
    webpush.sendNotification = (async () => {
      throw new Error("PUSH_FAIL");
    }) as unknown as typeof webpush.sendNotification;

    await assert.doesNotReject(async () => {
      await notifyJobAssignmentChanges({
        context: jobContext({ companyId: company.id, companyName: company.name, job, actorUserId: admin.id }),
        previousAssignedToUids: [],
        newAssignedToUids: [worker.id],
      });
    });

    const row = await prisma.notification.findFirst({ where: { userId: worker.id } });
    assert.ok(row);

    webpush.sendNotification = originalSend;

    await cleanupJobNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("job assignment sync succeeds even when notifications are triggered afterward", async () => {
    const admin = await createTestUser("job-sync-admin");
    const worker = await createTestUser("job-sync-worker");
    const company = await createTestCompany("Firma Sync");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(worker.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });

    await prisma.jobAssignment.create({
      data: {
        companyId: company.id,
        jobId: job.id,
        userId: worker.id,
        assignedByUserId: admin.id,
      },
    });

    await notifyInitialJobAssignments({
      context: jobContext({ companyId: company.id, companyName: company.name, job, actorUserId: admin.id }),
      assignedToUids: [worker.id],
    });

    const assignment = await prisma.jobAssignment.findFirst({
      where: { jobId: job.id, userId: worker.id },
    });
    assert.ok(assignment);

    const notification = await prisma.notification.findFirst({ where: { userId: worker.id } });
    assert.ok(notification);

    await cleanupJobNotificationTest({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });
});

describe("job notification static guards", () => {
  it("job-notifications resolves recipients with scoped batch queries only", async () => {
    const source = await readFile("lib/server/notifications/job-notifications.ts", "utf8");
    assert.doesNotMatch(source, /user\.findMany\(\s*\{\s*\}\)/);
    assert.match(source, /id:\s*\{\s*in:/);
  });

  it("job routes use job-notifications side effects, not notification-service directly", async () => {
    const jobsRoute = await readFile("app/api/companies/[companyId]/jobs/route.ts", "utf8");
    const jobIdRoute = await readFile("app/api/companies/[companyId]/jobs/[jobId]/route.ts", "utf8");
    assert.match(jobsRoute, /job-notifications/);
    assert.match(jobIdRoute, /job-notifications/);
    assert.doesNotMatch(jobsRoute, /notification-service/);
    assert.doesNotMatch(jobIdRoute, /notification-service/);
  });

  it("vacations route still does not import notification modules", async () => {
    const vacationRoute = await readFile("app/api/companies/[companyId]/vacations/route.ts", "utf8");
    assert.doesNotMatch(vacationRoute, /notification-service/);
    assert.doesNotMatch(vacationRoute, /job-notifications/);
    assert.doesNotMatch(vacationRoute, /stage-notifications/);
  });

  it("createNotificationForUser still validates recipient for direct calls", async () => {
    const worker = await createTestUser("job-direct-call");
    const company = await createTestCompany("Firma Direct");
    await createMembership(worker.id, company.id, "staff", false);

    await assert.rejects(
      () =>
        createNotificationForUser({
          recipientUserId: worker.id,
          companyId: company.id,
          type: JOB_NOTIFICATION_TYPES.ASSIGNED,
          title: "X",
          body: "Y",
        }),
      /NOT_ACTIVE_MEMBER/
    );

    await cleanupJobNotificationTest({
      userIds: [worker.id],
      companyIds: [company.id],
    });
  });
});
