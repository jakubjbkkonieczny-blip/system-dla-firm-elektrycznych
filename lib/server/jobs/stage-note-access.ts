import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isUserAssignedToJob } from "@/lib/server/jobs/job-assignments";

export type StageNoteMemberRole = "owner" | "admin" | "staff";

export async function assertCanAccessStageNotes(params: {
  companyId: string;
  jobId: string;
  userId: string;
  role: StageNoteMemberRole;
}): Promise<void> {
  const job = await prisma.job.findFirst({
    where: { id: params.jobId, companyId: params.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!job) throw new Error("JOB_NOT_FOUND");

  if (params.role === "owner" || params.role === "admin") return;

  const isAssigned = await isUserAssignedToJob(
    params.jobId,
    params.userId,
    params.companyId
  );
  if (!isAssigned) throw new Error("FORBIDDEN");
}
