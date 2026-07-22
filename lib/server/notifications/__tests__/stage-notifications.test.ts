import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import webpush from "web-push";

import { prisma } from "@/lib/db/prisma";
import { createNotificationForUser } from "@/lib/server/notifications/notification-service";
import {
  buildStageNotificationContext,
  notifyStageApproved,
  notifyStageRejected,
  notifyStageReopened,
  notifyStageSubmittedForApproval,
  notifyStageSupervisorChange,
  STAGE_NOTIFICATION_TYPES,
  stageJobDeepLink,
  stageSupervisorRemovedDeepLink,
} from "@/lib/server/notifications/stage-notifications";

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
      status: "new",
      statusUpdatedAt: new Date(),
      createdByUserId: params.createdByUserId,
    },
  });
}

async function createTestStage(params: {
  companyId: string;
  jobId: string;
  name?: string;
  supervisorUserId?: string | null;
  submittedByUserId?: string | null;
  status?: string;
}) {
  return prisma.jobStage.create({
    data: {
      companyId: params.companyId,
      jobId: params.jobId,
      name: params.name ?? "Montaż rozdzielni",
      status: params.status ?? "in_progress",
      supervisorUserId: params.supervisorUserId ?? null,
      submittedByUserId: params.submittedByUserId ?? null,
    },
  });
}

function stageContext(params: {
  companyId: string;
  companyName: string;
  job: { id: string; jobNumber: number; customerName: string };
  stage: { id: string; name: string };
  actorUserId: string;
}) {
  return buildStageNotificationContext({
    companyId: params.companyId,
    companyName: params.companyName,
    jobId: params.job.id,
    jobNumber: params.job.jobNumber,
    customerName: params.job.customerName,
    stageId: params.stage.id,
    stageName: params.stage.name,
    actorUserId: params.actorUserId,
  });
}

