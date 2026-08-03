/**
 * Production-safe Auth migration orchestrator.
 *
 * Reuses lib/supabase/auth-migration/* business logic.
 * Defaults to dry-run. Refuses staging. Requires production project confirmation for writes.
 *
 * Usage:
 *   npx tsx scripts/production/auth-migrate.ts --env-file <prod-supabase-env>
 *   npx tsx scripts/production/auth-migrate.ts --env-file <env> --execute --confirm-production-project-ref <ref> --limit 1
 */

import { createHash } from "node:crypto";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

import {
  assertSafeReportPayload,
  buildClassificationReport,
  classifyUsers,
  isExecutableCategory,
  migrateOneUser,
  MigrationCliError,
  normalizeMigrationEmail,
  selectExecutableCandidates,
  type AuthAdminPort,
  type BusinessDbPort,
  type BusinessUserRow,
  type MigrationReportRow,
} from "../../lib/supabase/auth-migration";
import {
  appendRollbackEntry,
  assertProductionWriteTarget,
  buildExceptionList,
  emailFingerprint,
  emptyProductionRollbackInventory,
  ensureArtifactDir,
  inspectDbUrl,
  loadEnvFile,
  newProductionAuthBatchId,
  OPERATOR_POOL_DEFAULTS,
  parseProductionAuthArgs,
  PRODUCTION_AUTH_CLI_HELP,
  productionAuthWritesEnabled,
  resolveRepoRoot,
  STAGING_PROJECT_REF,
  withPoolParams,
  writeJsonArtifact,
} from "../../lib/migration/production";

function fingerprintUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

