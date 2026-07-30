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
      sessionVersion: true,
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

/**
 * Resolve deactivated employer state from the narrowly scoped recovery cookie.
 * Binds claims to User.id + companyId + sessionVersion (replay after recover fails).
 */
export async function getDeactivatedAccountStateFromAccess(
  now = new Date()
): Promise<DeactivatedAccountState | null> {
  const { getVerifiedDeactivatedAccess } = await import("./deactivated-account-access");
  const claims = await getVerifiedDeactivatedAccess();
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { sessionVersion: true, isActive: true },
  });
  if (!user || user.isActive) return null;
  if (user.sessionVersion !== claims.sessionVersion) return null;

  const state = await resolveDeactivatedEmployerAccountState(claims.userId, now);
  if (!state) return null;
  if (state.companyId !== claims.companyId) return null;
  return state;
}
