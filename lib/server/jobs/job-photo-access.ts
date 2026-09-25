import "server-only";

import { requireActiveMember, type ActiveMember } from "@/app/api/_lib/membership";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { assertMemberCanAccessJob } from "@/lib/server/jobs/job-stage-ownership";

export type JobPhotoAccess = {
  userId: string;
  member: ActiveMember;
};

/**
 * Job-photo access for the signed-in user.
 * Membership and a company-scoped job row decide access.
 * Storage object paths are not an authorization input.
 */
export async function requireJobPhotoAccess(
  companyId: string,
  jobId: string
): Promise<JobPhotoAccess> {
  const sessionUser = await requireSessionUser();
  return requireJobPhotoAccessForUser(companyId, jobId, sessionUser.id);
}

/**
 * Same checks after User.id is already resolved.
 * assertMemberCanAccessJob loads the job with companyId and deletedAt: null,
 * then applies canMemberSeeJob.
 */
export async function requireJobPhotoAccessForUser(
  companyId: string,
  jobId: string,
  userId: string
): Promise<JobPhotoAccess> {
  const member = await requireActiveMember(companyId, userId);
  await assertMemberCanAccessJob(member, userId, companyId, jobId);
  return { userId, member };
}
