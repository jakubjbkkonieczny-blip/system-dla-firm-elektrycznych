import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

import { prisma } from "@/lib/db/prisma";
import type { ActiveMember } from "@/app/api/_lib/membership";
import {
  assertJobStatusMutationAllowed,
  isJobStatusChange,
} from "../job-status-mutation";
import {
  JOB_NOTIFICATION_TYPES,
  notifyJobStatusChange,
} from "@/lib/server/notifications/job-notifications";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";

const PASSWORD = "Password123!";

function member(role: "owner" | "admin" | "staff", userId = randomUUID()): ActiveMember {
  return { role, scope: "assigned_only", userId, isActive: true };
}

async function createTestUser(emailPrefix: string) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      email: `${emailPrefix}-${id}@example.com`,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      displayName: `Test ${emailPrefix}`,
      accountRole: "worker",
      sessionVersion: 0,
      isActive: true,
    },
  });
}

async function createTestCompany(name: string) {
  return prisma.company.create({
    data: { id: randomUUID(), name, isActive: true },
  });
}

async function createTestJob(params: {
  companyId: string;
  createdByUserId: string;
  status?: string;
}) {
  return prisma.job.create({
    data: {
      companyId: params.companyId,
      jobNumber: Math.floor(Math.random() * 1_000_000),
      customerName: "Jan Kowalski",
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

async function cleanup(ids: {
  userIds?: string[];
  companyIds?: string[];
  jobIds?: string[];
}) {
  if (ids.jobIds?.length) {
    await prisma.notification.deleteMany({ where: { companyId: { in: ids.companyIds ?? [] } } });
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

describe("job status mutation authorization", () => {
  it("allows owner to mutate job status", () => {
    assert.doesNotThrow(() =>
      assertJobStatusMutationAllowed(member("owner"), { status: "done" })
    );
  });

  it("allows admin to mutate job status", () => {
    assert.doesNotThrow(() =>
      assertJobStatusMutationAllowed(member("admin"), { status: "in_progress" })
    );
  });

  it("blocks staff/worker from mutating job status with 403 semantics", () => {
    assert.throws(
      () => assertJobStatusMutationAllowed(member("staff"), { status: "done" }),
      /FORBIDDEN/
    );
  });

  it("blocks staff even when status value is unchanged", () => {
    assert.throws(
      () => assertJobStatusMutationAllowed(member("staff"), { status: "new" }),
      /FORBIDDEN/
    );
  });

  it("ignores requests without status field", () => {
    assert.doesNotThrow(() => assertJobStatusMutationAllowed(member("staff"), {}));
    assert.doesNotThrow(() =>
      assertJobStatusMutationAllowed(member("staff"), { customerName: "X" })
    );
  });

  it("detects actual status changes only", () => {
    assert.equal(isJobStatusChange({ status: "done" }, "new"), true);
    assert.equal(isJobStatusChange({ status: "new" }, "new"), false);
    assert.equal(isJobStatusChange({}, "new"), false);
  });

  it("enforces tenant-specific roles: staff in A denied, admin in B allowed", () => {
    const staffInCompanyA = member("staff");
    const adminInCompanyB = member("admin");

    assert.throws(
      () => assertJobStatusMutationAllowed(staffInCompanyA, { status: "done" }),
      /FORBIDDEN/
    );
    assert.doesNotThrow(() =>
      assertJobStatusMutationAllowed(adminInCompanyB, { status: "done" })
    );
  });
});

describe("job status mutation side effects", () => {
  it("denied staff request leaves Job.status unchanged in database", async () => {
    const admin = await createTestUser("job-perm-admin");
    const worker = await createTestUser("job-perm-worker");
    const company = await createTestCompany("Firma Perm");
    const job = await createTestJob({
      companyId: company.id,
      createdByUserId: admin.id,
      status: "new",
    });

    assert.throws(
      () =>
        assertJobStatusMutationAllowed(
          { role: "staff", scope: "assigned_only", userId: worker.id, isActive: true },
          { status: "done" }
        ),
      /FORBIDDEN/
    );

    const unchanged = await prisma.job.findUnique({ where: { id: job.id } });
    assert.equal(unchanged?.status, "new");

    await cleanup({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("denied staff request does not create job.status_changed notification", async () => {
    const admin = await createTestUser("job-perm-notif-admin");
    const worker = await createTestUser("job-perm-notif-worker");
    const company = await createTestCompany("Firma Perm Notif");
    const job = await createTestJob({
      companyId: company.id,
      createdByUserId: admin.id,
      status: "new",
    });

    assert.throws(
      () =>
        assertJobStatusMutationAllowed(
          { role: "staff", scope: "assigned_only", userId: worker.id, isActive: true },
          { status: "done" }
        ),
      /FORBIDDEN/
    );

    const count = await prisma.notification.count({
      where: { type: JOB_NOTIFICATION_TYPES.STATUS_CHANGED, userId: worker.id },
    });
    assert.equal(count, 0);

    await cleanup({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });

  it("authorized admin status change can still notify assigned workers", async () => {
    const admin = await createTestUser("job-perm-ok-admin");
    const worker = await createTestUser("job-perm-ok-worker");
    const company = await createTestCompany("Firma Perm OK");
    await prisma.companyMember.createMany({
      data: [
        { companyId: company.id, userId: admin.id, role: "admin", scope: "all", isActive: true },
        { companyId: company.id, userId: worker.id, role: "staff", scope: "assigned_only", isActive: true },
      ],
    });
    const job = await createTestJob({
      companyId: company.id,
      createdByUserId: admin.id,
      status: "new",
    });

    assert.doesNotThrow(() =>
      assertJobStatusMutationAllowed(
        { role: "admin", scope: "all", userId: admin.id, isActive: true },
        { status: "in_progress" }
      )
    );

    await prisma.job.update({
      where: { id: job.id },
      data: { status: "in_progress", statusUpdatedAt: new Date() },
    });

    await notifyJobStatusChange({
      context: {
        companyId: company.id,
        companyName: company.name,
        jobId: job.id,
        jobNumber: job.jobNumber,
        customerName: job.customerName,
        actorUserId: admin.id,
      },
      previousStatus: "new",
      newStatus: "in_progress",
      assignedToUids: [worker.id],
    });

    const notifications = await prisma.notification.findMany({ where: { userId: worker.id } });
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, JOB_NOTIFICATION_TYPES.STATUS_CHANGED);

    await cleanup({
      userIds: [admin.id, worker.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });
});

describe("job status route guards", () => {
  it("PATCH route enforces owner/admin before status mutation", async () => {
    const source = await readFile("app/api/companies/[companyId]/jobs/[jobId]/route.ts", "utf8");
    assert.match(source, /assertJobStatusMutationAllowed/);
    assert.match(source, /requireActiveMember/);
    const statusAssignIndex = source.indexOf("data.status = body.status");
    const assertIndex = source.indexOf("assertJobStatusMutationAllowed");
    assert.ok(assertIndex !== -1);
    assert.ok(statusAssignIndex !== -1);
    assert.ok(assertIndex < statusAssignIndex);
  });

  it("PATCH route still blocks staff from assignment and detail fields separately", async () => {
    const source = await readFile("app/api/companies/[companyId]/jobs/[jobId]/route.ts", "utf8");
    assert.match(source, /assignedToUids[\s\S]*FORBIDDEN/);
    assert.match(source, /hasJobDetailPatchKeys[\s\S]*FORBIDDEN/);
  });

  it("job detail page hides editable status control from workers", async () => {
    const source = await readFile("app/jobs/[jobId]/page.tsx", "utf8");
    assert.match(source, /isOwnerOrAdmin \? \(/);
    assert.match(source, /formatJobStatusLabel\(job\.status\)/);
  });

  it("stage permissions module remains separate from job status mutation", async () => {
    const stageSource = await readFile("lib/server/jobs/stage-permissions.ts", "utf8");
    const statusSource = await readFile("lib/server/jobs/job-status-mutation.ts", "utf8");
    assert.doesNotMatch(statusSource, /JobStage/);
    assert.match(stageSource, /staff/);
  });
});
