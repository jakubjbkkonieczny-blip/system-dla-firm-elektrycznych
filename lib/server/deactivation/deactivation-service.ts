import { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";

import { prisma } from "@/lib/db/prisma";
import { hasRecentDeactivationVerification } from "./email-verification";
import { getRecoveryDeadline } from "./lifecycle";

export type DeactivationStatus = "deactivated" | "already_deactivated";

export type DeactivationOutcome = {
  status: DeactivationStatus;
  companyId: string;
  userId: string;
  deactivatedAt: Date;
  scheduledDeletionAt: Date;
};

type TransactionResult = DeactivationOutcome & {
  affectedUserIds: string[];
  runWorkerSync: boolean;
};

async function resolveTargetCompanyId(
  actorUserId: string,
  selectedCompanyId: string | null | undefined,
  tx: Prisma.TransactionClient,
  membershipScope: "active" | "any"
): Promise<string> {
  const ownerMemberships = await tx.companyMember.findMany({
    where: {
      userId: actorUserId,
      role: "owner",
      ...(membershipScope === "active" ? { isActive: true } : {}),
    },
    select: { companyId: true },
  });

  if (ownerMemberships.length === 0) {
    throw new Error("NOT_OWNER");
  }

  if (selectedCompanyId) {
    const match = ownerMemberships.some((item) => item.companyId === selectedCompanyId);
    if (!match) {
      throw new Error("FORBIDDEN");
    }
    return selectedCompanyId;
  }

  if (ownerMemberships.length > 1) {
    throw new Error("MULTIPLE_OWNED_COMPANIES");
  }

  return ownerMemberships[0].companyId;
}

async function buildAlreadyDeactivatedOutcome(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  targetCompanyId: string
): Promise<DeactivationOutcome> {
  const [user, company] = await Promise.all([
    tx.user.findUnique({
      where: { id: actorUserId },
      select: { deactivatedAt: true },
    }),
    tx.company.findUnique({
      where: { id: targetCompanyId },
      select: { deactivatedAt: true, scheduledDeletionAt: true },
    }),
  ]);

  if (!user?.deactivatedAt || !company?.deactivatedAt || !company.scheduledDeletionAt) {
    throw new Error("DEACTIVATION_STATE_INCONSISTENT");
  }

  return {
    status: "already_deactivated",
    companyId: targetCompanyId,
    userId: actorUserId,
    deactivatedAt: user.deactivatedAt,
    scheduledDeletionAt: company.scheduledDeletionAt,
  };
}

export type SyncWorkerOrphanStateFn = (userId: string) => Promise<void>;

export type DeactivateEmployerAccountInput = {
  actorUserId: string;
  currentPassword: string;
  companyId?: string | null;
  syncWorkerOrphanStateFn?: SyncWorkerOrphanStateFn;
};

export async function deactivateEmployerAccount(
  input: DeactivateEmployerAccountInput
): Promise<DeactivationOutcome> {
  const { actorUserId, currentPassword, companyId, syncWorkerOrphanStateFn } = input;

  const result = await prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUnique({
      where: { id: actorUserId },
      select: {
        id: true,
        accountRole: true,
        passwordHash: true,
        isActive: true,
        deactivatedAt: true,
      },
    });

    if (!actor) {
      throw new Error("USER_NOT_FOUND");
    }

    if (actor.accountRole !== "employer") {
      throw new Error("FORBIDDEN");
    }

    const passwordMatches = await bcrypt.compare(currentPassword, actor.passwordHash);
    if (!passwordMatches) {
      throw new Error("INVALID_PASSWORD");
    }

    let targetCompanyId: string;
    try {
      targetCompanyId = await resolveTargetCompanyId(actorUserId, companyId, tx, "active");
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_OWNER") {
        targetCompanyId = await resolveTargetCompanyId(actorUserId, companyId, tx, "any");
      } else {
        throw error;
      }
    }

    const company = await tx.company.findUnique({
      where: { id: targetCompanyId },
      select: {
        id: true,
        isActive: true,
        deactivatedAt: true,
        scheduledDeletionAt: true,
      },
    });

    if (!company) {
      throw new Error("COMPANY_NOT_FOUND");
    }

    if (!actor.isActive || !company.isActive) {
      return {
        ...(await buildAlreadyDeactivatedOutcome(tx, actorUserId, targetCompanyId)),
        affectedUserIds: [],
        runWorkerSync: false,
      };
    }

    const hasVerification = await hasRecentDeactivationVerification(actorUserId, tx);
    if (!hasVerification) {
      throw new Error("EMAIL_VERIFICATION_REQUIRED");
    }

    const now = new Date();
    const scheduledDeletionAt = getRecoveryDeadline(now);

    const affectedMembers = await tx.companyMember.findMany({
      where: { companyId: targetCompanyId, isActive: true },
      select: { userId: true },
    });
    const affectedUserIds = Array.from(new Set(affectedMembers.map((member) => member.userId)));

    const userUpdate = await tx.user.updateMany({
      where: { id: actorUserId, isActive: true },
      data: {
        isActive: false,
        deactivatedAt: now,
        sessionVersion: { increment: 1 },
      },
    });

    if (userUpdate.count === 0) {
      return {
        ...(await buildAlreadyDeactivatedOutcome(tx, actorUserId, targetCompanyId)),
        affectedUserIds: [],
        runWorkerSync: false,
      };
    }

    const companyUpdate = await tx.company.updateMany({
      where: { id: targetCompanyId, isActive: true },
      data: {
        isActive: false,
        deactivatedAt: now,
        scheduledDeletionAt,
      },
    });

    if (companyUpdate.count === 0) {
      throw new Error("DEACTIVATION_STATE_INCONSISTENT");
    }

    await tx.companyMember.updateMany({
      where: { companyId: targetCompanyId, isActive: true },
      data: { isActive: false },
    });

    await tx.auditLog.create({
      data: {
        companyId: targetCompanyId,
        userId: actorUserId,
        action: "employer_account_deactivated",
        entityType: "Company",
        entityId: targetCompanyId,
        data: {
          actorUserId,
          targetCompanyId,
          state: {
            companyActive: false,
            userActive: false,
            deactivatedAt: now.toISOString(),
            scheduledDeletionAt: scheduledDeletionAt.toISOString(),
          },
        },
      },
    });

    return {
      status: "deactivated" as const,
      companyId: targetCompanyId,
      userId: actorUserId,
      deactivatedAt: now,
      scheduledDeletionAt,
      affectedUserIds,
      runWorkerSync: true,
    };
  });

  if (result.runWorkerSync && syncWorkerOrphanStateFn) {
    await Promise.all(result.affectedUserIds.map((userId) => syncWorkerOrphanStateFn(userId)));
  }

  return {
    status: result.status,
    companyId: result.companyId,
    userId: result.userId,
    deactivatedAt: result.deactivatedAt,
    scheduledDeletionAt: result.scheduledDeletionAt,
  };
}