async function cleanupStageNotificationTest(ids: {
  userIds?: string[];
  companyIds?: string[];
  jobIds?: string[];
}) {
  if (ids.jobIds?.length) {
    await prisma.jobStageHistory.deleteMany({ where: { jobId: { in: ids.jobIds } } });
    await prisma.jobStage.deleteMany({ where: { jobId: { in: ids.jobIds } } });
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

describe("stage supervisor notifications", () => {
  it("new supervisor receives assignment notification", async () => {
    const admin = await createTestUser("stage-sup-admin");
    const supervisor = await createTestUser("stage-sup-new");
    const company = await createTestCompany("Elektro Stage");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(supervisor.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });

    await notifyStageSupervisorChange({
      context: stageContext({
        companyId: company.id,
        companyName: company.name,
        job,
        stage,
        actorUserId: admin.id,
      }),
      previousSupervisorUserId: null,
      newSupervisorUserId: supervisor.id,
    });

    const notifications = await prisma.notification.findMany({ where: { userId: supervisor.id } });
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, STAGE_NOTIFICATION_TYPES.SUPERVISOR_ASSIGNED);
    assert.equal(notifications[0].companyId, company.id);
    assert.equal(notifications[0].companyNameSnapshot, "Elektro Stage");
    assert.match(notifications[0].title, /Elektro Stage/);
    assert.match(notifications[0].body, /Montaż rozdzielni/);
    assert.equal(notifications[0].url, stageJobDeepLink(job.id));

    await cleanupStageNotificationTest({
      userIds: [admin.id, supervisor.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("unchanged supervisor does not create duplicate notifications", async () => {
    const admin = await createTestUser("stage-sup-same-admin");
    const supervisor = await createTestUser("stage-sup-same");
    const company = await createTestCompany("Firma Same Sup");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(supervisor.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });
    const context = stageContext({
      companyId: company.id,
      companyName: company.name,
      job,
      stage,
      actorUserId: admin.id,
    });

    await notifyStageSupervisorChange({
      context,
      previousSupervisorUserId: supervisor.id,
      newSupervisorUserId: supervisor.id,
    });

    const count = await prisma.notification.count({ where: { userId: supervisor.id } });
    assert.equal(count, 0);

    await cleanupStageNotificationTest({
      userIds: [admin.id, supervisor.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("previous supervisor receives removal notification when replaced", async () => {
    const admin = await createTestUser("stage-sup-replace-admin");
    const oldSupervisor = await createTestUser("stage-sup-old");
    const newSupervisor = await createTestUser("stage-sup-replacement");
    const company = await createTestCompany("Firma Replace Sup");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(oldSupervisor.id, company.id);
    await createMembership(newSupervisor.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });

    await notifyStageSupervisorChange({
      context: stageContext({
        companyId: company.id,
        companyName: company.name,
        job,
        stage,
        actorUserId: admin.id,
      }),
      previousSupervisorUserId: oldSupervisor.id,
      newSupervisorUserId: newSupervisor.id,
    });

    const oldRows = await prisma.notification.findMany({ where: { userId: oldSupervisor.id } });
    const newRows = await prisma.notification.findMany({ where: { userId: newSupervisor.id } });
    assert.equal(oldRows.length, 1);
    assert.equal(oldRows[0].type, STAGE_NOTIFICATION_TYPES.SUPERVISOR_REMOVED);
    assert.equal(oldRows[0].url, stageSupervisorRemovedDeepLink());
    assert.equal(newRows.length, 1);
    assert.equal(newRows[0].type, STAGE_NOTIFICATION_TYPES.SUPERVISOR_ASSIGNED);

    await cleanupStageNotificationTest({
      userIds: [admin.id, oldSupervisor.id, newSupervisor.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("cleared supervisor receives removal notification", async () => {
    const admin = await createTestUser("stage-sup-clear-admin");
    const supervisor = await createTestUser("stage-sup-clear");
    const company = await createTestCompany("Firma Clear Sup");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(supervisor.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });

    await notifyStageSupervisorChange({
      context: stageContext({
        companyId: company.id,
        companyName: company.name,
        job,
        stage,
        actorUserId: admin.id,
      }),
      previousSupervisorUserId: supervisor.id,
      newSupervisorUserId: null,
    });

    const rows = await prisma.notification.findMany({ where: { userId: supervisor.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, STAGE_NOTIFICATION_TYPES.SUPERVISOR_REMOVED);

    await cleanupStageNotificationTest({
      userIds: [admin.id, supervisor.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });
});

describe("stage submission notifications", () => {
  it("submit stage notifies owner/admin approvers", async () => {
    const owner = await createTestUser("stage-submit-owner");
    const admin = await createTestUser("stage-submit-admin");
    const supervisor = await createTestUser("stage-submit-supervisor");
    const company = await createTestCompany("Firma Submit");
    await createMembership(owner.id, company.id, "owner");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(supervisor.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: owner.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });

    await notifyStageSubmittedForApproval({
      context: stageContext({
        companyId: company.id,
        companyName: company.name,
        job,
        stage,
        actorUserId: supervisor.id,
      }),
    });

    const ownerRows = await prisma.notification.findMany({ where: { userId: owner.id } });
    const adminRows = await prisma.notification.findMany({ where: { userId: admin.id } });
    const supervisorRows = await prisma.notification.findMany({ where: { userId: supervisor.id } });
    assert.equal(ownerRows.length, 1);
    assert.equal(adminRows.length, 1);
    assert.equal(supervisorRows.length, 0);
    assert.equal(ownerRows[0].type, STAGE_NOTIFICATION_TYPES.SUBMITTED_FOR_APPROVAL);
    assert.equal(ownerRows[0].companyId, company.id);

    await cleanupStageNotificationTest({
      userIds: [owner.id, admin.id, supervisor.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("submit actor who is owner/admin does not self-notify", async () => {
    const owner = await createTestUser("stage-submit-self-owner");
    const company = await createTestCompany("Firma Submit Self");
    await createMembership(owner.id, company.id, "owner");
    const job = await createTestJob({ companyId: company.id, createdByUserId: owner.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });

    await notifyStageSubmittedForApproval({
      context: stageContext({
        companyId: company.id,
        companyName: company.name,
        job,
        stage,
        actorUserId: owner.id,
      }),
    });

    const count = await prisma.notification.count({ where: { userId: owner.id } });
    assert.equal(count, 0);

    await cleanupStageNotificationTest({
      userIds: [owner.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });
});

describe("stage approval and rejection notifications", () => {
  it("approved stage notifies supervisor and submitter", async () => {
    const admin = await createTestUser("stage-approve-admin");
    const supervisor = await createTestUser("stage-approve-supervisor");
    const submitter = await createTestUser("stage-approve-submitter");
    const company = await createTestCompany("Firma Approve");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(supervisor.id, company.id);
    await createMembership(submitter.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });

    await notifyStageApproved({
      context: stageContext({
        companyId: company.id,
        companyName: company.name,
        job,
        stage,
        actorUserId: admin.id,
      }),
      supervisorUserId: supervisor.id,
      submittedByUserId: submitter.id,
    });

    const supervisorRows = await prisma.notification.findMany({ where: { userId: supervisor.id } });
    const submitterRows = await prisma.notification.findMany({ where: { userId: submitter.id } });
    assert.equal(supervisorRows.length, 1);
    assert.equal(submitterRows.length, 1);
    assert.equal(supervisorRows[0].type, STAGE_NOTIFICATION_TYPES.APPROVED);
    assert.match(supervisorRows[0].body, /zaakceptowany/i);

    await cleanupStageNotificationTest({
      userIds: [admin.id, supervisor.id, submitter.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("rejected stage notifies supervisor and submitter without sensitive rejection details", async () => {
    const admin = await createTestUser("stage-reject-admin");
    const supervisor = await createTestUser("stage-reject-supervisor");
    const submitter = await createTestUser("stage-reject-submitter");
    const company = await createTestCompany("Firma Reject");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(supervisor.id, company.id);
    await createMembership(submitter.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });

    await notifyStageRejected({
      context: stageContext({
        companyId: company.id,
        companyName: company.name,
        job,
        stage,
        actorUserId: admin.id,
      }),
      supervisorUserId: supervisor.id,
      submittedByUserId: submitter.id,
    });

    const rows = await prisma.notification.findMany({
      where: { userId: { in: [supervisor.id, submitter.id] } },
    });
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.type, STAGE_NOTIFICATION_TYPES.REJECTED);
      assert.match(row.body, /Otwórz VectorWork/);
      assert.doesNotMatch(row.body, /tajny komentarz/i);
      assert.doesNotMatch(row.title, /tajny komentarz/i);
    }

    await cleanupStageNotificationTest({
      userIds: [admin.id, supervisor.id, submitter.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("approval actor who is submitter does not self-notify", async () => {
    const admin = await createTestUser("stage-approve-self-admin");
    const supervisor = await createTestUser("stage-approve-self-supervisor");
    const company = await createTestCompany("Firma Approve Self");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(supervisor.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });

    await notifyStageApproved({
      context: stageContext({
        companyId: company.id,
        companyName: company.name,
        job,
        stage,
        actorUserId: admin.id,
      }),
      supervisorUserId: supervisor.id,
      submittedByUserId: admin.id,
    });

    const adminRows = await prisma.notification.findMany({ where: { userId: admin.id } });
    const supervisorRows = await prisma.notification.findMany({ where: { userId: supervisor.id } });
    assert.equal(adminRows.length, 0);
    assert.equal(supervisorRows.length, 1);

    await cleanupStageNotificationTest({
      userIds: [admin.id, supervisor.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });
});

describe("stage reopened notifications", () => {
  it("reopened stage notifies supervisor and submitter", async () => {
    const admin = await createTestUser("stage-reopen-admin");
    const supervisor = await createTestUser("stage-reopen-supervisor");
    const submitter = await createTestUser("stage-reopen-submitter");
    const company = await createTestCompany("Firma Reopen");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(supervisor.id, company.id);
    await createMembership(submitter.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });

    await notifyStageReopened({
      context: stageContext({
        companyId: company.id,
        companyName: company.name,
        job,
        stage,
        actorUserId: admin.id,
      }),
      supervisorUserId: supervisor.id,
      submittedByUserId: submitter.id,
    });

    const rows = await prisma.notification.findMany({
      where: { userId: { in: [supervisor.id, submitter.id] } },
    });
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.type === STAGE_NOTIFICATION_TYPES.REOPENED));

    await cleanupStageNotificationTest({
      userIds: [admin.id, supervisor.id, submitter.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });
});

describe("stage notification multi-tenant and eligibility", () => {
  it("worker in company A does not receive stage notification scoped to company B", async () => {
    const adminB = await createTestUser("stage-mt-admin-b");
    const worker = await createTestUser("stage-mt-worker");
    const companyA = await createTestCompany("Firma A Stage");
    const companyB = await createTestCompany("Firma B Stage");
    await createMembership(worker.id, companyA.id);
    const jobB = await createTestJob({ companyId: companyB.id, createdByUserId: adminB.id });
    const stageB = await createTestStage({ companyId: companyB.id, jobId: jobB.id });

    await notifyStageSupervisorChange({
      context: stageContext({
        companyId: companyB.id,
        companyName: companyB.name,
        job: jobB,
        stage: stageB,
        actorUserId: adminB.id,
      }),
      previousSupervisorUserId: null,
      newSupervisorUserId: worker.id,
    });

    const count = await prisma.notification.count({ where: { userId: worker.id } });
    assert.equal(count, 0);

    await cleanupStageNotificationTest({
      userIds: [adminB.id, worker.id],
      companyIds: [companyA.id, companyB.id],
      jobIds: [jobB.id],
    });
  });

  it("worker in companies A and B receives correctly scoped notification from A", async () => {
    const adminA = await createTestUser("stage-mt-multi-admin");
    const worker = await createTestUser("stage-mt-multi-worker");
    const companyA = await createTestCompany("Firma Alpha Stage");
    const companyB = await createTestCompany("Firma Beta Stage");
    await createMembership(adminA.id, companyA.id, "admin");
    await createMembership(worker.id, companyA.id);
    await createMembership(worker.id, companyB.id);
    const jobA = await createTestJob({ companyId: companyA.id, createdByUserId: adminA.id });
    const stageA = await createTestStage({ companyId: companyA.id, jobId: jobA.id });

    await notifyStageSupervisorChange({
      context: stageContext({
        companyId: companyA.id,
        companyName: companyA.name,
        job: jobA,
        stage: stageA,
        actorUserId: adminA.id,
      }),
      previousSupervisorUserId: null,
      newSupervisorUserId: worker.id,
    });

    const rows = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].companyId, companyA.id);
    assert.equal(rows[0].companyNameSnapshot, "Firma Alpha Stage");

    await cleanupStageNotificationTest({
      userIds: [adminA.id, worker.id],
      companyIds: [companyA.id, companyB.id],
      jobIds: [jobA.id],
    });
  });

  it("inactive user and inactive membership are skipped", async () => {
    const admin = await createTestUser("stage-inactive-admin");
    const inactiveUser = await createTestUser("stage-inactive-user", false);
    const inactiveMember = await createTestUser("stage-inactive-member");
    const company = await createTestCompany("Firma Stage Inactive");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(inactiveMember.id, company.id, "staff", false);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });
    const context = stageContext({
      companyId: company.id,
      companyName: company.name,
      job,
      stage,
      actorUserId: admin.id,
    });

    await notifyStageSupervisorChange({
      context,
      previousSupervisorUserId: null,
      newSupervisorUserId: inactiveUser.id,
    });
    await notifyStageSupervisorChange({
      context,
      previousSupervisorUserId: inactiveUser.id,
      newSupervisorUserId: inactiveMember.id,
    });

    const count = await prisma.notification.count({
      where: { userId: { in: [inactiveUser.id, inactiveMember.id] } },
    });
    assert.equal(count, 0);

    await cleanupStageNotificationTest({
      userIds: [admin.id, inactiveUser.id, inactiveMember.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });
});

describe("stage notification safety", () => {
  it("notification DB failure does not throw from notifyStageSupervisorChange", async () => {
    const admin = await createTestUser("stage-safe-db-admin");
    const supervisor = await createTestUser("stage-safe-db-supervisor");
    const company = await createTestCompany("Firma Stage Safe DB");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(supervisor.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });

    const originalCreate = prisma.notification.create.bind(prisma.notification);
    prisma.notification.create = (async () => {
      throw new Error("DB_FAIL");
    }) as unknown as typeof prisma.notification.create;

    await assert.doesNotReject(async () => {
      await notifyStageSupervisorChange({
        context: stageContext({
          companyId: company.id,
          companyName: company.name,
          job,
          stage,
          actorUserId: admin.id,
        }),
        previousSupervisorUserId: null,
        newSupervisorUserId: supervisor.id,
      });
    });

    prisma.notification.create = originalCreate;

    await cleanupStageNotificationTest({
      userIds: [admin.id, supervisor.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("push failure does not throw from notifyStageSupervisorChange", async () => {
    const admin = await createTestUser("stage-safe-push-admin");
    const supervisor = await createTestUser("stage-safe-push-supervisor");
    const company = await createTestCompany("Firma Stage Safe Push");
    await createMembership(admin.id, company.id, "admin");
    await createMembership(supervisor.id, company.id);
    const job = await createTestJob({ companyId: company.id, createdByUserId: admin.id });
    const stage = await createTestStage({ companyId: company.id, jobId: job.id });

    const originalSend = webpush.sendNotification;
    webpush.sendNotification = (async () => {
      throw new Error("PUSH_FAIL");
    }) as unknown as typeof webpush.sendNotification;

    await assert.doesNotReject(async () => {
      await notifyStageSupervisorChange({
        context: stageContext({
          companyId: company.id,
          companyName: company.name,
          job,
          stage,
          actorUserId: admin.id,
        }),
        previousSupervisorUserId: null,
        newSupervisorUserId: supervisor.id,
      });
    });

    const row = await prisma.notification.findFirst({ where: { userId: supervisor.id } });
    assert.ok(row);

    webpush.sendNotification = originalSend;

    await cleanupStageNotificationTest({
      userIds: [admin.id, supervisor.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });
});

describe("stage notification static guards", () => {
  it("stage-notifications resolves recipients with scoped batch queries only", async () => {
    const source = await readFile("lib/server/notifications/stage-notifications.ts", "utf8");
    assert.doesNotMatch(source, /user\.findMany\(\s*\{\s*\}\)/);
    assert.match(source, /id:\s*\{\s*in:/);
  });

  it("stage routes use stage-notifications side effects, not notification-service directly", async () => {
    const kierownikRoute = await readFile(
      "app/api/companies/[companyId]/jobs/[jobId]/etapy_realizacji/[stageId]/kierownik/route.ts",
      "utf8"
    );
    const zakonczRoute = await readFile(
      "app/api/companies/[companyId]/jobs/[jobId]/etapy_realizacji/[stageId]/zakoncz/route.ts",
      "utf8"
    );
    const akceptujRoute = await readFile(
      "app/api/companies/[companyId]/jobs/[jobId]/etapy_realizacji/[stageId]/akceptuj/route.ts",
      "utf8"
    );
    const odrzucRoute = await readFile(
      "app/api/companies/[companyId]/jobs/[jobId]/etapy_realizacji/[stageId]/odrzuc/route.ts",
      "utf8"
    );
    const cofnijRoute = await readFile(
      "app/api/companies/[companyId]/jobs/[jobId]/etapy_realizacji/[stageId]/cofnij/route.ts",
      "utf8"
    );

    for (const source of [kierownikRoute, zakonczRoute, akceptujRoute, odrzucRoute, cofnijRoute]) {
      assert.match(source, /stage-notifications/);
      assert.doesNotMatch(source, /notification-service/);
    }
  });

  it("vacations route still does not import stage notification modules", async () => {
    const vacationRoute = await readFile("app/api/companies/[companyId]/vacations/route.ts", "utf8");
    assert.doesNotMatch(vacationRoute, /stage-notifications/);
  });

  it("stage create route does not import notification modules", async () => {
    const createRoute = await readFile(
      "app/api/companies/[companyId]/jobs/[jobId]/etapy_realizacji/route.ts",
      "utf8"
    );
    assert.doesNotMatch(createRoute, /stage-notifications/);
    assert.doesNotMatch(createRoute, /notification-service/);
  });

  it("createNotificationForUser still validates recipient for direct calls", async () => {
    const worker = await createTestUser("stage-direct-call");
    const company = await createTestCompany("Firma Stage Direct");
    await createMembership(worker.id, company.id, "staff", false);

    await assert.rejects(
      () =>
        createNotificationForUser({
          recipientUserId: worker.id,
          companyId: company.id,
          type: STAGE_NOTIFICATION_TYPES.SUPERVISOR_ASSIGNED,
          title: "X",
          body: "Y",
        }),
      /NOT_ACTIVE_MEMBER/
    );

    await cleanupStageNotificationTest({
      userIds: [worker.id],
      companyIds: [company.id],
    });
  });
});
