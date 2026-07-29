import { prisma } from "@/lib/db/prisma";
import { canMemberSeeJob, type JobVisibilityMember } from "@/lib/server/jobs/job-visibility";

/**
 * Canonical job/stage visibility for staff scope rules.
 * Loads assignment from DB — never trusts client role/scope/assignment claims.
 */
export async function assertMemberCanAccessJob(
  member: JobVisibilityMember,
  userId: string,
  companyId: string,
  jobId: string
): Promise<void> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId, deletedAt: null },
    select: { id: true },
  });
  if (!job) throw new Error("JOB_NOT_FOUND");

  const assignment = await prisma.jobAssignment.findFirst({
    where: { jobId, userId, companyId },
    select: { id: true },
  });
  if (!canMemberSeeJob(member, userId, assignment ? [userId] : [])) {
    throw new Error("FORBIDDEN");
  }
}

/**
 * Object-level ownership: stage must belong to the authorized company AND job.
 * Knowing a stageId alone is not authorization.
 */
export async function requireCompanyJobStage(
  companyId: string,
  jobId: string,
  stageId: string
): Promise<{ id: string; companyId: string; jobId: string }> {
  const stage = await prisma.jobStage.findFirst({
    where: { id: stageId, companyId, jobId },
    select: { id: true, companyId: true, jobId: true },
  });
  if (!stage) throw new Error("STAGE_NOT_FOUND");
  return stage;
}
