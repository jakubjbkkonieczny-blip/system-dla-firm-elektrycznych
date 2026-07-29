import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

import { prisma } from "@/lib/db/prisma";
import {
  assertMemberCanAccessJob,
  requireCompanyJobStage,
} from "@/lib/server/jobs/job-stage-ownership";
import { canMemberSeeJob } from "@/lib/server/jobs/job-visibility";
import { assertCanManageTargetMembership } from "@/lib/server/company/member-management-guards";
import { companyRouteErrorStatus } from "@/lib/server/auth/handle-session-route-error";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";

const PASSWORD = "Password123!";

async function createTestUser(emailPrefix: string, accountRole = "worker") {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      email: `${emailPrefix}-${id}@example.com`,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      displayName: `Test ${emailPrefix}`,
      accountRole,
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

async function createMembership(params: {
  companyId: string;
  userId: string;
  role: string;
  scope?: string | null;
}) {
  return prisma.companyMember.create({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      role: params.role,
      scope: params.scope ?? null,
      isActive: true,
    },
  });
}

async function createTestJob(params: {
  companyId: string;
  createdByUserId: string;
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
      status: "new",
      statusUpdatedAt: new Date(),
      createdByUserId: params.createdByUserId,
    },
  });
}

async function createTestStage(params: {
  companyId: string;
  jobId: string;
  name: string;
}) {
  return prisma.jobStage.create({
    data: {
      companyId: params.companyId,
      jobId: params.jobId,
      name: params.name,
      status: "todo",
      sortOrder: 1,
    },
  });
}

async function cleanup(ids: {
  userIds?: string[];
  companyIds?: string[];
  jobIds?: string[];
  stageIds?: string[];
}) {
  if (ids.stageIds?.length) {
    await prisma.jobStage.deleteMany({ where: { id: { in: ids.stageIds } } });
  }
  if (ids.jobIds?.length) {
    await prisma.jobAssignment.deleteMany({ where: { jobId: { in: ids.jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: ids.jobIds } } });
  }
  if (ids.companyIds?.length) {
    await prisma.companyMember.deleteMany({ where: { companyId: { in: ids.companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: ids.companyIds } } });
  }
  if (ids.userIds?.length) {
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }
}

describe("canMemberSeeJob scope rules", () => {
  const userId = "user-1";

  it("allows owner and admin regardless of assignment", () => {
    assert.equal(canMemberSeeJob({ role: "owner", scope: "assigned_only" }, userId, []), true);
    assert.equal(canMemberSeeJob({ role: "admin", scope: "assigned_only" }, userId, []), true);
  });

  it("allows staff with scope=all without assignment", () => {
    assert.equal(canMemberSeeJob({ role: "staff", scope: "all" }, userId, []), true);
  });

  it("allows assigned_only staff only when assigned", () => {
    assert.equal(
      canMemberSeeJob({ role: "staff", scope: "assigned_only" }, userId, []),
      false
    );
    assert.equal(
      canMemberSeeJob({ role: "staff", scope: "assigned_only" }, userId, [userId]),
      true
    );
  });
});

describe("assertCanManageTargetMembership owner protection", () => {
  it("allows owner to manage staff and admin", () => {
    assert.doesNotThrow(() => assertCanManageTargetMembership("owner", "staff"));
    assert.doesNotThrow(() => assertCanManageTargetMembership("owner", "admin"));
  });

  it("allows admin to manage staff", () => {
    assert.doesNotThrow(() => assertCanManageTargetMembership("admin", "staff"));
  });

  it("blocks admin from managing owner", () => {
    assert.throws(
      () => assertCanManageTargetMembership("admin", "owner"),
      /CANNOT_MODIFY_OWNER/
    );
  });

  it("blocks staff from managing owner", () => {
    assert.throws(
      () => assertCanManageTargetMembership("staff", "owner"),
      /CANNOT_MODIFY_OWNER/
    );
  });

  it("allows owner to manage another owner", () => {
    assert.doesNotThrow(() => assertCanManageTargetMembership("owner", "owner"));
  });

  it("maps CANNOT_MODIFY_OWNER to HTTP 400", () => {
    assert.equal(companyRouteErrorStatus("CANNOT_MODIFY_OWNER"), 400);
  });
});

describe("route source contracts — object ownership & owner protection", () => {
  it("etapy_realizacji DELETE verifies company+job+stage before delete", async () => {
    const source = await readFile(
      "app/api/companies/[companyId]/jobs/[jobId]/etapy_realizacji/[stageId]/route.ts",
      "utf8"
    );
    assert.match(source, /requireCompanyJobStage/);
    assert.doesNotMatch(
      source,
      /await prisma\.jobStage\.delete\(\{\s*where:\s*\{\s*id:\s*stageId\s*\}\s*\}\)/
    );
  });

  it("stages DELETE verifies company+job+stage before delete", async () => {
    const source = await readFile(
      "app/api/companies/[companyId]/jobs/[jobId]/stages/[stageId]/route.ts",
      "utf8"
    );
    assert.match(source, /requireCompanyJobStage/);
  });

  it("both stage list GETs use assertMemberCanAccessJob", async () => {
    const etapy = await readFile(
      "app/api/companies/[companyId]/jobs/[jobId]/etapy_realizacji/route.ts",
      "utf8"
    );
    const stages = await readFile(
      "app/api/companies/[companyId]/jobs/[jobId]/stages/route.ts",
      "utf8"
    );
    assert.match(etapy, /assertMemberCanAccessJob/);
    assert.match(stages, /assertMemberCanAccessJob/);
  });

  it("member PATCH/DELETE protect owner membership", async () => {
    const source = await readFile(
      "app/api/companies/[companyId]/members/[memberUid]/route.ts",
      "utf8"
    );
    assert.match(source, /assertCanManageTargetMembership/);
  });
});

