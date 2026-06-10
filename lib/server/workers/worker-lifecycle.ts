import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  deriveWorkerMembershipState,
  resolvePendingDeletionAt,
  shouldTombstonePendingWorker,
} from "@/lib/server/workers/worker-membership-state";

export type { WorkerMembershipState } from "@/lib/server/workers/worker-membership-state";
export {
  deriveWorkerMembershipState,
  resolvePendingDeletionAt,
  shouldTombstonePendingWorker,
} from "@/lib/server/workers/worker-membership-state";

/** ORPHAN grace period before tombstone (soft-delete). */
const ORPHAN_CLEANUP_MS = 24 * 60 * 60 * 1000;

/** Tombstone label shown in historical UI references. */
export const TOMBSTONE_DISPLAY_NAME = "Usunięty użytkownik";

/**
 * Placeholder password — auth is blocked by isActive=false before bcrypt runs.
 * Column is NOT NULL; empty string breaks bcrypt.compare().
 */
export const TOMBSTONE_PASSWORD_HASH = "$2b$10$DELETED.ACCOUNT.PASSWORD.CLEARED.NO.LOGIN";

const CLEANUP_BATCH_SIZE = 100;

export async function countActiveCompanyMemberships(userId: string): Promise<number> {
  return prisma.companyMember.count({
    where: {
      userId,
      isActive: true,
      company: { isActive: true },
    },
  });
}

/** All CompanyMember rows for a user (any isActive, any company.isActive). */
export async function countCompanyMemberships(userId: string): Promise<number> {
  return prisma.companyMember.count({
    where: { userId },
  });
}

/**
 * ORPHAN: worker removed from all companies (zero CompanyMember rows).
 * SUSPENDED: still belongs to a company but has no active access — not orphaned.
 * Sets pendingDeletionAt only for ORPHAN; clears it for ACTIVE and SUSPENDED.
 */
export async function syncWorkerOrphanState(userId: string): Promise<void> {
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

  // Idempotent ORPHAN countdown — do not reset an already-running 24h timer.
  if (state === "ORPHAN" && user.pendingDeletionAt !== null) {
    pendingDeletionAt = user.pendingDeletionAt;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { pendingDeletionAt },
  });
}

/** Clears ORPHAN marker when a worker is invited back to a company. */
export async function clearWorkerPendingDeletion(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, accountRole: "worker" },
    data: { pendingDeletionAt: null },
  });
}

function tombstoneEmail(userId: string): string {
  return `removed.${userId}@deleted.invalid`;
}

/**
 * DEACTIVATED (tombstone): keeps User.id and all FK-linked history.
 * Never calls prisma.user.delete().
 */
export async function tombstoneWorkerAccount(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      displayName: TOMBSTONE_DISPLAY_NAME,
      email: tombstoneEmail(userId),
      passwordHash: TOMBSTONE_PASSWORD_HASH,
      googleAccessToken: null,
      googleRefreshToken: null,
      pushSubscription: Prisma.DbNull,
      pendingDeletionAt: null,
      sessionVersion: { increment: 1 },
    },
  });
}

export type WorkerOrphanCleanupResult = {
  scanned: number;
  tombstoned: number;
  skipped: number;
};

/**
 * Tombstones true ORPHAN workers (pendingDeletionAt > 24h, zero CompanyMember rows).
 * Processes in batches for safe scale (4000+ users).
 */
export async function cleanupPendingWorkers(): Promise<WorkerOrphanCleanupResult> {
  const cutoff = new Date(Date.now() - ORPHAN_CLEANUP_MS);
  let scanned = 0;
  let tombstoned = 0;
  let skipped = 0;

  for (;;) {
    const candidates = await prisma.user.findMany({
      where: {
        accountRole: "worker",
        isActive: true,
        pendingDeletionAt: { lte: cutoff },
      },
      select: { id: true },
      take: CLEANUP_BATCH_SIZE,
      orderBy: { pendingDeletionAt: "asc" },
    });

    if (candidates.length === 0) {
      break;
    }

    scanned += candidates.length;

    for (const candidate of candidates) {
      const totalCount = await countCompanyMemberships(candidate.id);

      if (!shouldTombstonePendingWorker(totalCount)) {
        await prisma.user.update({
          where: { id: candidate.id },
          data: { pendingDeletionAt: null },
        });
        skipped += 1;
        continue;
      }

      await tombstoneWorkerAccount(candidate.id);
      tombstoned += 1;
    }

    if (candidates.length < CLEANUP_BATCH_SIZE) {
      break;
    }
  }

  return { scanned, tombstoned, skipped };
}
