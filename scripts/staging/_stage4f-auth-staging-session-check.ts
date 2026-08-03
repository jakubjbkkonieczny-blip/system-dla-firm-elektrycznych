/**
 * Read-only structural session-resolution checks on migrated staging users.
 * Does NOT sign in as real users or reset passwords.
 */
import path from "node:path";
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
  withPoolParams,
  writeJson,
  ROOT,
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

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function loadEnv(): StagingEnv {
  const overlay = loadEnvFile(path.join(ROOT, ".env.supabase-staging"));
  const base = loadStagingEnv();
  return { ...overlay, ...base };
}

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] == null && typeof v === "string") process.env[k] = v;
  }
  assertSupabaseStaging(env);
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: withPoolParams(env.DATABASE_URL!, {
          connectionLimit: 1,
          poolTimeout: 30,
        }),
      },
    },
  });

  const samples = {
    active_bcrypt: await prisma.user.findFirst({
      where: {
        isActive: true,
        supabaseAuthUserId: { not: null },
        passwordHash: { startsWith: "$2" },
      },
    }),
    active_placeholder: await prisma.user.findFirst({
      where: {
        isActive: true,
        supabaseAuthUserId: { not: null },
        OR: [{ passwordHash: "testhash" }, { passwordHash: "hash" }],
      },
    }),
    inactive_bcrypt: await prisma.user.findFirst({
      where: {
        isActive: false,
        supabaseAuthUserId: { not: null },
        passwordHash: { startsWith: "$2" },
      },
    }),
    inactive_placeholder: await prisma.user.findFirst({
      where: {
        isActive: false,
        supabaseAuthUserId: { not: null },
        OR: [{ passwordHash: "testhash" }, { passwordHash: "hash" }],
      },
    }),
  };

  const results: Record<string, unknown> = {};

  for (const [kind, user] of Object.entries(samples)) {
    if (!user?.supabaseAuthUserId || !user.email) {
      results[kind] = { ok: false, reason: "sample missing" };
      continue;
    }

    const identity: VerifiedAuthIdentity = {
      authUserId: user.supabaseAuthUserId,
      email: user.email,
      emailConfirmed: true,
    };

    try {
      const resolved = await resolveLinkedUser(prisma, identity);
      results[kind] = {
        ok: kind.startsWith("active_"),
        userId: user.id,
        authUserId: user.supabaseAuthUserId,
        resolvedUserId: resolved.id,
        isActive: user.isActive,
        hashKind: BCRYPT_RE.test(user.passwordHash || "")
          ? "bcrypt"
          : "placeholder",
        expected:
          kind.startsWith("active_")
            ? "structural resolve success"
            : "AUTH_USER_INACTIVE",
        note:
          kind === "active_placeholder"
            ? "Linked resolution succeeds structurally; login still requires password reset path"
            : undefined,
      };
    } catch (error) {
      const category =
        error instanceof SupabaseAuthError ? error.category : "UNKNOWN";
      const expectedInactive = kind.startsWith("inactive_");
      results[kind] = {
        ok: expectedInactive && category === "AUTH_USER_INACTIVE",
        userId: user.id,
        authUserId: user.supabaseAuthUserId,
        isActive: user.isActive,
        hashKind: BCRYPT_RE.test(user.passwordHash || "")
          ? "bcrypt"
          : "placeholder",
        category,
        expected: expectedInactive
          ? "AUTH_USER_INACTIVE"
          : "structural resolve success",
      };
    }
  }

  const report = {
    stage: "4F-auth-staging-session-check",
    at: new Date().toISOString(),
    mode: "structural_resolveLinkedUser_only",
    results,
    ok: Object.values(results).every(
      (r) => (r as { ok?: boolean }).ok === true
    ),
  };

  writeJson("scripts/staging/_stage4f-auth-staging-session-check.json", report);
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
  process.exit(report.ok ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
