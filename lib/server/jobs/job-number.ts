import "server-only";
import { Prisma } from "@prisma/client";

type JobNumberDb = {
  $executeRaw: (query: ReturnType<typeof Prisma.sql>) => Promise<unknown>;
  job: {
    aggregate: (args: {
      where: { companyId: string };
      _max: { jobNumber: true };
    }) => Promise<{ _max: { jobNumber: number | null } }>;
  };
};

/** Stable per-company lock key for pg_advisory_xact_lock(bigint). */
function companyAdvisoryLockKey(companyId: string): bigint {
  let k1 = 0;
  let k2 = 0;
  for (let i = 0; i < companyId.length; i++) {
    const c = companyId.charCodeAt(i);
    k1 = (Math.imul(k1, 31) + c) | 0;
    k2 = (Math.imul(k2, 37) + c) | 0;
  }
  return (BigInt(k1 >>> 0) << BigInt(32)) | BigInt(k2 >>> 0);
}

/**
 * Next sequential job number for a company (1-based, never reused).
 * Uses a transaction-scoped advisory lock to avoid duplicate numbers under concurrency.
 */
export async function allocateNextJobNumber(
  tx: JobNumberDb,
  companyId: string
): Promise<number> {
  const lockKey = companyAdvisoryLockKey(companyId);
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${lockKey})`);

  const agg = await tx.job.aggregate({
    where: { companyId },
    _max: { jobNumber: true },
  });

  return (agg._max.jobNumber ?? 0) + 1;
}
