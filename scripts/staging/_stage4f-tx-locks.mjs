/**
 * Stage 4F — transaction + pg_advisory_xact_lock + concurrent Job number verification.
 * Creates temporary rows under a dedicated marker company, then deletes them.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import {
  assertSupabaseStaging,
  loadStagingEnv,
  maskUrl,
  withPoolParams,
  writeJson,
} from "./_stage4f-lib.mjs";

const env = loadStagingEnv();
const host = assertSupabaseStaging(env);
const url = withPoolParams(env.DATABASE_URL, {
  connectionLimit: 3,
  poolTimeout: 30,
});

const prisma = new PrismaClient({ datasources: { db: { url } } });
const marker = `stage4f-tx-${Date.now()}`;

/** Mirrors lib/server/jobs/job-number.ts signed-int64 key. */
function companyAdvisoryLockKey(companyId) {
  let k1 = 0;
  let k2 = 0;
  for (let i = 0; i < companyId.length; i++) {
    const c = companyId.charCodeAt(i);
    k1 = (Math.imul(k1, 31) + c) | 0;
    k2 = (Math.imul(k2, 37) + c) | 0;
  }
  const unsigned = (BigInt(k1 >>> 0) << BigInt(32)) | BigInt(k2 >>> 0);
  return BigInt.asIntN(64, unsigned);
}

