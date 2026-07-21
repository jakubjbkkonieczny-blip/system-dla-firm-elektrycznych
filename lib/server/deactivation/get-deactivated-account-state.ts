import { prisma } from "@/lib/db/prisma";
import { getRecoveryDeadline, isPermanentDeletionPending, isRecoverable } from "./lifecycle";

export type DeactivatedAccountState = {
  userId: string;
  companyId: string;
  companyName: string;
  deactivatedAt: string;
  recoveryDeadline: string;
  isRecoverable: boolean;
  recoveryExpired: boolean;
};

export async function resolveDeactivatedEmployerAccountState(
  userId: string,
  now = new Date()
): Promise<DeactivatedAccountState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      accountRole: true,
      isActive: true,
      deactivatedAt: true,
      scheduledDeletionAt: true,
    },
  });

  if (!user || user.isActive || !user.deactivatedAt || user.accountRole !== "employer") {
    return null;
  }

  const ownerMembership = await prisma.companyMember.findFirst({
    where: {
      userId,
      role: "owner",
      isActive: false,
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          isActive: true,
          deactivatedAt: true,
          scheduledDeletionAt: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const company = ownerMembership?.company;
  if (!company || company.isActive || !company.deactivatedAt) {
    return null;
  }

  const recoveryDeadline =
    company.scheduledDeletionAt ??
    user.scheduledDeletionAt ??
    getRecoveryDeadline(user.deactivatedAt);

  const recoverable = isRecoverable(false, user.deactivatedAt, recoveryDeadline, now);
  const recoveryExpired = isPermanentDeletionPending(false, recoveryDeadline, now);

  return {
    userId,
    companyId: company.id,
    companyName: company.name,
    deactivatedAt: user.deactivatedAt.toISOString(),
    recoveryDeadline: recoveryDeadline.toISOString(),
    isRecoverable: recoverable,
    recoveryExpired,
  };
}

export async function getDeactivatedAccountStateFromAccess(
  now = new Date()
): Promise<DeactivatedAccountState | null> {
  const { getDeactivatedAccessUserId } = await import("./deactivated-account-access");
  const userId = await getDeactivatedAccessUserId();
  if (!userId) return null;
  return resolveDeactivatedEmployerAccountState(userId, now);
}
