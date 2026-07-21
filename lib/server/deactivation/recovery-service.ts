import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { isPermanentDeletionPending } from "./lifecycle";

export type RecoveryStatus = "recovered" | "already_recovered";

export type RecoveryOutcome = {
  status: RecoveryStatus;
  userId: string;
  companyId: string;
  recoveredAt: Date;
};

async function resolveTargetDeactivatedCompanyId(
  actorUserId: string,
  tx: Prisma.TransactionClient
): Promise<string> {
  const ownerMemberships = await tx.companyMember.findMany({
    where: {
      userId: actorUserId,
      role: "owner",
    },
    include: {
      company: {
        select: {
          id: true,
          isActive: true,
          deactivatedAt: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const deactivatedOwned = ownerMemberships.filter(
    (membership) => !membership.company.isActive && membership.company.deactivatedAt
  );

  if (deactivatedOwned.length === 0) {
    throw new Error("NOT_DEACTIVATED");
  }

  if (deactivatedOwned.length > 1) {
    throw new Error("MULTIPLE_OWNED_COMPANIES");
  }

  return deactivatedOwned[0].companyId;
}

async function buildAlreadyRecoveredOutcome(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  targetCompanyId: string,
  recoveredAt: Date
): Promise<RecoveryOutcome> {
  return {
    status: "already_recovered",
    userId: actorUserId,
    companyId: targetCompanyId,
    recoveredAt,
  };
}

export async function recoverEmployerAccount(actorUserId: string): Promise<RecoveryOutcome> {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUnique({
      where: { id: actorUserId },
      select: {
        id: true,
        accountRole: true,
        isActive: true,
        deactivatedAt: true,
        scheduledDeletionAt: true,
        updatedAt: true,
      },
    });

    if (!actor) {
      throw new Error("USER_NOT_FOUND");
    }

    if (actor.accountRole !== "employer") {
      throw new Error("FORBIDDEN");
    }

    if (actor.isActive && !actor.deactivatedAt) {
      const activeOwnerMembership = await tx.companyMember.findFirst({
        where: {
          userId: actorUserId,
          role: "owner",
          isActive: true,
          company: { isActive: true },
        },
        select: { companyId: true },
      });

      if (activeOwnerMembership) {
        const recoveredAudit = await tx.auditLog.findFirst({
          where: {
            userId: actorUserId,
            companyId: activeOwnerMembership.companyId,
            action: "employer_account_recovered",
          },
          orderBy: { createdAt: "desc" },
        });

        if (recoveredAudit) {
          return buildAlreadyRecoveredOutcome(
            tx,
            actorUserId,
            activeOwnerMembership.companyId,
            recoveredAudit.createdAt
          );
        }
      }

      throw new Error("NOT_DEACTIVATED");
    }

    if (!actor.deactivatedAt) {
      throw new Error("NOT_DEACTIVATED");
    }

    const targetCompanyId = await resolveTargetDeactivatedCompanyId(actorUserId, tx);

    const [company, ownerMembership] = await Promise.all([
      tx.company.findUnique({
        where: { id: targetCompanyId },
        select: {
          id: true,
          isActive: true,
          deactivatedAt: true,
          scheduledDeletionAt: true,
          updatedAt: true,
        },
      }),
      tx.companyMember.findFirst({
        where: {
          userId: actorUserId,
          companyId: targetCompanyId,
          role: "owner",
        },
        select: { isActive: true },
      }),
    ]);

    if (!company || !ownerMembership) {
      throw new Error("FORBIDDEN");
    }

    if (company.isActive && actor.isActive && ownerMembership.isActive) {
      return buildAlreadyRecoveredOutcome(tx, actorUserId, targetCompanyId, company.updatedAt);
    }

    if (!company.deactivatedAt || company.isActive) {
      throw new Error("DEACTIVATION_STATE_INCONSISTENT");
    }

    const now = new Date();
    if (isPermanentDeletionPending(false, company.scheduledDeletionAt, now)) {
      throw new Error("RECOVERY_WINDOW_EXPIRED");
    }

    const previousState = {
      userActive: actor.isActive,
      userDeactivatedAt: actor.deactivatedAt?.toISOString() ?? null,
      userScheduledDeletionAt: actor.scheduledDeletionAt?.toISOString() ?? null,
      companyActive: company.isActive,
      companyDeactivatedAt: company.deactivatedAt.toISOString(),
      companyScheduledDeletionAt: company.scheduledDeletionAt?.toISOString() ?? null,
      ownerMembershipActive: ownerMembership.isActive,
    };

    const userUpdate = await tx.user.updateMany({
      where: { id: actorUserId, isActive: false },
      data: {
        isActive: true,
        deactivatedAt: null,
        scheduledDeletionAt: null,
        sessionVersion: { increment: 1 },
      },
    });

    if (userUpdate.count === 0) {
      const refreshedUser = await tx.user.findUnique({
        where: { id: actorUserId },
        select: { isActive: true, deactivatedAt: true, updatedAt: true },
      });

      if (refreshedUser?.isActive && !refreshedUser.deactivatedAt) {
        return buildAlreadyRecoveredOutcome(
          tx,
          actorUserId,
          targetCompanyId,
          refreshedUser.updatedAt
        );
      }

      throw new Error("RECOVERY_STATE_INCONSISTENT");
    }

    const companyUpdate = await tx.company.updateMany({
      where: { id: targetCompanyId, isActive: false },
      data: {
        isActive: true,
        deactivatedAt: null,
        scheduledDeletionAt: null,
      },
    });

    if (companyUpdate.count === 0) {
      throw new Error("RECOVERY_STATE_INCONSISTENT");
    }

    await tx.companyMember.updateMany({
      where: {
        userId: actorUserId,
        companyId: targetCompanyId,
        role: "owner",
      },
      data: { isActive: true },
    });

    await tx.auditLog.create({
      data: {
        companyId: targetCompanyId,
        userId: actorUserId,
        action: "employer_account_recovered",
        entityType: "Company",
        entityId: targetCompanyId,
        data: {
          actorUserId,
          targetCompanyId,
          previousState,
          newState: {
            userActive: true,
            userDeactivatedAt: null,
            userScheduledDeletionAt: null,
            companyActive: true,
            companyDeactivatedAt: null,
            companyScheduledDeletionAt: null,
            ownerMembershipActive: true,
          },
          recoveredAt: now.toISOString(),
        },
      },
    });

    return {
      status: "recovered",
      userId: actorUserId,
      companyId: targetCompanyId,
      recoveredAt: now,
    };
  });
}
