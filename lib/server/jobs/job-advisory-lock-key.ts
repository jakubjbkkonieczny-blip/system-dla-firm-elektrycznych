/**
 * Signed int64 advisory-lock key for per-company job number allocation.
 * Kept free of `server-only` so unit tests can import it.
 */

const INT64_MIN = -((BigInt(2) ** BigInt(63)));
const INT64_MAX = BigInt(2) ** BigInt(63) - BigInt(1);

/**
 * Stable per-company lock key for pg_advisory_xact_lock(bigint).
 * Must fit signed int64 — unsigned 64-bit values are rejected by Prisma/Postgres.
 */
export function companyAdvisoryLockKey(companyId: string): bigint {
  let k1 = 0;
  let k2 = 0;
  for (let i = 0; i < companyId.length; i++) {
    const c = companyId.charCodeAt(i);
    k1 = (Math.imul(k1, 31) + c) | 0;
    k2 = (Math.imul(k2, 37) + c) | 0;
  }
  const unsigned =
    (BigInt(k1 >>> 0) << BigInt(32)) | BigInt(k2 >>> 0);
  return BigInt.asIntN(64, unsigned);
}

export function isSignedInt64(value: bigint): boolean {
  return value >= INT64_MIN && value <= INT64_MAX;
}