async function allocateNextJobNumber(tx, companyId) {
  const lockKey = companyAdvisoryLockKey(companyId);
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${lockKey})`);
  const agg = await tx.job.aggregate({
    where: { companyId },
    _max: { jobNumber: true },
  });
  return (agg._max.jobNumber ?? 0) + 1;
}

function tempJobData({ companyId, jobNumber, customerName, createdByUserId }) {
  return {
    companyId,
    jobNumber,
    customerName,
    customerPhone: "000000000",
    addressCity: "stage4f",
    addressStreet: "probe",
    description: marker,
    priority: "normal",
    status: "new",
    statusUpdatedAt: new Date(),
    createdByUserId,
  };
}

const report = {
  stage: "4F",
  mode: "tx-locks",
  at: new Date().toISOString(),
  runtime: maskUrl(url),
  host,
  marker,
  checks: {},
  cleanup: {},
};

let companyId = null;
let ownerId = null;

try {
  // --- normal transaction commit ---
  const commitUser = await prisma.$transaction(async (tx) => {
    return tx.user.create({
      data: {
        email: `${marker}.owner@example.invalid`,
        passwordHash: null,
        displayName: marker,
      },
      select: { id: true, email: true },
    });
  });
  ownerId = commitUser.id;
  report.checks.tx_commit = { ok: true, userId: ownerId };

  // --- interactive rollback ---
  let rollbackCaught = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          email: `${marker}.rollback@example.invalid`,
          passwordHash: null,
        },
      });
      throw new Error("intentional rollback");
    });
  } catch (e) {
    rollbackCaught = e instanceof Error && e.message === "intentional rollback";
  }
  const rollbackGhost = await prisma.user.findUnique({
    where: { email: `${marker}.rollback@example.invalid` },
  });
  report.checks.tx_rollback = {
    ok: rollbackCaught && !rollbackGhost,
    rollbackCaught,
    ghostExists: Boolean(rollbackGhost),
  };

  // --- company for job-number tests ---
  const company = await prisma.company.create({
    data: {
      name: marker,
      members: {
        create: { userId: ownerId, role: "owner" },
      },
    },
    select: { id: true },
  });
  companyId = company.id;

  // --- advisory lock smoke ---
  const lockKey = companyAdvisoryLockKey(companyId);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${lockKey})`);
  });
  report.checks.advisory_lock = { ok: true, lockKey: String(lockKey) };

  // --- sequential allocate ---
  const sequential = [];
  for (let i = 0; i < 3; i++) {
    const n = await prisma.$transaction(async (tx) => {
      const jobNumber = await allocateNextJobNumber(tx, companyId);
      await tx.job.create({
        data: tempJobData({
          companyId,
          jobNumber,
          customerName: `${marker}-seq-${i}`,
          createdByUserId: ownerId,
        }),
        select: { id: true, jobNumber: true },
      });
      return jobNumber;
    });
    sequential.push(n);
  }
  report.checks.sequential_job_numbers = {
    ok: sequential.join(",") === "1,2,3",
    numbers: sequential,
  };

  // --- concurrent allocate (multiple clients, same company) ---
  const workers = Array.from({ length: 8 }, () => {
    return new PrismaClient({
      datasources: {
        db: { url: withPoolParams(env.DATABASE_URL, { connectionLimit: 1, poolTimeout: 30 }) },
      },
    });
  });

  const concurrentResults = await Promise.all(
    workers.map(async (client, idx) => {
      try {
        return await client.$transaction(async (tx) => {
          const jobNumber = await allocateNextJobNumber(tx, companyId);
          const job = await tx.job.create({
            data: tempJobData({
              companyId,
              jobNumber,
              customerName: `${marker}-conc-${idx}`,
              createdByUserId: ownerId,
            }),
            select: { id: true, jobNumber: true },
          });
          return { ok: true, jobNumber: job.jobNumber };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, message: message.slice(0, 240) };
      }
    })
  );

  await Promise.all(workers.map((c) => c.$disconnect().catch(() => {})));

  const concurrentNumbers = concurrentResults
    .filter((r) => r.ok)
    .map((r) => r.jobNumber)
    .sort((a, b) => a - b);
  const unique = new Set(concurrentNumbers);
  report.checks.concurrent_job_numbers = {
    ok:
      concurrentResults.every((r) => r.ok) &&
      unique.size === concurrentNumbers.length &&
      concurrentNumbers.length === 8 &&
      concurrentNumbers[0] === 4 &&
      concurrentNumbers[7] === 11,
    attempted: 8,
    succeeded: concurrentNumbers.length,
    numbers: concurrentNumbers,
    unique: unique.size,
    duplicates: concurrentNumbers.length - unique.size,
    failures: concurrentResults.filter((r) => !r.ok),
  };
} catch (error) {
  report.fatal = error instanceof Error ? error.message : String(error);
} finally {
  try {
    if (companyId) {
      await prisma.job.deleteMany({ where: { companyId } });
      await prisma.companyMember.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
    }
    await prisma.user.deleteMany({
      where: { email: { startsWith: marker } },
    });
    // Also catch rollback email if somehow present
    await prisma.user.deleteMany({
      where: { email: { contains: marker } },
    });
    const leftoverUsers = await prisma.user.count({
      where: { email: { contains: marker } },
    });
    const leftoverCompanies = await prisma.company.count({
      where: { name: marker },
    });
    const leftoverJobs = companyId
      ? await prisma.job.count({ where: { companyId } })
      : 0;
    report.cleanup = {
      ok: leftoverUsers === 0 && leftoverCompanies === 0 && leftoverJobs === 0,
      leftoverUsers,
      leftoverCompanies,
      leftoverJobs,
    };
  } catch (cleanupError) {
    report.cleanup = {
      ok: false,
      error:
        cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError),
    };
  }
  await prisma.$disconnect().catch(() => {});
}

const counts = await (async () => {
  const p = new PrismaClient({
    datasources: {
      db: {
        url: withPoolParams(env.DATABASE_URL, {
          connectionLimit: 1,
          poolTimeout: 20,
        }),
      },
    },
  });
  try {
    const rows = await p.$queryRaw`
      SELECT
        (SELECT COUNT(*)::int FROM "User") AS users,
        (SELECT COUNT(*)::int FROM "Company") AS companies,
        (SELECT COUNT(*)::int FROM "Job") AS jobs
    `;
    return rows[0];
  } finally {
    await p.$disconnect();
  }
})();

report.counts_after = counts;
report.passed =
  report.checks.tx_commit?.ok &&
  report.checks.tx_rollback?.ok &&
  report.checks.advisory_lock?.ok &&
  report.checks.sequential_job_numbers?.ok &&
  report.checks.concurrent_job_numbers?.ok &&
  report.cleanup?.ok;

writeJson("scripts/staging/_stage4f-tx-locks.json", report);
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 1);
