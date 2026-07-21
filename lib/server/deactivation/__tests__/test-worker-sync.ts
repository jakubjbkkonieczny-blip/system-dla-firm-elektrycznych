import { prisma } from "@/lib/db/prisma";
import {
  deriveWorkerMembershipState,
  resolvePendingDeletionAt,
} from "@/lib/server/workers/worker-membership-state";

async function countActiveCompanyMemberships(userId: string): Promise<number> {
  return prisma.companyMember.count({
    where: {
      userId,
      isActive: true,
      company: { isActive: true },
    },
  });
}

async function countCompanyMemberships(userId: string): Promise<number> {
  return prisma.companyMember.count({
    where: { userId },
  });
}

/** Test double for syncWorkerOrphanState — same behavior, no server-only import. */
export async function testSyncWorkerOrphanState(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountRole: true, isActive: true, pendingDeletionAt: true },
  });

  if (!user || user.accountRole !== "worker" || !user.isActive) {
    return;
  }

  const activeCount = await countActiveCompanyMemberships(userId);
  const totalCount = await countCompanyMemberships(userId);
  const state = deriveWorkerMembershipState(activeCount, totalCount);
  let pendingDeletionAt = resolvePendingDeletionAt(state);

  if (state === "ORPHAN" && user.pendingDeletionAt !== null) {
    pendingDeletionAt = user.pendingDeletionAt;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { pendingDeletionAt },
  });
}