async function main(): Promise<number> {
  let args;
  try {
    args = parseProductionAuthArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof MigrationCliError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }

  if (args.help) {
    console.log(PRODUCTION_AUTH_CLI_HELP);
    return 0;
  }

  const root = resolveRepoRoot();
  const envPath = path.resolve(root, args.sourceEnvFile ?? ".env.supabase-production");
  const env = loadEnvFile(envPath);
  // Also allow overlay from process env for CI/operator shells.
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] == null && typeof v === "string") process.env[k] = v;
  }

  const databaseUrl = env.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("BLOCKED: missing DATABASE_URL");
    return 1;
  }

  const dbIdentity = inspectDbUrl(databaseUrl);
  if (dbIdentity.isNeon) {
    console.error("BLOCKED: Neon refused as Auth/business production target");
    return 2;
  }
  if (dbIdentity.isStagingRef || dbIdentity.projectRef === STAGING_PROJECT_REF) {
    console.error(`BLOCKED: staging project ref ${STAGING_PROJECT_REF} refused`);
    return 2;
  }
  if (!dbIdentity.isSupabase) {
    console.error("BLOCKED: production Auth target must be Supabase");
    return 2;
  }

  const enableWrites = productionAuthWritesEnabled(args);
  if (enableWrites) {
    try {
      assertProductionWriteTarget({
        confirmProductionProjectRef: args.confirmProductionProjectRef,
        databaseUrl,
        nextPublicSupabaseUrl:
          env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
        requireWriteConfirmation: true,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return 2;
    }
  }

  const url = withPoolParams(databaseUrl, OPERATOR_POOL_DEFAULTS);
  const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
  const batchId = newProductionAuthBatchId();
  const rollback = emptyProductionRollbackInventory(batchId);

  const artifact = ensureArtifactDir("auth-migration", {
    repoRoot: root,
    batchId,
    root: args.artifactDir ?? undefined,
  });

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

    const exceptions = buildExceptionList(classified, emailFingerprint);

    const classificationReport = {
      ...buildClassificationReport({
        categoryCounts,
        classified,
        authUsersTotal: authUsersRaw.length,
        businessUsersTotal: users.length,
        notes: [
          "Production Auth dry-run/orchestrator. Counts are LIVE — not staging baselines.",
          "Architecture: auth.users.id → User.supabaseAuthUserId → User.id",
          `WRITES_ENABLED=${enableWrites}`,
          `target=${dbIdentity.hostMasked} ref=${dbIdentity.projectRefMasked}`,
        ],
      }),
      stage: "4G-B-auth" as const,
      exceptions,
      exceptionCount: exceptions.length,
    };
    assertSafeReportPayload(classificationReport);
    writeJsonArtifact(
      path.join(artifact.dir, "classify.json"),
      classificationReport
    );

    const emailCounts = new Map<string, number>();
    for (const u of users) {
      const email = normalizeMigrationEmail(u.email);
      if (!email) continue;
      emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    }
    const authByEmail = new Map<string, { id: string; email: string | null }>();
    for (const au of authUsersRaw) {
      const email = normalizeMigrationEmail(au.email);
      if (email && !authByEmail.has(email)) authByEmail.set(email, au);
    }

    const supabaseUrl =
      env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole =
      env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

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
        if (!admin) return authByEmail.get(normalizedEmail) ?? null;
        // Prefer live lookup via already-loaded map; refresh miss with list is expensive.
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
          email_confirm: emailConfirm,
          password_hash: passwordHash,
          app_metadata: appMetadata,
        } as Parameters<typeof admin.auth.admin.createUser>[0] & {
          password_hash: string;
        });
        if (error || !data.user) {
          throw new Error(error?.message ?? "createUserWithPasswordHash failed");
        }
        return { id: data.user.id };
      },
      createUserWithoutPassword: async ({ email, emailConfirm, appMetadata }) => {
        if (!admin) throw new Error("Admin client unavailable");
        const { data, error } = await admin.auth.admin.createUser({
          email,
          email_confirm: emailConfirm,
          app_metadata: appMetadata,
        });
        if (error || !data.user) {
          throw new Error(error?.message ?? "createUserWithoutPassword failed");
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
        const u = await prisma.user.findFirst({
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
        // Never overwrite an existing non-null mapping.
        const updated = await prisma.user.updateMany({
          where: { id: userId, supabaseAuthUserId: null },
          data: { supabaseAuthUserId: authUserId },
        });
        if (updated.count !== 1) {
          throw new Error("refuses overwrite of supabaseAuthUserId");
        }
      },
      unlinkUser: async (userId) => {
        await prisma.user.update({
          where: { id: userId },
          data: { supabaseAuthUserId: null },
        });
      },
    };

    const candidates = selectExecutableCandidates(classified, {
      userId: args.userId,
      limit: args.limit,
    });

    const usersById = new Map(users.map((u) => [u.id, u]));
    const rows: MigrationReportRow[] = [];
    let systemicFailures = 0;

    // Include non-executable classification outcomes in dry-run report.
    if (!enableWrites) {
      for (const row of classified) {
        if (
          args.userId &&
          row.userId !== args.userId
        ) {
          continue;
        }
        rows.push({
          timestamp: new Date().toISOString(),
          userId: row.userId,
          emailMasked: row.emailMasked,
          category: row.category,
          proposedAction: row.proposedAction,
          outcome: row.outcome,
          authUserId: row.alreadyLinkedAuthUserId,
          failureReason: isExecutableCategory(row.category) ? null : row.reason,
          compensated: false,
        });
      }
    }

    const toMigrate = enableWrites
      ? candidates
      : args.userId || args.limit
        ? candidates
        : [];

    for (const candidate of enableWrites ? candidates : toMigrate) {
      const user = usersById.get(candidate.userId);
      if (!user) continue;

      const result = await migrateOneUser({
        mode: args.mode,
        user,
        emailCounts,
        authByEmail,
        authAdmin,
        businessDb,
        passwordHashForImport: user.passwordHash,
      });

      rows.push(result.report);

      if (result.createdAuthUserId && result.linked) {
        appendRollbackEntry(rollback, {
          businessUserId: user.id,
          emailMasked: result.classified.emailMasked,
          emailFingerprint: emailFingerprint(result.classified.emailNormalized),
          classification: result.classified.category,
          previousSupabaseAuthUserId: null,
          createdAuthUserId: result.createdAuthUserId,
          result: result.report.outcome,
        });
      }

      if (
        result.report.outcome === "FAILED" ||
        result.report.outcome === "ROLLED_BACK"
      ) {
        systemicFailures += 1;
        if (systemicFailures >= 5) {
          console.error("STOP: systemic failures threshold reached");
          break;
        }
      }

      if (rows.length % args.batchSize === 0) {
        console.error(
          `progress users=${rows.length} last=${fingerprintUserId(user.id)}`
        );
      }
    }

    const summary = {
      stage: "4G-B-auth",
      mode: args.mode,
      at: new Date().toISOString(),
      WRITES_ENABLED: enableWrites,
      architecture: "auth.users.id → User.supabaseAuthUserId → User.id",
      target: {
        hostMasked: dbIdentity.hostMasked,
        projectRefMasked: dbIdentity.projectRefMasked,
        database: dbIdentity.database,
        port: dbIdentity.port,
        poolerModeHint: dbIdentity.poolerModeHint,
      },
      categoryCounts,
      exceptionCount: exceptions.length,
      exceptionsSample: exceptions.slice(0, 20),
      totalConsidered: enableWrites ? candidates.length : classified.length,
      outcomeRows: rows.length,
      rollbackInventoryPath: path.join(artifact.dir, "rollback-inventory.json"),
      notes: [
        "Live classification — no hardcoded staging totals.",
        "Inactive business users remain isActive=false (AUTH_USER_INACTIVE).",
        "Rollback not executed by this command.",
      ],
    };

    assertSafeReportPayload(summary);
    assertSafeReportPayload(rollback);
    writeJsonArtifact(path.join(artifact.dir, "run-summary.json"), summary);
    writeJsonArtifact(
      path.join(artifact.dir, "rollback-inventory.json"),
      rollback
    );
    writeJsonArtifact(path.join(artifact.dir, "exceptions.json"), {
      at: new Date().toISOString(),
      count: exceptions.length,
      exceptions,
    });

    console.log(JSON.stringify(summary, null, 2));
    console.log(`WRITES_ENABLED=${enableWrites}`);
    console.log(`artifacts=${artifact.dir}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => process.exit(code));
