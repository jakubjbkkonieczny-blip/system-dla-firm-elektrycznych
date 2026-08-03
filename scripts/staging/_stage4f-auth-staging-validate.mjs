/**
 * Post-migration cohort + consistency validation (read-only).
 * No password hashes / tokens printed.
 */
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  assertSupabaseStaging,
  loadEnvFile,
  loadStagingEnv,
  withPoolParams,
  writeJson,
  ROOT,
  BASELINE,
} from "./_stage4f-lib.mjs";

const env = {
  ...loadEnvFile(path.join(ROOT, ".env.supabase-staging")),
  ...loadStagingEnv(),
};
assertSupabaseStaging(env);
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: withPoolParams(env.DATABASE_URL, {
        connectionLimit: 1,
        poolTimeout: 30,
      }),
    },
  },
});

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function normalizeEmail(email) {
  if (email == null) return null;
  const n = String(email).trim().toLowerCase();
  if (!n || !n.includes("@")) return null;
  const [local, domain] = n.split("@");
  if (!local || !domain || !domain.includes(".")) return null;
  return n;
}

try {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      passwordHash: true,
      supabaseAuthUserId: true,
      isActive: true,
    },
  });
  const authRows = await prisma.$queryRaw`
    SELECT id::text AS id, email, raw_app_meta_data AS app_metadata,
           encrypted_password IS NOT NULL AS has_encrypted_password
    FROM auth.users
  `;
  const authById = new Map(authRows.map((a) => [a.id, a]));

  const cohorts = {
    active_bcrypt: { expectedBusiness: 1414, linked: 0, authExists: 0, hasEncPassword: 0, resetMeta: 0 },
    inactive_bcrypt: { expectedBusiness: 845, linked: 0, authExists: 0, hasEncPassword: 0, resetMeta: 0 },
    active_placeholder: { expectedBusiness: 909, linked: 0, authExists: 0, hasEncPassword: 0, resetMeta: 0 },
    inactive_placeholder: { expectedBusiness: 436, linked: 0, authExists: 0, hasEncPassword: 0, resetMeta: 0 },
    invalid_email: { expectedBusiness: 1, linked: 0, authExists: 0 },
  };

  let emailMismatches = 0;
  let missingAuth = 0;
  let metaUserMismatch = 0;
  const invalidEmailUserIds = [];

  for (const u of users) {
    const emailOk = Boolean(normalizeEmail(u.email));
    const isBcrypt = BCRYPT_RE.test(u.passwordHash || "");
    const isPlaceholder =
      !isBcrypt &&
      (u.passwordHash === "testhash" ||
        u.passwordHash === "hash" ||
        (/^[a-zA-Z]+$/.test((u.passwordHash || "").trim()) &&
          (u.passwordHash || "").trim().length < 40));

    let key;
    if (!emailOk) {
      key = "invalid_email";
      invalidEmailUserIds.push(u.id);
    } else if (isBcrypt && u.isActive) key = "active_bcrypt";
    else if (isBcrypt && !u.isActive) key = "inactive_bcrypt";
    else if (isPlaceholder && u.isActive) key = "active_placeholder";
    else if (isPlaceholder && !u.isActive) key = "inactive_placeholder";
    else key = null;

    if (!key) continue;

    if (u.supabaseAuthUserId) cohorts[key].linked += 1;
    if (!u.supabaseAuthUserId) continue;

    const auth = authById.get(u.supabaseAuthUserId);
    if (!auth) {
      missingAuth += 1;
      continue;
    }
    cohorts[key].authExists += 1;
    if (auth.has_encrypted_password) cohorts[key].hasEncPassword += 1;
    const meta =
      auth.app_metadata && typeof auth.app_metadata === "object"
        ? auth.app_metadata
        : {};
    if (meta.password_reset_required) cohorts[key].resetMeta += 1;
    if (meta.vectorwork_user_id && meta.vectorwork_user_id !== u.id) {
      metaUserMismatch += 1;
    }
    if (normalizeEmail(auth.email) !== normalizeEmail(u.email)) {
      emailMismatches += 1;
    }
  }

  const linkedAuthIds = users
    .map((u) => u.supabaseAuthUserId)
    .filter(Boolean);
  const uniqueLinkedAuth = new Set(linkedAuthIds);

  const migrationOrphans = [];
  for (const a of authRows) {
    const meta =
      a.app_metadata && typeof a.app_metadata === "object"
        ? a.app_metadata
        : {};
    if (meta.vectorwork_migration !== "4F-auth") continue;
    if (!uniqueLinkedAuth.has(a.id)) migrationOrphans.push(a.id);
  }

  const preExistingAuth = authRows.filter((a) => {
    const meta =
      a.app_metadata && typeof a.app_metadata === "object"
        ? a.app_metadata
        : {};
    return meta.vectorwork_migration !== "4F-auth";
  });

  const report = {
    stage: "4F-auth-staging-validate",
    at: new Date().toISOString(),
    baseline: BASELINE,
    counts: {
      users: users.length,
      companies: await prisma.company.count(),
      jobs: await prisma.job.count(),
      linked: linkedAuthIds.length,
      unlinked: users.length - linkedAuthIds.length,
      auth_users: authRows.length,
      unique_linked_auth_ids: uniqueLinkedAuth.size,
    },
    cohorts,
    integrity: {
      duplicate_business_links_to_same_auth:
        linkedAuthIds.length - uniqueLinkedAuth.size,
      emailMismatches,
      missingAuth,
      metaUserMismatch,
      migrationOrphans: migrationOrphans.length,
      invalidEmailUnlinked:
        invalidEmailUserIds.length === 1 &&
        !users.find((u) => u.id === invalidEmailUserIds[0])?.supabaseAuthUserId,
      invalidEmailUserIds,
      preExistingAuthCount: preExistingAuth.length,
    },
    expectations: {
      linked: 3604,
      unlinked: 1,
      auth_users_min: 3604,
      bcrypt_has_encrypted_password: true,
      placeholder_reset_meta: true,
    },
  };

  report.ok =
    report.counts.users === 3605 &&
    report.counts.companies === 2543 &&
    report.counts.jobs === 58 &&
    report.counts.linked === 3604 &&
    report.counts.unlinked === 1 &&
    report.integrity.duplicate_business_links_to_same_auth === 0 &&
    report.integrity.emailMismatches === 0 &&
    report.integrity.missingAuth === 0 &&
    report.integrity.metaUserMismatch === 0 &&
    report.integrity.migrationOrphans === 0 &&
    report.integrity.invalidEmailUnlinked === true &&
    cohorts.active_bcrypt.linked === 1414 &&
    cohorts.inactive_bcrypt.linked === 845 &&
    cohorts.active_placeholder.linked === 909 &&
    cohorts.inactive_placeholder.linked === 436 &&
    cohorts.active_bcrypt.hasEncPassword === 1414 &&
    cohorts.inactive_bcrypt.hasEncPassword === 845 &&
    cohorts.active_placeholder.resetMeta === 909 &&
    cohorts.inactive_placeholder.resetMeta === 436 &&
    // Supabase may still populate encrypted_password for passwordless creates;
    // VectorWork marks RESET_REQUIRED via app_metadata.password_reset_required.
    cohorts.active_placeholder.resetMeta === cohorts.active_placeholder.linked &&
    cohorts.inactive_placeholder.resetMeta ===
      cohorts.inactive_placeholder.linked;

  writeJson("scripts/staging/_stage4f-auth-staging-validate.json", report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} finally {
  await prisma.$disconnect();
}
