import "server-only";
import { prisma } from "@/lib/db/prisma";

export async function getJobPrimaryAssigneeId(jobId: string): Promise<string | null> {
  const a = await prisma.jobAssignment.findFirst({
    where: { jobId },
    orderBy: { assignedAt: "asc" },
    select: { userId: true },
  });
  return a?.userId ?? null;
}
