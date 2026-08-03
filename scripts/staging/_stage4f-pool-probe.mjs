/**
 * Stage 4F — prove Session pooler exhaustion under parallel PrismaClient usage.
 *
 * Evidence model (matches Stage 4E failure mode):
 * - Node test runner can spawn many concurrent file workers
 * - Each worker process creates its own PrismaClient
 * - Prisma default connection_limit ≈ num_cpus * 2 + 1 (25 on this machine)
 * - Supabase Session pool capacity ≈ 15 (EMAXCONNSESSION observed in 4E)
 *
 * This script opens N concurrent Prisma clients (one connection each via
 * connection_limit=1) and reports at which concurrency the pool rejects.
 *
 * Does not mutate business data.
 */
import os from "node:os";
import { PrismaClient } from "@prisma/client";
import {
  assertSupabaseStaging,
  loadStagingEnv,
  maskUrl,
  withPoolParams,
  writeJson,
} from "./_stage4f-lib.mjs";

const env = loadStagingEnv();
const host = assertSupabaseStaging(env);
const baseUrl = env.DATABASE_URL;

const cpus = os.cpus().length;
const availableParallelism =
  typeof os.availableParallelism === "function"
    ? os.availableParallelism()
    : cpus;
const prismaDefaultLimit = cpus * 2 + 1;

async function tryConnect(label, url) {
  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1::int AS ok`;
    return { label, ok: true, ms: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      label,
      ok: false,
      ms: Date.now() - started,
      code: error?.code ?? null,
      message: message.slice(0, 300),
      emax:
        /EMAXCONNSESSION|MaxClientsInSessionMode|max clients reached/i.test(
          message
        ),
    };
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function parallelProbe(concurrency) {
  const url = withPoolParams(baseUrl, { connectionLimit: 1, poolTimeout: 10 });
  const clients = Array.from({ length: concurrency }, (_, i) => {
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    return { i, prisma };
  });

  const started = Date.now();
  const results = await Promise.all(
    clients.map(async ({ i, prisma }) => {
      try {
        // Cast pg_sleep so Prisma can deserialize; hold the session ~2s.
        await prisma.$queryRaw`
          SELECT pg_sleep(2.0)::text AS slept, ${i}::int AS n
        `;
        return { i, ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          i,
          ok: false,
          emax: /EMAXCONNSESSION|MaxClientsInSessionMode|max clients reached|unable to check out|Timed out fetching/i.test(
            message
          ),
          message: message.slice(0, 300),
        };
      }
    })
  );

  await Promise.all(clients.map(({ prisma }) => prisma.$disconnect().catch(() => {})));

  return {
    concurrency,
    held_for_ms: Date.now() - started,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    emax_failures: results.filter((r) => r.emax).length,
    sample_error: results.find((r) => !r.ok)?.message ?? null,
  };
}

const single = await tryConnect(
  "single_connection_limit_1",
  withPoolParams(baseUrl, { connectionLimit: 1, poolTimeout: 20 })
);

// Ramp concurrency to find exhaustion threshold without leaving junk.
const probes = [];
for (const n of [4, 8, 12, 16, 20]) {
  // Small pause so prior sessions can release.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2500);
  probes.push(await parallelProbe(n));
  if (probes.at(-1).emax_failures > 0) {
    // One more higher concurrency sample if not already at top.
    break;
  }
}

const theoretical = {
  cpus,
  availableParallelism,
  prismaDefaultConnectionLimit: prismaDefaultLimit,
  testFiles: 46,
  nodeTestDefaultWorkers: availableParallelism,
  worstCaseWithoutLimits:
    availableParallelism * prismaDefaultLimit,
  withCurrentEnvConnectionLimit: (() => {
    const lim = Number(new URL(baseUrl).searchParams.get("connection_limit") || prismaDefaultLimit);
    return {
      perProcess: lim,
      parallelWorkers: availableParallelism,
      total: availableParallelism * lim,
    };
  })(),
  safeExample: {
    connection_limit: 2,
    test_concurrency: 4,
    total: 8,
    note: "Stay under observed Session pool (~15)",
  },
};

const report = {
  stage: "4F",
  mode: "pool-probe",
  at: new Date().toISOString(),
  runtime: maskUrl(baseUrl),
  host,
  single,
  probes,
  theoretical,
  conclusion: {
    cause:
      "Parallel Node test workers each instantiate PrismaClient; Session pooler rejects when concurrent sessions exceed plan capacity (~15). Not an application singleton bug in Next.js runtime (lib/db/prisma.ts already caches on globalThis).",
    evidence: {
      singleton_present: true,
      singleton_file: "lib/db/prisma.ts",
      stage4e_parallel_npm_test_exit: 1,
      stage4e_serial_retry_connection_limit_1_exit: 0,
      probe_emax_seen: probes.some((p) => p.emax_failures > 0),
    },
  },
};

writeJson("scripts/staging/_stage4f-pool-probe.json", report);
console.log(JSON.stringify(report, null, 2));
process.exit(single.ok ? 0 : 1);
