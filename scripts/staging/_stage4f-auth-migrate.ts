/**
 * Stage 4F-Auth — deterministic Auth identity migration tool.
 *
 * DEFAULT: dry-run (no Auth writes, no User.supabaseAuthUserId writes).
 *
 * Usage:
 *   npx tsx scripts/staging/_stage4f-auth-migrate.ts
 *   npx tsx scripts/staging/_stage4f-auth-migrate.ts --dry-run
 *   npx tsx scripts/staging/_stage4f-auth-migrate.ts --execute --user-id <id>
 *   npx tsx scripts/staging/_stage4f-auth-migrate.ts --execute --limit 1
 *
 * Full bulk execute requires --confirm-bulk-migrate (DO NOT use in this stage).
 *
 * Never logs password hashes, tokens, or service-role secrets.
 */

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

import {
  assertSafeReportPayload,
  buildClassificationReport,
  buildRunSummary,
  classifyUsers,
  emptyRollbackManifest,
  isExecutableCategory,
  MIGRATION_CLI_HELP,
  migrateOneUser,
  MigrationCliError,
  newBatchId,
  normalizeMigrationEmail,
  parseMigrationArgs,
  selectExecutableCandidates,
  writesEnabled,
  type AuthAdminPort,
  type BusinessDbPort,
  type BusinessUserRow,
  type MigrationReportRow,
} from "../../lib/supabase/auth-migration";
import path from "node:path";
import * as stage4fLib from "./_stage4f-lib.mjs";

type StagingEnv = Record<string, string | undefined>;

const {
  assertSupabaseStaging,
  loadEnvFile,
  loadStagingEnv,
  maskUrl,
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
  maskUrl: (url: string) => Record<string, unknown>;
  writeJson: (relPath: string, data: unknown) => string;
};

function fingerprintUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

/** Merge optional staging overlay without printing values. Local env wins. */
function loadEnvForAuthMigrate(): StagingEnv {
  const overlay = loadEnvFile(path.join(ROOT, ".env.supabase-staging"));
  const base = loadStagingEnv();
  return { ...overlay, ...base };
}

