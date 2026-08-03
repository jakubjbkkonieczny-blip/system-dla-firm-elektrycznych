/**
 * Stage 4F-Auth-Rehearsal — controlled synthetic execute path only.
 *
 * Creates disposable staging Users, migrates each with --execute --user-id,
 * verifies login/session/inactive/reset/idempotency/conflict/rollback,
 * then deletes all synthetic Auth + business rows and restores baseline.
 *
 * NEVER uses --confirm-bulk-migrate.
 * NEVER selects production-derived migrated users.
 * Never prints plaintext passwords or password hashes.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import bcrypt from "bcrypt";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

import {
  resolveLinkedUser,
  type VerifiedAuthIdentity,
} from "../../lib/supabase/provisioning";
import { SupabaseAuthError } from "../../lib/supabase/errors";
import * as stage4fLib from "./_stage4f-lib.mjs";

type StagingEnv = Record<string, string | undefined>;

const {
  assertSupabaseStaging,
  loadEnvFile,
  loadStagingEnv,
  ROOT,
  withPoolParams,
  writeJson,
} = stage4fLib as unknown as {
  ROOT: string;
  loadEnvFile: (filePath: string) => StagingEnv;
  loadStagingEnv: () => StagingEnv;
  assertSupabaseStaging: (env: StagingEnv) => string;
  withPoolParams: (
    url: string,
    opts?: { connectionLimit?: number; poolTimeout?: number }
  ) => string;
  writeJson: (relPath: string, data: unknown) => string;
};

const EXPECTED = { users: 3605, companies: 2543, jobs: 58, linked: 0 };

type Counts = {
  users: number;
  companies: number;
  jobs: number;
  linked: number;
  auth_users: number;
};

type SyntheticKind =
  | "active_bcrypt"
  | "active_placeholder"
  | "inactive_bcrypt"
  | "inactive_placeholder"
  | "conflict_business"
  | "rollback_rehearsal";

type SyntheticUser = {
  kind: SyntheticKind;
  email: string;
  userId: string;
  authUserId: string | null;
  isActive: boolean;
  /** In-memory only — never written to report JSON. */
  plaintextPassword: string | null;
};

function loadEnv(): StagingEnv {
  const overlay = loadEnvFile(path.join(ROOT, ".env.supabase-staging"));
  const base = loadStagingEnv();
  return { ...overlay, ...base };
}

async function getCounts(prisma: PrismaClient): Promise<Counts> {
  const row = (
    await prisma.$queryRaw<
      Array<{
        users: number;
        companies: number;
        jobs: number;
        linked: number;
        auth_users: number;
      }>
    >`
      SELECT
        (SELECT COUNT(*)::int FROM "User") AS users,
        (SELECT COUNT(*)::int FROM "Company") AS companies,
        (SELECT COUNT(*)::int FROM "Job") AS jobs,
        (SELECT COUNT(*)::int FROM "User" WHERE "supabaseAuthUserId" IS NOT NULL) AS linked,
        (SELECT COUNT(*)::int FROM auth.users) AS auth_users
    `
  )[0];
  return row;
}

function runMigrateExecute(userId: string): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "node_modules/tsx/dist/cli.mjs"),
      path.join(ROOT, "scripts/staging/_stage4f-auth-migrate.ts"),
      "--execute",
      "--user-id",
      userId,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: process.env,
      windowsHide: true,
    }
  );
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function makePassword(): string {
  return `Vw!Reh${randomBytes(12).toString("base64url")}9aA1`;
}

function makeEmail(kind: string, stamp: string): string {
  return `vw.stage4f.rehearsal.${kind}.${stamp}@mailinator.com`;
}

async function createBusinessUser(
  prisma: PrismaClient,
  input: {
    email: string;
    passwordHash: string;
    isActive: boolean;
    displayName: string;
  }
) {
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: input.passwordHash,
      isActive: input.isActive,
      deactivatedAt: input.isActive ? null : new Date(),
      displayName: input.displayName,
      accountRole: "worker",
      supabaseAuthUserId: null,
    },
    select: {
      id: true,
      email: true,
      isActive: true,
      supabaseAuthUserId: true,
      passwordHash: true,
    },
  });
}

