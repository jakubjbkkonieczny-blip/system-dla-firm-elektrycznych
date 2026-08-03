import "server-only";
import { Prisma } from "@prisma/client";

import { companyAdvisoryLockKey } from "@/lib/server/jobs/job-advisory-lock-key";

type JobNumberDb = {
  $executeRaw: (query: ReturnType<typeof Prisma.sql>) => Promise<unknown>;
  job: {
    aggregate: (args: {
      where: { companyId: string };
      _max: { jobNumber: true };
    }) => Promise<{ _max: { jobNumber: number | null } }>;
  };
};

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

export { companyAdvisoryLockKey } from "@/lib/server/jobs/job-advisory-lock-key";
