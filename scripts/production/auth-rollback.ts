/**
 * Production Auth rollback executor.
 * DO NOT run during Stage 4G-B.
 *
 * Requires:
 *   --confirm-rollback
 *   --confirm-production-project-ref <ref>
 *   --rollback-manifest <path>
 *   --env-file <prod-supabase-env>
 *   --execute
 */

import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

import type { AuthAdminPort, BusinessDbPort } from "../../lib/supabase/auth-migration";
import {
  assertProductionWriteTarget,
  executeProductionAuthRollback,
  loadEnvFile,
  OPERATOR_POOL_DEFAULTS,
  parseProductionAuthArgs,
  resolveRepoRoot,
  STAGING_PROJECT_REF,
  withPoolParams,
  writeJsonArtifact,
  type ProductionRollbackInventory,
} from "../../lib/migration/production";

async function main(): Promise<number> {
  let args;
  try {
    args = parseProductionAuthArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 2;
  }

  if (args.help) {
    console.log(
      "Usage: npx tsx scripts/production/auth-rollback.ts --env-file <env> --rollback-manifest <path> --confirm-production-project-ref <ref> --confirm-rollback --execute"
    );
    return 0;
  }

  if (args.mode !== "execute" || !args.confirmRollback) {
    console.error(
      "Refusing rollback: require --execute and --confirm-rollback (not for Stage 4G-B)"
    );
    return 2;
  }
  if (!args.confirmProductionProjectRef) {
    console.error("Refusing rollback without --confirm-production-project-ref");
    return 2;
  }
  if (args.confirmProductionProjectRef === STAGING_PROJECT_REF) {
    console.error(`Refusing staging ref ${STAGING_PROJECT_REF}`);
    return 2;
  }
  if (!args.rollbackManifestPath || !args.sourceEnvFile) {
    console.error("Refusing rollback without --rollback-manifest and --env-file");
    return 2;
  }

  const root = resolveRepoRoot();
  const env = loadEnvFile(path.resolve(root, args.sourceEnvFile));
  const databaseUrl = env.DATABASE_URL ?? process.env.DATABASE_URL;
  const supabaseUrl =
    env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole =
    env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!databaseUrl || !supabaseUrl || !serviceRole) {
    console.error("BLOCKED: missing DATABASE_URL / Supabase Auth admin env");
    return 1;
  }

  try {
    assertProductionWriteTarget({
      confirmProductionProjectRef: args.confirmProductionProjectRef,
      databaseUrl,
      nextPublicSupabaseUrl: supabaseUrl,
      requireWriteConfirmation: true,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 2;
  }

  const inventory = JSON.parse(
    fs.readFileSync(path.resolve(args.rollbackManifestPath), "utf8")
  ) as ProductionRollbackInventory;

  const prisma = new PrismaClient({
    datasources: {
      db: { url: withPoolParams(databaseUrl, OPERATOR_POOL_DEFAULTS) },
    },
    log: [],
  });
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authAdmin: AuthAdminPort = {
    findAuthUserByEmail: async () => null,
    createUserWithPasswordHash: async () => {
      throw new Error("create not allowed in rollback");
    },
    createUserWithoutPassword: async () => {
      throw new Error("create not allowed in rollback");
    },
    deleteUser: async (authUserId) => {
      const { error } = await admin.auth.admin.deleteUser(authUserId);
      if (error) throw new Error(error.message);
    },
  };

  const businessDb: BusinessDbPort = {
    findUserById: async (userId) =>
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          supabaseAuthUserId: true,
          isActive: true,
          deactivatedAt: true,
        },
      }),
    findUserByAuthId: async (authUserId) =>
      prisma.user.findFirst({
        where: { supabaseAuthUserId: authUserId },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          supabaseAuthUserId: true,
          isActive: true,
          deactivatedAt: true,
        },
      }),
    linkUser: async () => {
      throw new Error("link not allowed in rollback");
    },
    unlinkUser: async (userId) => {
      await prisma.user.update({
        where: { id: userId },
        data: { supabaseAuthUserId: null },
      });
    },
  };

  try {
    const result = await executeProductionAuthRollback({
      inventory,
      confirmRollback: true,
      authAdmin,
      businessDb,
    });
    const outPath = path.resolve(
      path.dirname(path.resolve(args.rollbackManifestPath)),
      `rollback-result-${Date.now()}.json`
    );
    writeJsonArtifact(outPath, result);
    console.log(
      JSON.stringify(
        { ok: true, outPath, entries: result.entries.length },
        null,
        2
      )
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => process.exit(code));