describe("requireCompanyJobStage cross-tenant ownership", () => {
  it("allows stage in matching company+job and denies foreign stageId", async () => {
    const ownerA = await createTestUser("authz-owner-a", "employer");
    const ownerB = await createTestUser("authz-owner-b", "employer");
    const companyA = await createTestCompany("Firma Authz A");
    const companyB = await createTestCompany("Firma Authz B");
    await createMembership({ companyId: companyA.id, userId: ownerA.id, role: "owner" });
    await createMembership({ companyId: companyB.id, userId: ownerB.id, role: "owner" });

    const jobA = await createTestJob({ companyId: companyA.id, createdByUserId: ownerA.id });
    const jobB = await createTestJob({ companyId: companyB.id, createdByUserId: ownerB.id });
    const stageA = await createTestStage({
      companyId: companyA.id,
      jobId: jobA.id,
      name: "Etap A",
    });
    const stageB = await createTestStage({
      companyId: companyB.id,
      jobId: jobB.id,
      name: "Etap B",
    });

    const allowed = await requireCompanyJobStage(companyA.id, jobA.id, stageA.id);
    assert.equal(allowed.id, stageA.id);

    await assert.rejects(
      requireCompanyJobStage(companyA.id, jobA.id, stageB.id),
      /STAGE_NOT_FOUND/
    );
    await assert.rejects(
      requireCompanyJobStage(companyA.id, jobB.id, stageB.id),
      /STAGE_NOT_FOUND/
    );

    // Foreign stage remains intact after denied ownership checks.
    const stillThere = await prisma.jobStage.findUnique({ where: { id: stageB.id } });
    assert.equal(stillThere?.id, stageB.id);

    await cleanup({
      userIds: [ownerA.id, ownerB.id],
      companyIds: [companyA.id, companyB.id],
      jobIds: [jobA.id, jobB.id],
      stageIds: [stageA.id, stageB.id],
    });
  });

  it("same-company delete path only removes owned stage", async () => {
    const owner = await createTestUser("authz-delete-owner", "employer");
    const company = await createTestCompany("Firma Delete");
    await createMembership({ companyId: company.id, userId: owner.id, role: "owner" });
    const job = await createTestJob({ companyId: company.id, createdByUserId: owner.id });
    const stage = await createTestStage({
      companyId: company.id,
      jobId: job.id,
      name: "Do usuniecia",
    });

    const existing = await requireCompanyJobStage(company.id, job.id, stage.id);
    await prisma.jobStage.delete({ where: { id: existing.id } });

    const gone = await prisma.jobStage.findUnique({ where: { id: stage.id } });
    assert.equal(gone, null);

    await cleanup({
      userIds: [owner.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });
});

describe("assertMemberCanAccessJob assigned_only", () => {
  it("denies assigned_only staff for unassigned job and allows when assigned", async () => {
    const owner = await createTestUser("scope-owner", "employer");
    const staff = await createTestUser("scope-staff");
    const company = await createTestCompany("Firma Scope");
    await createMembership({ companyId: company.id, userId: owner.id, role: "owner" });
    await createMembership({
      companyId: company.id,
      userId: staff.id,
      role: "staff",
      scope: "assigned_only",
    });
    const job = await createTestJob({ companyId: company.id, createdByUserId: owner.id });

    await assert.rejects(
      assertMemberCanAccessJob(
        { role: "staff", scope: "assigned_only" },
        staff.id,
        company.id,
        job.id
      ),
      /FORBIDDEN/
    );

    await prisma.jobAssignment.create({
      data: {
        companyId: company.id,
        jobId: job.id,
        userId: staff.id,
        assignedByUserId: owner.id,
      },
    });

    await assert.doesNotReject(
      assertMemberCanAccessJob(
        { role: "staff", scope: "assigned_only" },
        staff.id,
        company.id,
        job.id
      )
    );

    await assert.doesNotReject(
      assertMemberCanAccessJob(
        { role: "staff", scope: "all" },
        staff.id,
        company.id,
        job.id
      )
    );

    await cleanup({
      userIds: [owner.id, staff.id],
      companyIds: [company.id],
      jobIds: [job.id],
    });
  });
});

describe("owner membership mutation protection (DB)", () => {
  it("admin cannot deactivate or delete owner membership", async () => {
    const owner = await createTestUser("owner-protect-owner", "employer");
    const admin = await createTestUser("owner-protect-admin", "employer");
    const staff = await createTestUser("owner-protect-staff");
    const company = await createTestCompany("Firma Owner Protect");

    await createMembership({ companyId: company.id, userId: owner.id, role: "owner" });
    await createMembership({ companyId: company.id, userId: admin.id, role: "admin" });
    await createMembership({
      companyId: company.id,
      userId: staff.id,
      role: "staff",
      scope: "assigned_only",
    });

    const ownerMember = await prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId: company.id, userId: owner.id } },
    });
    assert.ok(ownerMember);

    assert.throws(
      () => assertCanManageTargetMembership("admin", ownerMember!.role),
      /CANNOT_MODIFY_OWNER/
    );

    // Staff still manageable by admin (existing product rule).
    assert.doesNotThrow(() => assertCanManageTargetMembership("admin", "staff"));

    const before = await prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId: company.id, userId: owner.id } },
    });
    assert.equal(before?.isActive, true);
    assert.equal(before?.role, "owner");

    await cleanup({
      userIds: [owner.id, admin.id, staff.id],
      companyIds: [company.id],
    });
  });
});