async function verifyMapping(
  prisma: PrismaClient,
  userId: string,
  expectedAuthId: string
): Promise<{
  ok: boolean;
  userId: string;
  supabaseAuthUserId: string | null;
  authExists: boolean;
  detail: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, supabaseAuthUserId: true, email: true, isActive: true },
  });
  if (!user) {
    return {
      ok: false,
      userId,
      supabaseAuthUserId: null,
      authExists: false,
      detail: "business user missing",
    };
  }
  const authRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM auth.users WHERE id = ${expectedAuthId}::uuid LIMIT 1
  `;
  const authExists = authRows.length === 1;
  const ok =
    user.id === userId &&
    user.supabaseAuthUserId === expectedAuthId &&
    authExists;
  return {
    ok,
    userId: user.id,
    supabaseAuthUserId: user.supabaseAuthUserId,
    authExists,
    detail: ok
      ? "auth.users.id → User.supabaseAuthUserId → User.id intact"
      : "mapping mismatch",
  };
}

async function resolveSession(
  prisma: PrismaClient,
  authUserId: string,
  email: string
): Promise<{ ok: boolean; userId?: string; category?: string; message?: string }> {
  const identity: VerifiedAuthIdentity = {
    authUserId,
    email,
    emailConfirmed: true,
  };
  try {
    const linked = await resolveLinkedUser(prisma, identity);
    return { ok: true, userId: linked.id };
  } catch (error) {
    if (error instanceof SupabaseAuthError) {
      return { ok: false, category: error.category, message: error.message };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : "resolve failed",
    };
  }
}

async function cleanupSynthetic(
  prisma: PrismaClient,
  admin: SupabaseClient,
  syn: SyntheticUser,
  deleted: Array<Record<string, unknown>>
): Promise<void> {
  // Unlink first if needed so Auth delete does not leave dangling unique refs
  const current = await prisma.user.findUnique({
    where: { id: syn.userId },
    select: { id: true, supabaseAuthUserId: true },
  });
  if (current?.supabaseAuthUserId) {
    await prisma.user.update({
      where: { id: syn.userId },
      data: { supabaseAuthUserId: null },
    });
  }
  const authId = syn.authUserId || current?.supabaseAuthUserId;
  if (authId) {
    const del = await admin.auth.admin.deleteUser(authId);
    deleted.push({
      kind: "auth.users",
      id: authId,
      email: syn.email,
      ok: !del.error,
      error: del.error?.message ?? null,
    });
  }
  if (current) {
    await prisma.user.delete({ where: { id: syn.userId } });
    deleted.push({ kind: "User", id: syn.userId, email: syn.email, ok: true });
  }
}

async function main(): Promise<number> {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] == null && typeof v === "string") process.env[k] = v;
  }

  assertSupabaseStaging(env);
  if (!env.DATABASE_URL) throw new Error("missing DATABASE_URL");
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("missing Supabase Auth admin env");
  }
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  const url = withPoolParams(env.DATABASE_URL, {
    connectionLimit: 1,
    poolTimeout: 30,
  });
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const anon = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const stamp = Date.now().toString(36);
  const synthetics: SyntheticUser[] = [];
  const deleted: Array<Record<string, unknown>> = [];
  const report: Record<string, unknown> = {
    stage: "4F-auth-rehearsal",
    at: new Date().toISOString(),
    architecture: "auth.users.id → User.supabaseAuthUserId → User.id",
    safety: {
      bulk: false,
      confirm_bulk_migrate: false,
      production_derived_users: false,
      synthetic_email_domain: "mailinator.com",
      password_or_hash_logged: false,
    },
  };

  let exitCode = 0;

  try {
    const baseline = await getCounts(prisma);
    report.baseline = baseline;
    report.baseline_matches_expected =
      baseline.users === EXPECTED.users &&
      baseline.companies === EXPECTED.companies &&
      baseline.jobs === EXPECTED.jobs &&
      baseline.linked === EXPECTED.linked;

    if (baseline.linked !== 0) {
      report.blocker =
        "Unexpected non-zero linked count before rehearsal — refusing to proceed";
      writeJson("scripts/staging/_stage4f-auth-rehearsal.json", report);
      return 1;
    }

    // ---------- Create synthetic cohort (no CompanyMember) ----------
    const activeBcryptPassword = makePassword();
    const inactiveBcryptPassword = makePassword();

    const cohortDefs: Array<{
      kind: SyntheticKind;
      email: string;
      isActive: boolean;
      passwordHash: string;
      plaintextPassword: string | null;
    }> = [
      {
        kind: "active_bcrypt",
        email: makeEmail("active-bcrypt", stamp),
        isActive: true,
        passwordHash: await bcrypt.hash(activeBcryptPassword, 10),
        plaintextPassword: activeBcryptPassword,
      },
      {
        kind: "active_placeholder",
        email: makeEmail("active-placeholder", stamp),
        isActive: true,
        passwordHash: "testhash",
        plaintextPassword: null,
      },
      {
        kind: "inactive_bcrypt",
        email: makeEmail("inactive-bcrypt", stamp),
        isActive: false,
        passwordHash: await bcrypt.hash(inactiveBcryptPassword, 10),
        plaintextPassword: inactiveBcryptPassword,
      },
      {
        kind: "inactive_placeholder",
        email: makeEmail("inactive-placeholder", stamp),
        isActive: false,
        passwordHash: "hash",
        plaintextPassword: null,
      },
    ];

    const cohortSummary: Array<Record<string, unknown>> = [];
    for (const def of cohortDefs) {
      const created = await createBusinessUser(prisma, {
        email: def.email,
        passwordHash: def.passwordHash,
        isActive: def.isActive,
        displayName: `VW 4F Rehearsal ${def.kind}`,
      });
      synthetics.push({
        kind: def.kind,
        email: def.email,
        userId: created.id,
        authUserId: null,
        isActive: def.isActive,
        plaintextPassword: def.plaintextPassword,
      });
      cohortSummary.push({
        kind: def.kind,
        userId: created.id,
        email: def.email,
        isActive: created.isActive,
        hashKind:
          def.passwordHash.startsWith("$2") ? "bcrypt" : "placeholder",
        companyMemberCreated: false,
      });
    }
    report.synthetic_test_cohort = cohortSummary;

    const afterCreate = await getCounts(prisma);
    report.counts_after_synthetic_create = afterCreate;

    // ---------- Migrate each with --execute --user-id ----------
    const migrateResults: Record<string, unknown> = {};
    for (const syn of synthetics) {
      const mig = runMigrateExecute(syn.userId);
      const user = await prisma.user.findUnique({
        where: { id: syn.userId },
        select: {
          id: true,
          supabaseAuthUserId: true,
          isActive: true,
          email: true,
        },
      });
      syn.authUserId = user?.supabaseAuthUserId ?? null;
      const migrateRow: Record<string, unknown> = {
        exitCode: mig.exitCode,
        linked: Boolean(syn.authUserId),
        authUserId: syn.authUserId,
        userIdUnchanged: user?.id === syn.userId,
        isActive: user?.isActive,
      };
      if (mig.exitCode !== 0 || !syn.authUserId) {
        migrateRow.stderr_tail = mig.stderr.slice(-500);
        migrateRow.stdout_tail = mig.stdout.slice(-500);
      }
      migrateResults[syn.kind] = migrateRow;
    }
    report.migrate_execute = migrateResults;

    // ---------- Active bcrypt ----------
    const activeBcrypt = synthetics.find((s) => s.kind === "active_bcrypt")!;
    {
      const mapping = await verifyMapping(
        prisma,
        activeBcrypt.userId,
        activeBcrypt.authUserId!
      );
      const signed = await anon.auth.signInWithPassword({
        email: activeBcrypt.email,
        password: activeBcrypt.plaintextPassword!,
      });
      const signInOk = Boolean(signed.data.session && !signed.error);
      const sessionAuthId = signed.data.user?.id ?? null;
      let sessionResolve: Record<string, unknown> = { ok: false };
      if (signInOk && sessionAuthId) {
        const resolved = await resolveSession(
          prisma,
          sessionAuthId,
          activeBcrypt.email
        );
        sessionResolve = {
          ok: resolved.ok && resolved.userId === activeBcrypt.userId,
          resolvedUserId: resolved.userId ?? null,
          expectedUserId: activeBcrypt.userId,
          category: resolved.category ?? null,
        };
        await anon.auth.signOut().catch(() => undefined);
      }
      report.active_bcrypt_migration_test = {
        migrate_linked: Boolean(activeBcrypt.authUserId),
        mapping,
        password_signin_ok: signInOk,
        session_auth_id_matches: sessionAuthId === activeBcrypt.authUserId,
        session_resolution: sessionResolve,
        user_id_unchanged: mapping.userId === activeBcrypt.userId,
        ok:
          mapping.ok &&
          signInOk &&
          sessionAuthId === activeBcrypt.authUserId &&
          Boolean(sessionResolve.ok),
      };
    }

    // ---------- Active placeholder ----------
    const activePh = synthetics.find((s) => s.kind === "active_placeholder")!;
    {
      const mapping = await verifyMapping(
        prisma,
        activePh.userId,
        activePh.authUserId!
      );
      const guessedLogin = await anon.auth.signInWithPassword({
        email: activePh.email,
        password: "testhash",
      });
      const guessedFails = Boolean(guessedLogin.error) && !guessedLogin.data.session;

      // Mechanical reset without external email: Admin sets a new password
      // (equivalent to completing recovery after resetPasswordForEmail).
      const resetPassword = makePassword();
      const reset = await admin.auth.admin.updateUserById(activePh.authUserId!, {
        password: resetPassword,
      });
      const resetApplied = !reset.error;
      const afterReset = await anon.auth.signInWithPassword({
        email: activePh.email,
        password: resetPassword,
      });
      const resetLoginOk = Boolean(afterReset.data.session && !afterReset.error);
      let sessionResolve: Record<string, unknown> = { ok: false };
      if (resetLoginOk && afterReset.data.user?.id) {
        const resolved = await resolveSession(
          prisma,
          afterReset.data.user.id,
          activePh.email
        );
        sessionResolve = {
          ok: resolved.ok && resolved.userId === activePh.userId,
          resolvedUserId: resolved.userId ?? null,
        };
        await anon.auth.signOut().catch(() => undefined);
      }

      report.active_placeholder_migration_test = {
        migrate_linked: Boolean(activePh.authUserId),
        mapping,
        guessed_password_login_fails: guessedFails,
        admin_password_set_simulates_reset: resetApplied,
        login_after_reset_ok: resetLoginOk,
        session_resolution_after_reset: sessionResolve,
        recovery_path:
          "Passwordless Auth create → resetPasswordForEmail / Admin password set required before login",
        ok:
          mapping.ok &&
          guessedFails &&
          resetApplied &&
          resetLoginOk &&
          Boolean(sessionResolve.ok),
      };
    }

    // ---------- Inactive bcrypt ----------
    const inactiveBcrypt = synthetics.find((s) => s.kind === "inactive_bcrypt")!;
    {
      const user = await prisma.user.findUnique({
        where: { id: inactiveBcrypt.userId },
        select: { id: true, isActive: true, supabaseAuthUserId: true },
      });
      const mapping = await verifyMapping(
        prisma,
        inactiveBcrypt.userId,
        inactiveBcrypt.authUserId!
      );
      const signed = await anon.auth.signInWithPassword({
        email: inactiveBcrypt.email,
        password: inactiveBcrypt.plaintextPassword!,
      });
      const authSignInOk = Boolean(signed.data.session && !signed.error);
      const resolved = await resolveSession(
        prisma,
        inactiveBcrypt.authUserId!,
        inactiveBcrypt.email
      );
      await anon.auth.signOut().catch(() => undefined);

      report.inactive_bcrypt_migration_test = {
        migrate_linked: Boolean(inactiveBcrypt.authUserId),
        mapping,
        isActive_remains_false: user?.isActive === false,
        auth_password_signin_works: authSignInOk,
        business_session_denied:
          resolved.ok === false && resolved.category === "AUTH_USER_INACTIVE",
        resolve_category: resolved.category ?? null,
        ok:
          mapping.ok &&
          user?.isActive === false &&
          authSignInOk &&
          resolved.ok === false &&
          resolved.category === "AUTH_USER_INACTIVE",
      };
    }

    // ---------- Inactive placeholder ----------
    const inactivePh = synthetics.find((s) => s.kind === "inactive_placeholder")!;
    {
      const user = await prisma.user.findUnique({
        where: { id: inactivePh.userId },
        select: { id: true, isActive: true, supabaseAuthUserId: true },
      });
      const mapping = await verifyMapping(
        prisma,
        inactivePh.userId,
        inactivePh.authUserId!
      );
      const guessed = await anon.auth.signInWithPassword({
        email: inactivePh.email,
        password: "hash",
      });
      const guessedFails = Boolean(guessed.error) && !guessed.data.session;
      const resolved = await resolveSession(
        prisma,
        inactivePh.authUserId!,
        inactivePh.email
      );

      report.inactive_placeholder_migration_test = {
        migrate_linked: Boolean(inactivePh.authUserId),
        mapping,
        isActive_remains_false: user?.isActive === false,
        guessed_password_login_fails: guessedFails,
        business_session_denied:
          resolved.ok === false && resolved.category === "AUTH_USER_INACTIVE",
        resolve_category: resolved.category ?? null,
        ok:
          mapping.ok &&
          user?.isActive === false &&
          guessedFails &&
          resolved.ok === false &&
          resolved.category === "AUTH_USER_INACTIVE",
      };
    }

    // ---------- Session resolution summary ----------
    report.session_resolution_verification = {
      active_bcrypt: (report.active_bcrypt_migration_test as { ok?: boolean })
        ?.ok,
      active_placeholder_after_reset: (
        report.active_placeholder_migration_test as { ok?: boolean }
      )?.ok,
      inactive_bcrypt_denied: (
        report.inactive_bcrypt_migration_test as { ok?: boolean }
      )?.ok,
      inactive_placeholder_denied: (
        report.inactive_placeholder_migration_test as { ok?: boolean }
      )?.ok,
    };

    // ---------- Idempotency ----------
    {
      const beforeAuthCount = (await getCounts(prisma)).auth_users;
      const beforeAuthId = activeBcrypt.authUserId;
      const again = runMigrateExecute(activeBcrypt.userId);
      const after = await prisma.user.findUnique({
        where: { id: activeBcrypt.userId },
        select: { supabaseAuthUserId: true },
      });
      const afterAuthCount = (await getCounts(prisma)).auth_users;
      const stdout = again.stdout + again.stderr;
      report.idempotency_test = {
        exitCode: again.exitCode,
        authUserId_unchanged: after?.supabaseAuthUserId === beforeAuthId,
        auth_users_count_unchanged: afterAuthCount === beforeAuthCount,
        already_migrated_indicated:
          /ALREADY_MIGRATED/i.test(stdout) ||
          after?.supabaseAuthUserId === beforeAuthId,
        ok:
          again.exitCode === 0 &&
          after?.supabaseAuthUserId === beforeAuthId &&
          afterAuthCount === beforeAuthCount,
      };
    }

    // ---------- Conflict test ----------
    {
      const conflictEmail = makeEmail("conflict", stamp);
      const conflictPassword = makePassword();
      // Pre-create Auth identity (unlinked)
      const preAuth = await admin.auth.admin.createUser({
        email: conflictEmail,
        password: conflictPassword,
        email_confirm: true,
        app_metadata: { vectorwork_migration: "4F-auth-rehearsal-conflict" },
      });
      if (preAuth.error || !preAuth.data.user) {
        report.conflict_handling_test = {
          ok: false,
          error: preAuth.error?.message || "precreate auth failed",
        };
      } else {
        const conflictAuthId = preAuth.data.user.id;
        const conflictUser = await createBusinessUser(prisma, {
          email: conflictEmail,
          passwordHash: await bcrypt.hash(conflictPassword, 10),
          isActive: true,
          displayName: "VW 4F Rehearsal conflict",
        });
        synthetics.push({
          kind: "conflict_business",
          email: conflictEmail,
          userId: conflictUser.id,
          authUserId: null,
          isActive: true,
          plaintextPassword: conflictPassword,
        });

        const mig = runMigrateExecute(conflictUser.id);
        const after = await prisma.user.findUnique({
          where: { id: conflictUser.id },
          select: { supabaseAuthUserId: true },
        });
        const stdout = mig.stdout + mig.stderr;
        const noLink = after?.supabaseAuthUserId == null;
        const conflictIndicated =
          /AUTH_CONFLICT/i.test(stdout) || noLink;

        // Cleanup conflict Auth + business immediately
        await prisma.user.delete({ where: { id: conflictUser.id } });
        deleted.push({
          kind: "User",
          id: conflictUser.id,
          email: conflictEmail,
          phase: "conflict_cleanup",
        });
        // Remove from synthetics tracking (already deleted)
        const idx = synthetics.findIndex((s) => s.userId === conflictUser.id);
        if (idx >= 0) synthetics.splice(idx, 1);

        const delAuth = await admin.auth.admin.deleteUser(conflictAuthId);
        deleted.push({
          kind: "auth.users",
          id: conflictAuthId,
          email: conflictEmail,
          phase: "conflict_cleanup",
          ok: !delAuth.error,
        });

        report.conflict_handling_test = {
          exitCode: mig.exitCode,
          business_remained_unlinked: noLink,
          no_email_alone_claim: noLink,
          auth_conflict_indicated: conflictIndicated,
          precreated_auth_deleted: !delAuth.error,
          ok: noLink && conflictIndicated && !delAuth.error,
        };
      }
    }

    // ---------- Rollback test (use inactive_placeholder) ----------
    {
      const target = inactivePh;
      const previousAuthId = target.authUserId!;
      const previousUserId = target.userId;
      const authCountBefore = (await getCounts(prisma)).auth_users;

      // Preserve diagnostic auth user id for untouched check
      const diagnosticAuth = await prisma.$queryRaw<
        Array<{ id: string; email: string | null }>
      >`
        SELECT id::text AS id, email FROM auth.users
        WHERE email LIKE 'vw.diag.%'
        ORDER BY created_at ASC
        LIMIT 1
      `;

      await prisma.user.update({
        where: { id: previousUserId },
        data: { supabaseAuthUserId: null },
      });
      const del = await admin.auth.admin.deleteUser(previousAuthId);
      const afterUnlink = await prisma.user.findUnique({
        where: { id: previousUserId },
        select: {
          id: true,
          supabaseAuthUserId: true,
          isActive: true,
          email: true,
        },
      });
      const authGone = (
        await prisma.$queryRaw<Array<{ c: number }>>`
          SELECT COUNT(*)::int AS c FROM auth.users WHERE id = ${previousAuthId}::uuid
        `
      )[0].c;

      // Diagnostic still present?
      let diagnosticUntouched = true;
      if (diagnosticAuth[0]) {
        const still = await prisma.$queryRaw<Array<{ c: number }>>`
          SELECT COUNT(*)::int AS c FROM auth.users WHERE id = ${diagnosticAuth[0].id}::uuid
        `;
        diagnosticUntouched = still[0].c === 1;
      }

      // Re-run migration after rollback
      const remig = runMigrateExecute(previousUserId);
      const remigUser = await prisma.user.findUnique({
        where: { id: previousUserId },
        select: { id: true, supabaseAuthUserId: true, isActive: true },
      });
      target.authUserId = remigUser?.supabaseAuthUserId ?? null;

      report.rollback_test = {
        unlinked: afterUnlink?.supabaseAuthUserId === null,
        auth_identity_deleted: authGone === 0 && !del.error,
        business_user_intact:
          afterUnlink?.id === previousUserId &&
          afterUnlink.email === target.email &&
          afterUnlink.isActive === false,
        diagnostic_auth_untouched: diagnosticUntouched,
        remigrate_exitCode: remig.exitCode,
        remigrate_linked: Boolean(remigUser?.supabaseAuthUserId),
        remigrate_new_auth_id: remigUser?.supabaseAuthUserId ?? null,
        remigrate_user_id_unchanged: remigUser?.id === previousUserId,
        isActive_still_false: remigUser?.isActive === false,
        auth_count_delta_note: {
          before_rollback_delete: authCountBefore,
          after_remigrate: (await getCounts(prisma)).auth_users,
        },
        ok:
          afterUnlink?.supabaseAuthUserId === null &&
          authGone === 0 &&
          !del.error &&
          afterUnlink?.id === previousUserId &&
          diagnosticUntouched &&
          remig.exitCode === 0 &&
          Boolean(remigUser?.supabaseAuthUserId) &&
          remigUser?.id === previousUserId &&
          remigUser?.isActive === false,
      };
    }

    // ---------- Identity mapping verification (all remaining synthetics) ----------
    {
      const mappings: Array<Record<string, unknown>> = [];
      let allOk = true;
      for (const syn of synthetics) {
        if (!syn.authUserId) {
          allOk = false;
          mappings.push({ kind: syn.kind, ok: false, reason: "missing auth" });
          continue;
        }
        const m = await verifyMapping(prisma, syn.userId, syn.authUserId);
        const memberCount = await prisma.companyMember.count({
          where: { userId: syn.userId },
        });
        mappings.push({
          kind: syn.kind,
          userId: syn.userId,
          authUserId: syn.authUserId,
          mapping_ok: m.ok,
          companyMember_count: memberCount,
        });
        if (!m.ok || memberCount !== 0) allOk = false;
      }
      report.identity_mapping_verification = { ok: allOk, mappings };
    }

    // ---------- Cleanup all synthetics ----------
    for (const syn of [...synthetics]) {
      await cleanupSynthetic(prisma, admin, syn, deleted);
    }
    synthetics.length = 0;

    // Sweep any leftover rehearsal Auth users by email prefix (safety net)
    const leftoverAuth = await prisma.$queryRaw<
      Array<{ id: string; email: string | null }>
    >`
      SELECT id::text AS id, email FROM auth.users
      WHERE email LIKE ${`vw.stage4f.rehearsal.%@mailinator.com`}
    `;
    for (const row of leftoverAuth) {
      const del = await admin.auth.admin.deleteUser(row.id);
      deleted.push({
        kind: "auth.users",
        id: row.id,
        email: row.email,
        phase: "sweep",
        ok: !del.error,
      });
    }
    const leftoverUsers = await prisma.user.findMany({
      where: { email: { startsWith: "vw.stage4f.rehearsal." } },
      select: { id: true, email: true, supabaseAuthUserId: true },
    });
    for (const u of leftoverUsers) {
      if (u.supabaseAuthUserId) {
        await prisma.user.update({
          where: { id: u.id },
          data: { supabaseAuthUserId: null },
        });
        await admin.auth.admin.deleteUser(u.supabaseAuthUserId).catch(() => undefined);
      }
      await prisma.user.delete({ where: { id: u.id } });
      deleted.push({ kind: "User", id: u.id, email: u.email, phase: "sweep" });
    }

    report.deleted = deleted.map((d) => ({
      kind: d.kind,
      id: d.id,
      email: d.email,
      phase: d.phase ?? "final",
      ok: d.ok ?? true,
    }));

    const finalCounts = await getCounts(prisma);
    report.cleanup_verification = {
      final: finalCounts,
      matches_baseline:
        finalCounts.users === baseline.users &&
        finalCounts.companies === baseline.companies &&
        finalCounts.jobs === baseline.jobs &&
        finalCounts.linked === baseline.linked &&
        finalCounts.auth_users === baseline.auth_users,
      matches_expected_business:
        finalCounts.users === EXPECTED.users &&
        finalCounts.companies === EXPECTED.companies &&
        finalCounts.jobs === EXPECTED.jobs &&
        finalCounts.linked === EXPECTED.linked,
    };

    const checks = [
      report.active_bcrypt_migration_test,
      report.active_placeholder_migration_test,
      report.inactive_bcrypt_migration_test,
      report.inactive_placeholder_migration_test,
      report.idempotency_test,
      report.conflict_handling_test,
      report.rollback_test,
      report.identity_mapping_verification,
      report.cleanup_verification,
    ] as Array<{ ok?: boolean; matches_baseline?: boolean }>;

    const allPassed =
      checks.every((c) => c && (c.ok === true || c.matches_baseline === true)) &&
      (report.cleanup_verification as { matches_baseline: boolean })
        .matches_baseline;

    report.verdict = allPassed
      ? "AUTH MIGRATION REHEARSAL PASSED"
      : "STAGE 4F-AUTH-REHEARSAL BLOCKED";

    if (!allPassed) exitCode = 1;
  } catch (error) {
    exitCode = 1;
    report.error = error instanceof Error ? error.message : String(error);
    report.verdict = "STAGE 4F-AUTH-REHEARSAL BLOCKED";

    // Best-effort cleanup on failure
    try {
      for (const syn of synthetics) {
        await cleanupSynthetic(prisma, admin, syn, deleted);
      }
      const leftoverUsers = await prisma.user.findMany({
        where: { email: { startsWith: "vw.stage4f.rehearsal." } },
        select: { id: true, supabaseAuthUserId: true, email: true },
      });
      for (const u of leftoverUsers) {
        if (u.supabaseAuthUserId) {
          await prisma.user
            .update({
              where: { id: u.id },
              data: { supabaseAuthUserId: null },
            })
            .catch(() => undefined);
          await admin.auth.admin
            .deleteUser(u.supabaseAuthUserId)
            .catch(() => undefined);
        }
        await prisma.user.delete({ where: { id: u.id } }).catch(() => undefined);
      }
      const leftoverAuth = await prisma.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT id::text AS id FROM auth.users
        WHERE email LIKE 'vw.stage4f.rehearsal.%@mailinator.com'
      `;
      for (const row of leftoverAuth) {
        await admin.auth.admin.deleteUser(row.id).catch(() => undefined);
      }
      report.emergency_cleanup_counts = await getCounts(prisma);
    } catch (cleanupError) {
      report.emergency_cleanup_error =
        cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError);
    }
  } finally {
    writeJson("scripts/staging/_stage4f-auth-rehearsal.json", report);
    await prisma.$disconnect().catch(() => {});
  }

  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        baseline: report.baseline,
        cleanup: report.cleanup_verification,
        tests: {
          active_bcrypt: (report.active_bcrypt_migration_test as { ok?: boolean })
            ?.ok,
          active_placeholder: (
            report.active_placeholder_migration_test as { ok?: boolean }
          )?.ok,
          inactive_bcrypt: (
            report.inactive_bcrypt_migration_test as { ok?: boolean }
          )?.ok,
          inactive_placeholder: (
            report.inactive_placeholder_migration_test as { ok?: boolean }
          )?.ok,
          idempotency: (report.idempotency_test as { ok?: boolean })?.ok,
          conflict: (report.conflict_handling_test as { ok?: boolean })?.ok,
          rollback: (report.rollback_test as { ok?: boolean })?.ok,
          mapping: (report.identity_mapping_verification as { ok?: boolean })
            ?.ok,
        },
        error: report.error ?? null,
      },
      null,
      2
    )
  );

  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
