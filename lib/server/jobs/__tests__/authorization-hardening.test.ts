import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import Module from "node:module";
import { before, describe, it } from "node:test";
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

// tsx does not apply Next's server-only alias. Point that marker at Next's empty
// module so these tests can execute the real membership helper.
const nodeRequire = createRequire(import.meta.url);
const moduleResolver = Module as unknown as {
  _resolveFilename: (
    request: string,
    parent: NodeJS.Module | null | undefined,
    isMain: boolean,
    options?: object
  ) => string;
};
const resolveFilename = moduleResolver._resolveFilename;
moduleResolver._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    return nodeRequire.resolve("next/dist/compiled/server-only/empty.js");
  }
  return resolveFilename.call(this, request, parent, isMain, options);
};

let requireJobPhotoAccessForUser: typeof import("@/lib/server/jobs/job-photo-access").requireJobPhotoAccessForUser;

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

describe("requireJobPhotoAccessForUser", () => {
  before(async () => {
    ({ requireJobPhotoAccessForUser } = await import("@/lib/server/jobs/job-photo-access"));
  });

  async function activateBilling(companyId: string) {
    await prisma.company.update({
      where: { id: companyId },
      data: { billingStatus: "active" },
    });
  }

  it("denies a Company A member a job that belongs to Company B", async () => {
    const ownerA = await createTestUser("photo-owner-a", "employer");
    const ownerB = await createTestUser("photo-owner-b", "employer");
    const companyA = await createTestCompany("Firma Photo A");
    const companyB = await createTestCompany("Firma Photo B");
    const ids = {
      userIds: [ownerA.id, ownerB.id],
      companyIds: [companyA.id, companyB.id],
      jobIds: [] as string[],
    };

    try {
      await createMembership({ companyId: companyA.id, userId: ownerA.id, role: "owner" });
      await createMembership({ companyId: companyB.id, userId: ownerB.id, role: "owner" });
      await activateBilling(companyA.id);
      await activateBilling(companyB.id);
      const jobB = await createTestJob({ companyId: companyB.id, createdByUserId: ownerB.id });
      ids.jobIds.push(jobB.id);

      await assert.rejects(
        requireJobPhotoAccessForUser(companyA.id, jobB.id, ownerA.id),
        /JOB_NOT_FOUND/
      );
      await assert.rejects(
        requireJobPhotoAccessForUser(companyB.id, jobB.id, ownerA.id),
        /NOT_MEMBER/
      );
    } finally {
      await cleanup(ids);
    }
  });

  it("denies assigned_only staff an unassigned job and allows an assigned job", async () => {
    const owner = await createTestUser("photo-scope-owner", "employer");
    const staff = await createTestUser("photo-scope-staff");
    const company = await createTestCompany("Firma Photo Scope");
    const ids = {
      userIds: [owner.id, staff.id],
      companyIds: [company.id],
      jobIds: [] as string[],
    };

    try {
      await createMembership({ companyId: company.id, userId: owner.id, role: "owner" });
      await createMembership({
        companyId: company.id,
        userId: staff.id,
        role: "staff",
        scope: "assigned_only",
      });
      await activateBilling(company.id);
      const job = await createTestJob({ companyId: company.id, createdByUserId: owner.id });
      ids.jobIds.push(job.id);

      await assert.rejects(
        requireJobPhotoAccessForUser(company.id, job.id, staff.id),
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

      const allowed = await requireJobPhotoAccessForUser(company.id, job.id, staff.id);
      assert.equal(allowed.userId, staff.id);
      assert.equal(allowed.member.role, "staff");
    } finally {
      await cleanup(ids);
    }
  });

  it("allows owner and admin to access a job in their own company", async () => {
    const owner = await createTestUser("photo-role-owner", "employer");
    const admin = await createTestUser("photo-role-admin", "employer");
    const company = await createTestCompany("Firma Photo Roles");
    const ids = {
      userIds: [owner.id, admin.id],
      companyIds: [company.id],
      jobIds: [] as string[],
    };

    try {
      await createMembership({ companyId: company.id, userId: owner.id, role: "owner" });
      await createMembership({ companyId: company.id, userId: admin.id, role: "admin" });
      await activateBilling(company.id);
      const job = await createTestJob({ companyId: company.id, createdByUserId: owner.id });
      ids.jobIds.push(job.id);

      const ownerAccess = await requireJobPhotoAccessForUser(company.id, job.id, owner.id);
      const adminAccess = await requireJobPhotoAccessForUser(company.id, job.id, admin.id);
      assert.equal(ownerAccess.member.role, "owner");
      assert.equal(adminAccess.member.role, "admin");
    } finally {
      await cleanup(ids);
    }
  });

  it("rejects a non-member and an inactive member", async () => {
    const owner = await createTestUser("photo-member-owner", "employer");
    const inactive = await createTestUser("photo-member-inactive");
    const outsider = await createTestUser("photo-member-outsider");
    const company = await createTestCompany("Firma Photo Members");
    const ids = {
      userIds: [owner.id, inactive.id, outsider.id],
      companyIds: [company.id],
      jobIds: [] as string[],
    };

    try {
      await createMembership({ companyId: company.id, userId: owner.id, role: "owner" });
      await createMembership({
        companyId: company.id,
        userId: inactive.id,
        role: "staff",
        scope: "all",
      });
      await prisma.companyMember.update({
        where: { companyId_userId: { companyId: company.id, userId: inactive.id } },
        data: { isActive: false },
      });
      await activateBilling(company.id);
      const job = await createTestJob({ companyId: company.id, createdByUserId: owner.id });
      ids.jobIds.push(job.id);

      await assert.rejects(
        requireJobPhotoAccessForUser(company.id, job.id, inactive.id),
        /NOT_MEMBER/
      );
      await assert.rejects(
        requireJobPhotoAccessForUser(company.id, job.id, outsider.id),
        /NOT_MEMBER/
      );
    } finally {
      await cleanup(ids);
    }
  });

  it("wires session resolution through the existing membership and job helpers", async () => {
    const source = await readFile("lib/server/jobs/job-photo-access.ts", "utf8");
    const proxy = await readFile("proxy.ts", "utf8");
    const shell = await readFile("components/AppShell.tsx", "utf8");

    assert.match(source, /requireSessionUser/);
    assert.match(source, /requireActiveMember/);
    assert.match(source, /assertMemberCanAccessJob/);
    assert.doesNotMatch(source, /blobPathname/);
    assert.match(proxy, /\/gallery\/:path\*/);

    const galleryAt = shell.indexOf('href="/gallery"');
    const membersAt = shell.indexOf('href="/members"');
    assert.ok(galleryAt > 0);
    assert.ok(membersAt > 0);
    assert.doesNotMatch(shell.slice(galleryAt - 120, galleryAt), /isOwnerOrAdmin/);
    assert.match(shell.slice(membersAt - 80, membersAt), /isOwnerOrAdmin/);
  });
});
