import "server-only";
import { prisma } from "@/lib/db/prisma";
import { normalizeJobPriority } from "@/lib/server/jobs/job-priority";

export type JobVisibilityMember = {
  role: string;
  scope: string | null;
};

type CompanyMemberCounter = {
  companyMember: {
    count: (args: {
      where: {
        companyId: string;
        userId: { in: string[] };
        isActive: boolean;
      };
    }) => Promise<number>;
  };
};

type JobAssignmentSyncClient = {
  jobAssignment: {
    deleteMany: (args: { where: { jobId: string } }) => Promise<unknown>;
    create: (args: {
      data: {
        companyId: string;
        jobId: string;
        userId: string;
        assignedByUserId: string;
      };
    }) => Promise<unknown>;
  };
};

export function normalizeAssignedToUids(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = input
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return Array.from(new Set(out));
}

export function readAssignedToUids(job: { assignments: { userId: string }[] }): string[] {
  return job.assignments.map((a) => a.userId);
}

export function canMemberSeeJob(
  member: JobVisibilityMember,
  userId: string,
  assignedIds: string[]
): boolean {
  const role = String(member.role || "staff");
  const scope = String(member.scope || "all");
  if (role === "owner" || role === "admin") return true;
  return assignedIds.includes(userId) || scope === "all";
}

export function jobWithAssignmentFields<
  T extends { assignments: { userId: string }[]; priority?: string },
>(
  job: T
): Omit<T, "assignments"> & {
  priority: ReturnType<typeof normalizeJobPriority>;
  assignedToUids: string[];
  assignedTo: string | null;
} {
  const assignedToUids = readAssignedToUids(job);
  const { assignments: _assignments, priority: rawPriority, ...rest } = job;
  return {
    ...rest,
    priority: normalizeJobPriority(rawPriority),
    assignedToUids,
    assignedTo: assignedToUids[0] || null,
  };
}

export async function validateAssignedMembers(
  db: CompanyMemberCounter,
  companyId: string,
  assignedToUids: string[]
): Promise<void> {
  if (assignedToUids.length === 0) return;

  const valid = await db.companyMember.count({
    where: {
      companyId,
      userId: { in: assignedToUids },
      isActive: true,
    },
  });
  if (valid !== assignedToUids.length) {
    throw new Error("INVALID_ASSIGNEES");
  }
}

export async function syncJobAssignments(
  db: JobAssignmentSyncClient,
  params: {
    companyId: string;
    jobId: string;
    assignedToUids: string[];
    assignedByUserId: string;
  }
): Promise<void> {
  const { companyId, jobId, assignedToUids, assignedByUserId } = params;

  await db.jobAssignment.deleteMany({ where: { jobId } });
  for (const assigneeId of assignedToUids) {
    await db.jobAssignment.create({
      data: {
        companyId,
        jobId,
        userId: assigneeId,
        assignedByUserId,
      },
    });
  }
}

export async function getJobPrimaryAssigneeId(jobId: string): Promise<string | null> {
  const a = await prisma.jobAssignment.findFirst({
    where: { jobId },
    orderBy: { assignedAt: "asc" },
    select: { userId: true },
  });
  return a?.userId ?? null;
}

/** True when user has a JobAssignment row for this job (company-scoped when companyId provided). */
export async function isUserAssignedToJob(
  jobId: string,
  userId: string,
  companyId?: string
): Promise<boolean> {
  const row = await prisma.jobAssignment.findFirst({
    where: {
      jobId,
      userId,
      ...(companyId ? { companyId } : {}),
    },
    select: { id: true },
  });
  return row !== null;
}