async function main(): Promise<number> {
  let args;
  try {
    args = parseMigrationArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof MigrationCliError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }

  if (args.help) {
    console.log(MIGRATION_CLI_HELP);
    return 0;
  }

  const env = loadEnvForAuthMigrate();
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] == null && typeof v === "string") process.env[k] = v;
  }

  if (!env.DATABASE_URL) {
    console.error("BLOCKED: missing DATABASE_URL");
    return 1;
  }
  const host = assertSupabaseStaging(env);
  const url = withPoolParams(env.DATABASE_URL, {
    connectionLimit: 1,
    poolTimeout: 30,
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const batchId = newBatchId();
  const rollback = emptyRollbackManifest(batchId);
  const enableWrites = writesEnabled(args);

  const notes: string[] = [
    "Architecture: auth.users.id → User.supabaseAuthUserId → User.id (User.id immutable).",
    "Default mode is dry-run; this invocation writesEnabled=" + String(enableWrites),
    "Inactive users: Auth created (not banned); business isActive remains authoritative.",
    "Placeholder hashes: Auth created without password; RESET_REQUIRED before login.",
    "Bulk customer migration is NOT performed unless --execute --confirm-bulk-migrate.",
  ];

  try {
    const usersRaw = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        passwordHash: true,
        supabaseAuthUserId: true,
        isActive: true,
        deactivatedAt: true,
      },
      orderBy: { id: "asc" },
    });

    const users: BusinessUserRow[] = usersRaw.map((u) => ({
      id: u.id,
      email: u.email,
      passwordHash: u.passwordHash,
      supabaseAuthUserId: u.supabaseAuthUserId,
      isActive: u.isActive,
      deactivatedAt: u.deactivatedAt,
    }));

    const authUsersRaw = await prisma.$queryRaw<
      Array<{ id: string; email: string | null }>
    >`
      SELECT id::text AS id, email
      FROM auth.users
    `;

    const { classified, categoryCounts } = classifyUsers({
      users,
      authUsers: authUsersRaw,
    });

    const classificationReport = buildClassificationReport({
      categoryCounts,
      classified,
      authUsersTotal: authUsersRaw.length,
      businessUsersTotal: users.length,
      notes,
    });
    assertSafeReportPayload(classificationReport);
    writeJson(
      "scripts/staging/_stage4f-auth-classify.json",
      classificationReport
    );

    // Build maps for migrateOneUser
    const emailCounts = new Map<string, number>();
    for (const u of users) {
      const email = normalizeMigrationEmail(u.email);
      if (!email) continue;
      emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    }
    const authByEmail = new Map<string, { id: string; email: string | null }>();
    for (const au of authUsersRaw) {
      const email = normalizeMigrationEmail(au.email);
      if (email && !authByEmail.has(email)) {
        authByEmail.set(email, au);
      }
    }

    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;

    if (enableWrites && (!supabaseUrl || !serviceRole)) {
      console.error(
        "BLOCKED: --execute requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
      );
      return 1;
    }

    const admin =
      supabaseUrl && serviceRole
        ? createClient(supabaseUrl, serviceRole, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
        : null;

    const authAdmin: AuthAdminPort = {
      findAuthUserByEmail: async (normalizedEmail) => {
        // Prefer live Admin list filter when available; fall back to SQL snapshot map.
        if (admin) {
          // auth.users lookup via SQL is authoritative on staging and avoids paging.
          const rows = await prisma.$queryRaw<
            Array<{ id: string; email: string | null }>
          >`
            SELECT id::text AS id, email
            FROM auth.users
            WHERE lower(email) = ${normalizedEmail}
            LIMIT 1
          `;
          return rows[0] ?? null;
        }
        return authByEmail.get(normalizedEmail) ?? null;
      },
      createUserWithPasswordHash: async ({
        email,
        passwordHash,
        emailConfirm,
        appMetadata,
      }) => {
        if (!admin) throw new Error("Admin client unavailable");
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password_hash: passwordHash,
          email_confirm: emailConfirm,
          app_metadata: appMetadata,
        } as Parameters<typeof admin.auth.admin.createUser>[0] & {
          password_hash: string;
        });
        if (error || !data.user?.id) {
          throw new Error(error?.message || "createUser(password_hash) failed");
        }
        return { id: data.user.id };
      },
      createUserWithoutPassword: async ({
        email,
        emailConfirm,
        appMetadata,
      }) => {
        if (!admin) throw new Error("Admin client unavailable");
        const { data, error } = await admin.auth.admin.createUser({
          email,
          email_confirm: emailConfirm,
          app_metadata: appMetadata,
        });
        if (error || !data.user?.id) {
          throw new Error(error?.message || "createUser(without password) failed");
        }
        return { id: data.user.id };
      },
      deleteUser: async (authUserId) => {
        if (!admin) throw new Error("Admin client unavailable");
        const { error } = await admin.auth.admin.deleteUser(authUserId);
        if (error) throw new Error(error.message);
      },
    };

    const businessDb: BusinessDbPort = {
      findUserById: async (userId) => {
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            supabaseAuthUserId: true,
            isActive: true,
            deactivatedAt: true,
          },
        });
        return u;
      },
      findUserByAuthId: async (authUserId) => {
        const u = await prisma.user.findUnique({
          where: { supabaseAuthUserId: authUserId },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            supabaseAuthUserId: true,
            isActive: true,
            deactivatedAt: true,
          },
        });
        return u;
      },
      linkUser: async (userId, authUserId) => {
        // Fail-closed conditional update — never overwrite a different mapping.
        const updated = await prisma.$executeRaw`
          UPDATE "User"
          SET "supabaseAuthUserId" = ${authUserId}
          WHERE id = ${userId}
            AND "supabaseAuthUserId" IS NULL
        `;
        if (updated !== 1) {
          const current = await prisma.user.findUnique({
            where: { id: userId },
            select: { supabaseAuthUserId: true },
          });
          if (current?.supabaseAuthUserId === authUserId) return;
          throw new Error(
            "Refused link: User.supabaseAuthUserId already set or user missing"
          );
        }
      },
      unlinkUser: async (userId) => {
        await prisma.user.update({
          where: { id: userId },
          data: { supabaseAuthUserId: null },
        });
      },
    };

    // Disposable synthetic detection — never pick arbitrary production-derived users.
    const syntheticCandidates = users.filter((u) => {
      const email = (u.email || "").toLowerCase();
      return (
        email.startsWith("vw.stage4e.probe.") ||
        email.startsWith("vw.stage4f.probe.") ||
        email.startsWith("vw.diag.")
      );
    });
    notes.push(
      syntheticCandidates.length === 0
        ? "Single-user execute test: SKIPPED — no disposable synthetic business User present."
        : `Disposable synthetic business users detected: ${syntheticCandidates.length} (not auto-executed).`
    );

    let targets = classified;
    if (args.userId) {
      targets = classified.filter((row) => row.userId === args.userId);
      if (targets.length === 0) {
        console.error(`No classified user for --user-id ${args.userId}`);
        return 1;
      }
    } else if (args.mode === "execute" || args.limit != null) {
      // For execute / limited dry-run of executable cohort
      const executable = selectExecutableCandidates(classified, {
        userId: args.userId,
        limit: args.limit,
      });
      if (args.mode === "execute") {
        targets = executable;
      } else if (args.limit != null) {
        // dry-run with limit: report only first N of all classified (stable by id)
        targets = [...classified]
          .sort((a, b) => a.userId.localeCompare(b.userId))
          .slice(0, args.limit);
      }
    }

    const rows: MigrationReportRow[] = [];
    const userById = new Map(users.map((u) => [u.id, u]));

    // Dry-run full classify: emit a row per user (or limited subset).
    // Execute: only executable targets within guards.
    // Execute with --user-id reports that user even when not executable (conflict/skip).
    // Execute without --user-id only processes executable candidates (limit/bulk).
    const workList =
      args.mode === "execute"
        ? args.userId
          ? classified.filter((row) => row.userId === args.userId)
          : selectExecutableCandidates(classified, {
              userId: null,
              limit: args.limit,
            })
        : targets;

    for (const classifiedRow of workList) {
      const businessUser = userById.get(classifiedRow.userId);
      if (!businessUser) continue;

      if (args.mode === "dry-run") {
        rows.push({
          timestamp: new Date().toISOString(),
          userId: classifiedRow.userId,
          emailMasked: classifiedRow.emailMasked,
          category: classifiedRow.category,
          proposedAction: classifiedRow.proposedAction,
          outcome: classifiedRow.outcome,
          authUserId: classifiedRow.alreadyLinkedAuthUserId,
          failureReason:
            classifiedRow.outcome === "READY" ||
            classifiedRow.outcome === "INACTIVE" ||
            classifiedRow.outcome === "RESET_REQUIRED" ||
            classifiedRow.outcome === "ALREADY_MIGRATED"
              ? null
              : classifiedRow.reason,
          compensated: false,
        });
        continue;
      }

      // execute
      if (!isExecutableCategory(classifiedRow.category)) {
        rows.push({
          timestamp: new Date().toISOString(),
          userId: classifiedRow.userId,
          emailMasked: classifiedRow.emailMasked,
          category: classifiedRow.category,
          proposedAction: classifiedRow.proposedAction,
          outcome: classifiedRow.outcome,
          authUserId: classifiedRow.alreadyLinkedAuthUserId,
          failureReason: classifiedRow.reason,
          compensated: false,
        });
        continue;
      }

      const result = await migrateOneUser({
        mode: "execute",
        user: businessUser,
        emailCounts,
        authByEmail,
        authAdmin,
        businessDb,
      });
      rows.push(result.report);
      if (result.createdAuthUserId && result.linked) {
        rollback.createdAuthUserIds.push(result.createdAuthUserId);
        rollback.linkedUserIds.push({
          userId: businessUser.id,
          previousSupabaseAuthUserId: null,
          newSupabaseAuthUserId: result.createdAuthUserId,
        });
      } else if (result.createdAuthUserId && !result.compensated) {
        // Orphan risk — record for human cleanup
        rollback.createdAuthUserIds.push(result.createdAuthUserId);
        notes.push(
          `ORPHAN_RISK authUserId=${result.createdAuthUserId} userId=${fingerprintUserId(businessUser.id)}`
        );
      }
    }

    const summary = buildRunSummary({
      mode: args.mode,
      args,
      writesEnabled: enableWrites,
      categoryCounts,
      rows:
        args.mode === "dry-run" && args.limit == null && !args.userId
          ? rows.slice(0, 200) // cap detailed rows in full dry-run artifact; counts are complete
          : rows,
      rollback,
      notes: [
        ...notes,
        `runtime_host=${host}`,
        `database=${JSON.stringify(maskUrl(url))}`,
        args.mode === "dry-run" && args.limit == null && !args.userId
          ? `full_dry_run_rows_total=${rows.length}; artifact includes first 200 detail rows only`
          : `detail_rows=${rows.length}`,
      ],
    });

    // Attach full outcome tallies from uncapped rows
    summary.outcomeCounts = rows.reduce(
      (acc, row) => {
        acc[row.outcome] = (acc[row.outcome] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    summary.totalConsidered = rows.length;

    assertSafeReportPayload(summary);
    const outPath =
      args.mode === "dry-run"
        ? "scripts/staging/_stage4f-auth-migrate-dry-run.json"
        : "scripts/staging/_stage4f-auth-migrate-execute.json";
    writeJson(outPath, summary);

    // Update human-facing plan snapshot (still NOT executed bulk).
    writeJson("scripts/staging/_stage4f-auth-plan.json", {
      stage: "4F-auth",
      status: enableWrites
        ? "PARTIAL EXECUTE — see execute report"
        : "DRY-RUN COMPLETE — NOT EXECUTED BULK",
      architecture: "auth.users.id → User.supabaseAuthUserId → User.id",
      do_not_execute_without_human_review: true,
      current_state: {
        business_users: users.length,
        linked: categoryCounts.G_ALREADY_LINKED,
        auth_users_staging: authUsersRaw.length,
        categoryCounts,
      },
      bcrypt_import:
        "Admin createUser({ email, password_hash, email_confirm: true }) — CONFIRMED via auth-js AdminUserAttributes",
      placeholder_strategy:
        "createUser({ email, email_confirm: true }) without password → RESET_REQUIRED",
      inactive_strategy:
        "Create Auth (not banned); link; business isActive remains false; login denied by resolveLinkedUser",
      tooling: "scripts/staging/_stage4f-auth-migrate.ts",
      reports: {
        classify: "scripts/staging/_stage4f-auth-classify.json",
        dryRun: "scripts/staging/_stage4f-auth-migrate-dry-run.json",
      },
    });

    console.log(
      JSON.stringify(
        {
          stage: "4F-auth",
          mode: args.mode,
          writesEnabled: enableWrites,
          business_users: users.length,
          categoryCounts,
          outcomeCounts: summary.outcomeCounts,
          totalConsidered: summary.totalConsidered,
          reports: {
            classify: "scripts/staging/_stage4f-auth-classify.json",
            run: outPath,
            plan: "scripts/staging/_stage4f-auth-plan.json",
          },
        },
        null,
        2
      )
    );

    return 0;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
