import { PrismaClient, Prisma } from "@prisma/client";
import { loadEnvFile, ROOT } from "./_stage4f-lib.mjs";

const env = {
  ...loadEnvFile(`${ROOT}/.env`),
  ...loadEnvFile(`${ROOT}/.env.local`),
};
const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
});

function companyAdvisoryLockKey(companyId) {
  let k1 = 0;
  let k2 = 0;
  for (let i = 0; i < companyId.length; i++) {
    const c = companyId.charCodeAt(i);
    k1 = (Math.imul(k1, 31) + c) | 0;
    k2 = (Math.imul(k2, 37) + c) | 0;
  }
  return {
    k1: k1 >>> 0,
    k2: k2 >>> 0,
    lockKey: (BigInt(k1 >>> 0) << BigInt(32)) | BigInt(k2 >>> 0),
  };
}

const sample = companyAdvisoryLockKey("cmpa5dv4w0001ipjrjwkyfovv");
const results = [];

async function trial(name, fn) {
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx);
    });
    results.push({ name, ok: true });
  } catch (e) {
    results.push({
      name,
      ok: false,
      message: (e instanceof Error ? e.message : String(e)).slice(0, 280),
    });
  }
}

await trial("Prisma.sql BigInt", async (tx) => {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(${sample.lockKey})`
  );
});

await trial("tagged BigInt", async (tx) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${sample.lockKey})`;
});

await trial("string::bigint", async (tx) => {
  const s = sample.lockKey.toString();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${s}::bigint)`;
});

await trial("executeRawUnsafe digits", async (tx) => {
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(${sample.lockKey.toString()})`
  );
});

await trial("two-int form", async (tx) => {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(${sample.k1}::int, ${sample.k2}::int)
  `;
});

await trial("stage4e known key Prisma.sql", async (tx) => {
  const lockKey = BigInt("2261039023543653599");
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${lockKey})`);
});

console.log(JSON.stringify({ sample: { ...sample, lockKey: sample.lockKey.toString() }, results }, null, 2));
await prisma.$disconnect();
process.exit(results.every((r) => r.ok) ? 0 : 1);
