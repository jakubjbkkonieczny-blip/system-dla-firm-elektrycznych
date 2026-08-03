/**
 * Stage 4F — Auth identity migration AUDIT only.
 * Does NOT create Auth users, does NOT bulk-link, does NOT mutate mappings.
 */
import { PrismaClient } from "@prisma/client";
import {
  assertSupabaseStaging,
  BASELINE,
  loadStagingEnv,
  maskUrl,
  withPoolParams,
  writeJson,
} from "./_stage4f-lib.mjs";

const env = loadStagingEnv();
const host = assertSupabaseStaging(env);
const url = withPoolParams(env.DATABASE_URL, {
  connectionLimit: 1,
  poolTimeout: 30,
});
const prisma = new PrismaClient({ datasources: { db: { url } } });

function samplePrefix(value, n = 12) {
  if (!value) return null;
  return String(value).slice(0, n);
}

try {
  const counts = (
    await prisma.$queryRaw`
      SELECT
        (SELECT COUNT(*)::int FROM "User") AS users,
        (SELECT COUNT(*)::int FROM "Company") AS companies,
        (SELECT COUNT(*)::int FROM "Job") AS jobs,
        (SELECT COUNT(*)::int FROM "User" WHERE "supabaseAuthUserId" IS NOT NULL) AS linked,
        (SELECT COUNT(*)::int FROM "User" WHERE "supabaseAuthUserId" IS NULL) AS unlinked,
        (SELECT COUNT(*)::int FROM "User" WHERE "passwordHash" IS NOT NULL) AS with_password_hash,
        (SELECT COUNT(*)::int FROM "User" WHERE "passwordHash" IS NULL) AS without_password_hash,
        (SELECT COUNT(*)::int FROM "User" WHERE "isActive" = true) AS active_users,
        (SELECT COUNT(*)::int FROM "User" WHERE "isActive" = false) AS inactive_users,
        (SELECT COUNT(*)::int FROM "User" WHERE "passwordHash" LIKE '$2a$%') AS hash_2a,
        (SELECT COUNT(*)::int FROM "User" WHERE "passwordHash" LIKE '$2b$%') AS hash_2b,
        (SELECT COUNT(*)::int FROM "User" WHERE "passwordHash" IS NOT NULL AND "passwordHash" NOT LIKE '$2a$%' AND "passwordHash" NOT LIKE '$2b$%') AS hash_other,
        (SELECT COUNT(*)::int FROM auth.users) AS auth_users
    `
  )[0];

  const duplicateEmails = await prisma.$queryRaw`
    SELECT lower(email) AS email, COUNT(*)::int AS n
    FROM "User"
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 20
  `;

  const authUsers = await prisma.$queryRaw`
    SELECT id::text AS id, email, created_at
    FROM auth.users
    ORDER BY created_at ASC
    LIMIT 50
  `;

  const linkChecks = [];
  for (const au of authUsers) {
    const byAuth = await prisma.user.findUnique({
      where: { supabaseAuthUserId: au.id },
      select: { id: true, email: true, isActive: true, supabaseAuthUserId: true },
    });
    const byEmail = au.email
      ? await prisma.user.findUnique({
          where: { email: String(au.email).trim().toLowerCase() },
          select: {
            id: true,
            email: true,
            isActive: true,
            supabaseAuthUserId: true,
            passwordHash: true,
          },
        })
      : null;
    linkChecks.push({
      authUserId: au.id,
      authEmail: au.email,
      linked_via_supabaseAuthUserId: byAuth
        ? { userId: byAuth.id, email: byAuth.email, isActive: byAuth.isActive }
        : null,
      business_user_same_email: byEmail
        ? {
            userId: byEmail.id,
            email: byEmail.email,
            isActive: byEmail.isActive,
            supabaseAuthUserId: byEmail.supabaseAuthUserId,
            hasPasswordHash: Boolean(byEmail.passwordHash),
          }
        : null,
      session_resolve_would_succeed: Boolean(byAuth?.isActive),
    });
  }

  // Sample of migrated users — passwordHash presence (no hash values logged)
  const hashCostSample = await prisma.$queryRaw`
    SELECT
      substring("passwordHash" from 1 for 7) AS prefix,
      COUNT(*)::int AS n
    FROM "User"
    WHERE "passwordHash" IS NOT NULL
    GROUP BY 1
    ORDER BY n DESC
    LIMIT 10
  `;

  const activeUnlinkedWithHash = (
    await prisma.$queryRaw`
      SELECT COUNT(*)::int AS n
      FROM "User"
      WHERE "supabaseAuthUserId" IS NULL
        AND "isActive" = true
        AND "passwordHash" IS NOT NULL
    `
  )[0].n;

  const activeUnlinkedWithoutHash = (
    await prisma.$queryRaw`
      SELECT COUNT(*)::int AS n
      FROM "User"
      WHERE "supabaseAuthUserId" IS NULL
        AND "isActive" = true
        AND "passwordHash" IS NULL
    `
  )[0].n;

  const report = {
    stage: "4F",
    mode: "auth-identity-audit",
    at: new Date().toISOString(),
    runtime: maskUrl(url),
    host,
    architecture: "auth.users.id → User.supabaseAuthUserId → User.id",
    baseline_expected: BASELINE,
    counts,
    duplicate_emails: {
      count: duplicateEmails.length,
      samples: duplicateEmails,
      note: "User.email is UNIQUE — duplicates should be empty by schema.",
    },
    password_hash_prefixes: hashCostSample,
    auth_users_sample: authUsers.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
    })),
    existing_auth_link_checks: linkChecks,
    migrated_user_login_possible:
      Number(counts.linked) > 0
        ? "PARTIAL — only linked rows can resolve"
        : "NO — 0 linked User.supabaseAuthUserId; resolveLinkedUser fails closed (AUTH_USER_UNLINKED)",
    cohorts: {
      active_unlinked_with_legacy_hash: activeUnlinkedWithHash,
      active_unlinked_without_hash: activeUnlinkedWithoutHash,
      inactive_users: counts.inactive_users,
    },
    repository_mechanisms: {
      linkExistingUserToAuth: "lib/supabase/provisioning.ts — explicit, fail-closed; does not auto-claim by email alone",
      linkUserToSupabaseAuthUser: "lib/supabase/auth-user-mapping.ts — low-level link helper",
      ensureProvisionedUserAfterAuth: "new signup path only; refuses existing unlinked email (USER_EXISTS)",
      first_login_auto_link: false,
      bulk_import_script: false,
      password_hash_admin_import_documented:
        "docs/supabase-migration-phase-0.md + lib/supabase/phase0-dependencies.ts (bcrypt import CONFIRMED, not executed)",
      staged_synthetic_test: "scripts/staging/_stage4e-auth.mjs (synthetic only)",
    },
    proposed_stage_4f_auth_substep: {
      name: "Stage 4F-auth — deterministic Auth identity import + link (REQUIRES HUMAN REVIEW)",
      do_not_execute_in_4f: true,
      steps: [
        "1. Freeze Neon writes or accept drift window; re-copy or delta-sync business users if needed before Auth import.",
        "2. Dry-run report: for each active User with passwordHash, classify importability ($2a$/$2b$ cost), email validity, conflicts with existing auth.users.",
        "3. Human review dry-run CSV (email, userId, hash_prefix_only, action=import|reset|skip_inactive|conflict).",
        "4. Batch Admin API createUser({ email, password_hash, email_confirm: true }) for importable rows ONLY — retain returned auth.users.id.",
        "5. Deterministic link: UPDATE User SET supabaseAuthUserId = :authId WHERE id = :userId AND supabaseAuthUserId IS NULL AND lower(email)=lower(:email); refuse overwrite.",
        "6. For non-importable hashes / null hashes: create confirmed Auth user WITHOUT password OR force recovery; require password reset before login.",
        "7. Inactive users: defer import OR import banned; do not grant app access (isActive remains false).",
        "8. Validate: linked count == imported count; spot-check resolveLinkedUser; zero duplicate supabaseAuthUserId; authorization still keys off User.id.",
        "9. Rollback plan: unlink supabaseAuthUserId for batch marker; delete corresponding auth.users via Admin API; do not delete business User rows.",
      ],
      email_matching_safety:
        "Email match alone is NOT safe for auto-link from client input. Safe only after Admin-created Auth identity for that exact normalized email under a reviewed batch, then link by trusted User.id + verified auth.users.id.",
      password_migration:
        "Preferred: Admin password_hash import for VectorWork bcrypt ($2a$/$2b$). Fallback: force password reset. Do not copy plaintext passwords (none exist).",
      why_blocked_now:
        "0/3605 linked; staging auth.users contains only staging diagnostic identities; no reviewed dry-run artifact exists yet.",
    },
    sample_authorization_key: {
      note: "CompanyMember.userId references User.id (cuid), never auth.users.id",
      sample_user_id_prefix: samplePrefix(
        (
          await prisma.companyMember.findFirst({
            select: { userId: true },
          })
        )?.userId
      ),
    },
  };

  writeJson("scripts/staging/_stage4f-auth-audit.json", report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await prisma.$disconnect().catch(() => {});
}
