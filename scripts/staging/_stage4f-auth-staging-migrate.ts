/**
 * Stage 4F-Auth-Staging — controlled full-cohort Auth migration on staging only.
 *
 * Safety:
 * - Asserts Supabase staging DB (refuses Neon)
 * - Requires matching preflight classification vs known baseline
 * - Writes only via existing migrate tool with --execute --limit
 * - Never logs password hashes / tokens / service-role keys
 *
 * Usage:
 *   npx tsx scripts/staging/_stage4f-auth-staging-migrate.ts --manifest-only
 *   npx tsx scripts/staging/_stage4f-auth-staging-migrate.ts --execute-batches --batch-size 50
 *   npx tsx scripts/staging/_stage4f-auth-staging-migrate.ts --validate-only
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);

import {
  assertSafeReportPayload,
  classifyUsers,
  isExecutableCategory,
  normalizeMigrationEmail,
  type ClassifiedUser,
  type MigrationCategory,
  type ProposedAction,
} from "../../lib/supabase/auth-migration";
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
  BASELINE,
} = stage4fLib as unknown as {
  ROOT: string;
  BASELINE: { users: number; companies: number; jobs: number };
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

const EXPECTED_CLASSIFICATION = {
  A_BCRYPT_ACTIVE: 1414,
  B_BCRYPT_INACTIVE: 845,
  C_PLACEHOLDER_ACTIVE: 909,
  D_PLACEHOLDER_INACTIVE: 436,
  E_INVALID_EMAIL: 1,
  F_DUPLICATE_EMAIL: 0,
  G_ALREADY_LINKED: 0,
  H_AUTH_EMAIL_CONFLICT: 0,
  I_EXCEPTIONAL: 0,
} as const;

const MANIFEST_PATH = "scripts/staging/_stage4f-auth-staging-manifest.json";
const BATCH_LOG_PATH = "scripts/staging/_stage4f-auth-staging-batches.json";
const FINAL_PATH = "scripts/staging/_stage4f-auth-staging-final.json";

const STAGING_PROJECT_REF = "yzezdhwffgamtmozmfse";

function loadEnvForAuthMigrate(): StagingEnv {
  const overlay = loadEnvFile(path.join(ROOT, ".env.supabase-staging"));
  const base = loadStagingEnv();
  return { ...overlay, ...base };
}

function emailFingerprint(normalizedEmail: string | null): string | null {
  if (!normalizedEmail) return null;
  return createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 16);
}

function parseArgs(argv: string[]) {
  let manifestOnly = false;
  let executeBatches = false;
  let validateOnly = false;
  let batchSize = 50;
  let maxBatches: number | null = null;
  let resume = false;
  let skipPreflight = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--manifest-only":
        manifestOnly = true;
        break;
      case "--execute-batches":
        executeBatches = true;
        break;
      case "--validate-only":
        validateOnly = true;
        break;
      case "--resume":
        resume = true;
        break;
      case "--batch-size": {
        const v = Number.parseInt(argv[++i] ?? "", 10);
        if (!Number.isFinite(v) || v < 1 || v > 100) {
          throw new Error("--batch-size must be 1..100");
        }
        batchSize = v;
        break;
      }
      case "--max-batches": {
        const v = Number.parseInt(argv[++i] ?? "", 10);
        if (!Number.isFinite(v) || v < 1) {
          throw new Error("--max-batches must be a positive integer");
        }
        maxBatches = v;
        break;
      }
      case "--skip-preflight":
        // Intentionally unsupported for safety — keep parsing to fail closed.
        skipPreflight = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (skipPreflight) {
    throw new Error("Refusing --skip-preflight for staging migration safety");
  }

  const modes = [manifestOnly, executeBatches, validateOnly].filter(Boolean).length;
  if (modes !== 1) {
    throw new Error(
      "Pass exactly one of --manifest-only | --execute-batches | --validate-only"
    );
  }

  if (resume && !executeBatches) {
    throw new Error("--resume requires --execute-batches");
  }

  return {
    manifestOnly,
    executeBatches,
    validateOnly,
    batchSize,
    maxBatches,
    resume,
  };
}

async function getCounts(prisma: PrismaClient) {
  const [users, companies, jobs, linked, authUsers] = await Promise.all([
    prisma.user.count(),
    prisma.company.count(),
    prisma.job.count(),
    prisma.user.count({ where: { supabaseAuthUserId: { not: null } } }),
    prisma.$queryRaw<Array<{ c: bigint }>>`SELECT count(*)::bigint AS c FROM auth.users`,
  ]);
  return {
    users,
    companies,
    jobs,
    linked,
    auth_users: Number(authUsers[0]?.c ?? 0),
  };
}

function assertBaselineClassification(categoryCounts: Record<string, number>) {
  const mismatches: string[] = [];
  for (const [k, expected] of Object.entries(EXPECTED_CLASSIFICATION)) {
    const actual = categoryCounts[k] ?? -1;
    if (actual !== expected) {
      mismatches.push(`${k}: expected ${expected}, got ${actual}`);
    }
  }
  return mismatches;
}

type ManifestCandidate = {
  userId: string;
  emailMasked: string;
  emailFingerprint: string | null;
  previousSupabaseAuthUserId: string | null;
  classification: MigrationCategory;
  proposedAction: ProposedAction;
  isActive: boolean;
  intendedMigrationAction: ProposedAction;
};

async function buildContext() {
  const env = loadEnvForAuthMigrate();
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] == null && typeof v === "string") process.env[k] = v;
  }

  if (!env.DATABASE_URL) throw new Error("BLOCKED: missing DATABASE_URL");
  const host = assertSupabaseStaging(env);
  const url = withPoolParams(env.DATABASE_URL, {
    connectionLimit: 1,
    poolTimeout: 30,
  });

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : "";
  const projectRef = supabaseHost.split(".")[0] ?? "";
  if (projectRef !== STAGING_PROJECT_REF) {
    throw new Error(
      `BLOCKED: unexpected Supabase project ref ${projectRef || "(missing)"}`
    );
  }
  if (!supabaseUrl.includes(STAGING_PROJECT_REF)) {
    throw new Error("BLOCKED: NEXT_PUBLIC_SUPABASE_URL is not staging project");
  }
  if (!String(env.DATABASE_URL).includes(STAGING_PROJECT_REF)) {
    throw new Error("BLOCKED: DATABASE_URL does not include staging project ref");
  }
  if (/\.neon\.tech/i.test(host)) {
    throw new Error("BLOCKED: Neon host refused");
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  return { env, host, url, prisma, projectRef, supabaseUrl };
}

async function classifyAll(prisma: PrismaClient) {
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
  const authUsersRaw = await prisma.$queryRaw<
    Array<{ id: string; email: string | null }>
  >`SELECT id::text AS id, email FROM auth.users`;

  const { classified, categoryCounts } = classifyUsers({
    users: usersRaw,
    authUsers: authUsersRaw,
  });

  return { usersRaw, authUsersRaw, classified, categoryCounts };
}

function buildManifest(input: {
  classified: ClassifiedUser[];
  counts: Awaited<ReturnType<typeof getCounts>>;
  projectRef: string;
  host: string;
  databaseMasked: Record<string, unknown>;
  preflightMismatches: string[];
}) {
  const candidates: ManifestCandidate[] = input.classified.map((row) => ({
    userId: row.userId,
    emailMasked: row.emailMasked,
    emailFingerprint: emailFingerprint(row.emailNormalized),
    previousSupabaseAuthUserId: row.alreadyLinkedAuthUserId,
    classification: row.category,
    proposedAction: row.proposedAction,
    isActive: row.isActive,
    intendedMigrationAction: row.proposedAction,
  }));

  const executable = candidates.filter((c) =>
    isExecutableCategory(c.classification)
  );
  const manual = candidates.filter((c) => c.classification === "E_INVALID_EMAIL");

  return {
    stage: "4F-auth-staging",
    purpose: "full staging cohort Auth identity migration (rehearsal-shaped real data)",
    at: new Date().toISOString(),
    targetSupabaseProject: input.projectRef,
    runtimeHost: input.host,
    database: input.databaseMasked,
    architecture: "auth.users.id → User.supabaseAuthUserId → User.id",
    preRun: {
      authUsersCount: input.counts.auth_users,
      linkedCount: input.counts.linked,
      businessUsers: input.counts.users,
      companies: input.counts.companies,
      jobs: input.counts.jobs,
    },
    expectedBaseline: {
      users: BASELINE.users,
      companies: BASELINE.companies,
      jobs: BASELINE.jobs,
      linked: 0,
      classification: EXPECTED_CLASSIFICATION,
    },
    preflightMismatches: input.preflightMismatches,
    preflightOk: input.preflightMismatches.length === 0,
    totals: {
      candidates: candidates.length,
      executable: executable.length,
      manualReviewRequired: manual.length,
    },
    manualExceptions: manual.map((m) => ({
      userId: m.userId,
      emailMasked: m.emailMasked,
      classification: m.classification,
      status: "MANUAL_REVIEW_REQUIRED",
      note: "Invalid email — skipped; User.id unchanged; no Auth identity created",
    })),
    candidates,
    secretsPolicy: [
      "No passwordHash",
      "No access/refresh/Google tokens",
      "No DB credentials",
      "No service-role keys",
    ],
    rollbackGuidance: [
      "Never delete business User rows.",
      "For each successful link in batch logs: UPDATE User SET supabaseAuthUserId=NULL WHERE id=<userId> AND supabaseAuthUserId=<authUuid>.",
      "Then Admin deleteUser(<authUuid>) for identities created by this migration (vectorwork_migration=4F-auth in app_metadata).",
      "Do not delete Auth identities that existed before preRun.authUsersCount baseline unless explicitly listed as created by a batch.",
      "Do not fabricate emails or invent passwords during rollback.",
    ],
  };
}

function runMigrateLimit(limit: number): {
  exitCode: number;
  stdout: string;
  stderr: string;
  error: string | null;
} {
  // Resolve tsx CLI and invoke via node — avoids Windows spawnSync(npx.cmd) EINVAL.
  let tsxCli: string;
  try {
    tsxCli = require.resolve("tsx/cli");
  } catch {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Unable to resolve tsx/cli",
      error: "tsx_resolve_failed",
    };
  }

  const result = spawnSync(
    process.execPath,
    [
      tsxCli,
      path.join(ROOT, "scripts/staging/_stage4f-auth-migrate.ts"),
      "--execute",
      "--limit",
      String(limit),
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      shell: false,
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
    }
  );
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error.message ?? result.error) : null,
  };
}

function readExecuteReport() {
  const full = path.join(ROOT, "scripts/staging/_stage4f-auth-migrate-execute.json");
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8")) as {
    outcomeCounts?: Record<string, number>;
    totalConsidered?: number;
    rows?: Array<{
      userId: string;
      emailMasked: string;
      category: string;
      outcome: string;
      authUserId: string | null;
      failureReason: string | null;
      compensated: boolean;
    }>;
    rollbackManifest?: {
      batchId: string;
      createdAuthUserIds: string[];
      linkedUserIds: Array<{
        userId: string;
        previousSupabaseAuthUserId: string | null;
        newSupabaseAuthUserId: string;
      }>;
    };
  };
}

async function integrityChecks(prisma: PrismaClient) {
  const duplicateAuthLinks = await prisma.$queryRaw<
    Array<{ supabaseAuthUserId: string; c: bigint }>
  >`
    SELECT "supabaseAuthUserId", count(*)::bigint AS c
    FROM "User"
    WHERE "supabaseAuthUserId" IS NOT NULL
    GROUP BY "supabaseAuthUserId"
    HAVING count(*) > 1
  `;

  const linkedUsers = await prisma.user.findMany({
    where: { supabaseAuthUserId: { not: null } },
    select: { id: true, email: true, supabaseAuthUserId: true, isActive: true },
  });

  const authRows = await prisma.$queryRaw<
    Array<{ id: string; email: string | null; app_metadata: unknown }>
  >`
    SELECT id::text AS id, email, raw_app_meta_data AS app_metadata
    FROM auth.users
  `;
  const authById = new Map(authRows.map((a) => [a.id, a]));

  let emailMismatches = 0;
  let missingAuth = 0;
  let metadataUserIdMismatch = 0;
  const migrationAuthIds = new Set<string>();

  for (const u of linkedUsers) {
    const auth = authById.get(u.supabaseAuthUserId!);
    if (!auth) {
      missingAuth += 1;
      continue;
    }
    const bizEmail = normalizeMigrationEmail(u.email);
    const authEmail = normalizeMigrationEmail(auth.email);
    if (bizEmail && authEmail && bizEmail !== authEmail) emailMismatches += 1;

    const meta =
      auth.app_metadata && typeof auth.app_metadata === "object"
        ? (auth.app_metadata as Record<string, unknown>)
        : {};
    if (meta.vectorwork_migration === "4F-auth") {
      migrationAuthIds.add(auth.id);
      if (meta.vectorwork_user_id && meta.vectorwork_user_id !== u.id) {
        metadataUserIdMismatch += 1;
      }
    }
  }

  const unlinked = await prisma.user.findMany({
    where: { supabaseAuthUserId: null },
    select: { id: true, email: true },
  });

  const invalidUnlinked = unlinked.filter(
    (u) => !normalizeMigrationEmail(u.email)
  );

  // Auth identities with migration marker but no business link
  let orphanMigrationAuth = 0;
  for (const a of authRows) {
    const meta =
      a.app_metadata && typeof a.app_metadata === "object"
        ? (a.app_metadata as Record<string, unknown>)
        : {};
    if (meta.vectorwork_migration !== "4F-auth") continue;
    const linked = linkedUsers.some((u) => u.supabaseAuthUserId === a.id);
    if (!linked) orphanMigrationAuth += 1;
  }

  return {
    duplicateAuthLinks: duplicateAuthLinks.map((r) => ({
      supabaseAuthUserId: r.supabaseAuthUserId,
      count: Number(r.c),
    })),
    emailMismatches,
    missingAuth,
    metadataUserIdMismatch,
    orphanMigrationAuth,
    linkedCount: linkedUsers.length,
    unlinkedCount: unlinked.length,
    invalidEmailUnlinkedCount: invalidUnlinked.length,
    invalidEmailUnlinkedUserIds: invalidUnlinked.map((u) => u.id),
    migrationMarkedAuthCount: migrationAuthIds.size,
  };
}

async function sampleSessionResolution(
  prisma: PrismaClient,
  env: StagingEnv
): Promise<Record<string, unknown>> {
  // Structural only — do not impersonate / reset real users.
  const samples = {
    active_bcrypt: await prisma.user.findFirst({
      where: {
        isActive: true,
        supabaseAuthUserId: { not: null },
        passwordHash: { startsWith: "$2" },
      },
      select: { id: true, isActive: true, supabaseAuthUserId: true, email: true },
    }),
    active_placeholder: await prisma.user.findFirst({
      where: {
        isActive: true,
        supabaseAuthUserId: { not: null },
        OR: [{ passwordHash: "testhash" }, { passwordHash: "hash" }],
      },
      select: { id: true, isActive: true, supabaseAuthUserId: true, email: true },
    }),
    inactive_bcrypt: await prisma.user.findFirst({
      where: {
        isActive: false,
        supabaseAuthUserId: { not: null },
        passwordHash: { startsWith: "$2" },
      },
      select: { id: true, isActive: true, supabaseAuthUserId: true, email: true },
    }),
    inactive_placeholder: await prisma.user.findFirst({
      where: {
        isActive: false,
        supabaseAuthUserId: { not: null },
        OR: [{ passwordHash: "testhash" }, { passwordHash: "hash" }],
      },
      select: { id: true, isActive: true, supabaseAuthUserId: true, email: true },
    }),
  };

  const out: Record<string, unknown> = {};
  for (const [kind, user] of Object.entries(samples)) {
    if (!user?.supabaseAuthUserId) {
      out[kind] = { ok: false, reason: "no sample found" };
      continue;
    }
    const auth = await prisma.$queryRaw<
      Array<{ id: string; email: string | null; app_metadata: unknown }>
    >`
      SELECT id::text AS id, email, raw_app_meta_data AS app_metadata
      FROM auth.users
      WHERE id = ${user.supabaseAuthUserId}::uuid
      LIMIT 1
    `;
    const a = auth[0];
    const meta =
      a?.app_metadata && typeof a.app_metadata === "object"
        ? (a.app_metadata as Record<string, unknown>)
        : {};
    const mappingOk =
      Boolean(a) &&
      a.id === user.supabaseAuthUserId &&
      normalizeMigrationEmail(a.email) === normalizeMigrationEmail(user.email);

    // Business inactive semantics: access denied when isActive=false
    const businessAccess =
      user.isActive === false
        ? "DENIED_INACTIVE"
        : kind.includes("placeholder")
          ? "LINKED_RESET_REQUIRED_STRUCTURAL"
          : "LINKED_ACTIVE_STRUCTURAL";

    out[kind] = {
      ok: mappingOk,
      userId: user.id,
      authUserId: user.supabaseAuthUserId,
      isActive: user.isActive,
      mapping: mappingOk
        ? "auth.users.id → User.supabaseAuthUserId → User.id"
        : "BROKEN",
      password_reset_required_meta: Boolean(meta.password_reset_required),
      businessAccess,
      note: "No login impersonation; structural mapping + isActive semantics only",
    };
  }

  // Confirm Admin client can see staging project (no user mutation).
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    out.adminListUsersProbe = { ok: !error, error: error?.message ?? null };
  }

  return out;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const ctx = await buildContext();
  const { prisma, env, host, url, projectRef } = ctx;

  try {
    if (args.validateOnly) {
      const counts = await getCounts(prisma);
      const integrity = await integrityChecks(prisma);
      const samples = await sampleSessionResolution(prisma, env);
      const { categoryCounts } = await classifyAll(prisma);
      const report = {
        stage: "4F-auth-staging",
        mode: "validate-only",
        at: new Date().toISOString(),
        projectRef,
        counts,
        categoryCounts,
        integrity,
        samples,
      };
      assertSafeReportPayload(report);
      writeJson(FINAL_PATH, report);
      console.log(JSON.stringify(report, null, 2));
      return 0;
    }

    const counts = await getCounts(prisma);
    const { classified, categoryCounts } = await classifyAll(prisma);

    // Preflight: only enforce exact baseline when nothing has been migrated yet.
    const preflightMismatches: string[] = [];
    if (counts.users !== BASELINE.users) {
      preflightMismatches.push(
        `users: expected ${BASELINE.users}, got ${counts.users}`
      );
    }
    if (counts.companies !== BASELINE.companies) {
      preflightMismatches.push(
        `companies: expected ${BASELINE.companies}, got ${counts.companies}`
      );
    }
    if (counts.jobs !== BASELINE.jobs) {
      preflightMismatches.push(
        `jobs: expected ${BASELINE.jobs}, got ${counts.jobs}`
      );
    }

    if ((args.manifestOnly || args.executeBatches) && !args.resume) {
      // Fresh staging migration: linked must be 0 and classification exact.
      if (counts.linked !== 0) {
        preflightMismatches.push(`linked: expected 0, got ${counts.linked}`);
      }
      preflightMismatches.push(...assertBaselineClassification(categoryCounts));
    } else if (args.resume) {
      // Resume after partial staging batches: business baseline + project only.
      if (counts.linked <= 0) {
        preflightMismatches.push(
          "resume requested but linked=0 — use --execute-batches without --resume"
        );
      }
      if (categoryCounts.E_INVALID_EMAIL !== 1) {
        preflightMismatches.push(
          `E_INVALID_EMAIL: expected 1, got ${categoryCounts.E_INVALID_EMAIL}`
        );
      }
      if (categoryCounts.F_DUPLICATE_EMAIL !== 0) {
        preflightMismatches.push(
          `F_DUPLICATE_EMAIL: expected 0, got ${categoryCounts.F_DUPLICATE_EMAIL}`
        );
      }
      if (categoryCounts.H_AUTH_EMAIL_CONFLICT !== 0) {
        preflightMismatches.push(
          `H_AUTH_EMAIL_CONFLICT: expected 0, got ${categoryCounts.H_AUTH_EMAIL_CONFLICT}`
        );
      }
    }

    const manifest = buildManifest({
      classified,
      counts,
      projectRef,
      host,
      databaseMasked: maskUrl(url),
      preflightMismatches,
    });
    assertSafeReportPayload(manifest);
    // Preserve the original pre-execution manifest once written.
    if (!args.resume || !fs.existsSync(path.join(ROOT, MANIFEST_PATH))) {
      writeJson(MANIFEST_PATH, manifest);
    }

    console.log(
      JSON.stringify(
        {
          stage: "4F-auth-staging",
          mode: args.manifestOnly ? "manifest-only" : "preflight",
          preflightOk: manifest.preflightOk,
          preflightMismatches,
          totals: manifest.totals,
          preRun: manifest.preRun,
          manifest: MANIFEST_PATH,
        },
        null,
        2
      )
    );

    if (!manifest.preflightOk) {
      console.error("STAGE 4F-AUTH-STAGING BLOCKED");
      return 3;
    }

    if (args.manifestOnly) return 0;

    // --- execute batches ---
    type BatchLog = {
      stage: "4F-auth-staging";
      startedAt: string;
      batchSize: number;
      projectRef: string;
      batches: Array<Record<string, unknown>>;
      cumulative: Record<string, number>;
      /** Full rollback inventory across batches (no secrets). */
      rollbackInventory: Array<{
        batch: number;
        batchId: string | null;
        userId: string;
        previousSupabaseAuthUserId: string | null;
        authUserId: string;
        outcome: string;
      }>;
      stoppedEarly: boolean;
      stopReason: string | null;
      finishedAt?: string;
    };

    const existingBatchLogPath = path.join(ROOT, BATCH_LOG_PATH);
    let batchLog: BatchLog;
    let batchIndex = 0;

    if (args.resume && fs.existsSync(existingBatchLogPath)) {
      batchLog = JSON.parse(
        fs.readFileSync(existingBatchLogPath, "utf8")
      ) as BatchLog;
      // Drop trailing zero-progress / failed spawn batches before continuing.
      while (batchLog.batches.length > 0) {
        const last = batchLog.batches[batchLog.batches.length - 1] as {
          linked?: number;
          created?: number;
          exitCode?: number;
          staleReport?: boolean;
        };
        const noProgress =
          (last.linked ?? 0) === 0 && (last.created ?? 0) === 0;
        if (noProgress || last.staleReport || (last.exitCode ?? 0) !== 0) {
          batchLog.batches.pop();
          continue;
        }
        break;
      }
      // Recompute cumulative from remaining successful batches.
      batchLog.cumulative = {
        attempted: 0,
        created: 0,
        linked: 0,
        skipped: 0,
        failed: 0,
        rolled_back: 0,
        auth_conflict: 0,
        business_conflict: 0,
      };
      for (const b of batchLog.batches) {
        const row = b as Record<string, number>;
        batchLog.cumulative.attempted += row.attempted ?? 0;
        batchLog.cumulative.created += row.created ?? 0;
        batchLog.cumulative.linked += row.linked ?? 0;
        batchLog.cumulative.skipped += row.skipped ?? 0;
        batchLog.cumulative.failed += row.failed ?? 0;
        batchLog.cumulative.rolled_back += row.rolled_back ?? 0;
        batchLog.cumulative.auth_conflict += row.auth_conflict ?? 0;
        batchLog.cumulative.business_conflict += row.business_conflict ?? 0;
      }
      batchIndex = batchLog.batches.length;
      batchLog.batchSize = args.batchSize;
      batchLog.stoppedEarly = false;
      batchLog.stopReason = null;
      batchLog.finishedAt = undefined;
    } else {
      batchLog = {
        stage: "4F-auth-staging",
        startedAt: new Date().toISOString(),
        batchSize: args.batchSize,
        projectRef,
        batches: [],
        cumulative: {
          attempted: 0,
          created: 0,
          linked: 0,
          skipped: 0,
          failed: 0,
          rolled_back: 0,
          auth_conflict: 0,
          business_conflict: 0,
        },
        rollbackInventory: [],
        stoppedEarly: false,
        stopReason: null,
      };
    }
    let consecutiveFailureBatches = 0;

    while (true) {
      if (args.maxBatches != null && batchIndex >= args.maxBatches) break;

      const remaining = await prisma.user.count({
        where: { supabaseAuthUserId: null },
      });
      // 1 invalid email will remain unlinked
      if (remaining <= 1) break;

      batchIndex += 1;
      const beforeLinked = await prisma.user.count({
        where: { supabaseAuthUserId: { not: null } },
      });
      const beforeAuth = Number(
        (
          await prisma.$queryRaw<Array<{ c: bigint }>>`
            SELECT count(*)::bigint AS c FROM auth.users
          `
        )[0]?.c ?? 0
      );

      const previousBatchId =
        batchLog.batches.length > 0
          ? ((batchLog.batches[batchLog.batches.length - 1] as { batchId?: string })
              .batchId ?? null)
          : null;

      const run = runMigrateLimit(args.batchSize);
      const report = readExecuteReport();
      const afterLinked = await prisma.user.count({
        where: { supabaseAuthUserId: { not: null } },
      });
      const afterAuth = Number(
        (
          await prisma.$queryRaw<Array<{ c: bigint }>>`
            SELECT count(*)::bigint AS c FROM auth.users
          `
        )[0]?.c ?? 0
      );

      const reportBatchId = report?.rollbackManifest?.batchId ?? null;
      const staleReport =
        Boolean(previousBatchId) &&
        Boolean(reportBatchId) &&
        reportBatchId === previousBatchId;

      const outcomes = report?.outcomeCounts ?? {};
      const created = afterAuth - beforeAuth;
      const linkedDelta = afterLinked - beforeLinked;

      if (run.error || staleReport || (run.exitCode !== 0 && linkedDelta === 0)) {
        batchLog.stoppedEarly = true;
        batchLog.stopReason = run.error
          ? `spawn error: ${run.error}`
          : staleReport
            ? "Stale execute report (child migrate did not run)"
            : `migrate tool exitCode=${run.exitCode}`;
        batchLog.batches.push({
          batch: batchIndex,
          batchId: reportBatchId,
          exitCode: run.exitCode,
          attempted: 0,
          created: 0,
          linked: 0,
          skipped: 0,
          failed: 0,
          rolled_back: 0,
          auth_conflict: 0,
          business_conflict: 0,
          staleReport,
          spawnError: run.error,
          stderrTail: run.stderr.slice(-500) || null,
        });
        writeJson(BATCH_LOG_PATH, batchLog);
        console.log(
          JSON.stringify(
            { progress: batchLog.batches[batchLog.batches.length - 1] },
            null,
            2
          )
        );
        break;
      }

      const failed =
        (outcomes.FAILED ?? 0) +
        (outcomes.AUTH_CONFLICT ?? 0) +
        (outcomes.BUSINESS_CONFLICT ?? 0) +
        (outcomes.INVALID_PASSWORD_HASH ?? 0);
      const rolledBack = outcomes.ROLLED_BACK ?? 0;
      const skipped =
        (outcomes.ALREADY_MIGRATED ?? 0) + (outcomes.SKIPPED ?? 0);
      const successOutcomes =
        (outcomes.READY ?? 0) +
        (outcomes.RESET_REQUIRED ?? 0) +
        (outcomes.INACTIVE ?? 0);

      // Persist per-batch execute artifact before the next overwrite.
      if (report) {
        const batchArtifact = `scripts/staging/_stage4f-auth-staging-batch-${String(batchIndex).padStart(3, "0")}.json`;
        writeJson(batchArtifact, {
          batch: batchIndex,
          capturedAt: new Date().toISOString(),
          report,
        });
      }

      for (const link of report?.rollbackManifest?.linkedUserIds ?? []) {
        const row = (report?.rows ?? []).find((r) => r.userId === link.userId);
        batchLog.rollbackInventory.push({
          batch: batchIndex,
          batchId: report?.rollbackManifest?.batchId ?? null,
          userId: link.userId,
          previousSupabaseAuthUserId: link.previousSupabaseAuthUserId,
          authUserId: link.newSupabaseAuthUserId,
          outcome: row?.outcome ?? "UNKNOWN",
        });
      }

      const batchSummary = {
        batch: batchIndex,
        batchId: report?.rollbackManifest?.batchId ?? null,
        exitCode: run.exitCode,
        attempted: report?.totalConsidered ?? 0,
        created,
        linked: linkedDelta,
        successOutcomes,
        skipped,
        failed,
        rolled_back: rolledBack,
        auth_conflict: outcomes.AUTH_CONFLICT ?? 0,
        business_conflict: outcomes.BUSINESS_CONFLICT ?? 0,
        outcomeCounts: outcomes,
        before: { linked: beforeLinked, auth_users: beforeAuth },
        after: { linked: afterLinked, auth_users: afterAuth },
        rollback: {
          createdAuthUserIds:
            report?.rollbackManifest?.createdAuthUserIds?.length ?? 0,
          linkedUserIds: report?.rollbackManifest?.linkedUserIds?.length ?? 0,
        },
        failureSamples: (report?.rows ?? [])
          .filter((r) =>
            ["FAILED", "AUTH_CONFLICT", "BUSINESS_CONFLICT", "ROLLED_BACK"].includes(
              r.outcome
            )
          )
          .slice(0, 5)
          .map((r) => ({
            userId: r.userId,
            outcome: r.outcome,
            failureReason: r.failureReason,
            compensated: r.compensated,
          })),
        stderrTail: run.stderr.slice(-500) || null,
      };

      batchLog.batches.push(batchSummary);
      batchLog.cumulative.attempted += batchSummary.attempted;
      batchLog.cumulative.created += created;
      batchLog.cumulative.linked += linkedDelta;
      batchLog.cumulative.skipped += skipped;
      batchLog.cumulative.failed += failed;
      batchLog.cumulative.rolled_back += rolledBack;
      batchLog.cumulative.auth_conflict += batchSummary.auth_conflict;
      batchLog.cumulative.business_conflict += batchSummary.business_conflict;

      writeJson(BATCH_LOG_PATH, batchLog);
      console.log(JSON.stringify({ progress: batchSummary }, null, 2));

      // Stop conditions
      if (run.exitCode !== 0) {
        batchLog.stoppedEarly = true;
        batchLog.stopReason = `migrate tool exitCode=${run.exitCode}`;
        break;
      }
      if ((outcomes.AUTH_CONFLICT ?? 0) > 0) {
        batchLog.stoppedEarly = true;
        batchLog.stopReason = "AUTH_CONFLICT encountered";
        break;
      }
      if (failed > 0 || rolledBack > 0) {
        consecutiveFailureBatches += 1;
      } else {
        consecutiveFailureBatches = 0;
      }
      if (consecutiveFailureBatches >= 2) {
        batchLog.stoppedEarly = true;
        batchLog.stopReason = "Repeated failures across batches";
        break;
      }
      if (failed > Math.max(3, Math.floor(args.batchSize * 0.1))) {
        batchLog.stoppedEarly = true;
        batchLog.stopReason = "High failure rate in batch";
        break;
      }
      if (linkedDelta === 0 && successOutcomes === 0) {
        batchLog.stoppedEarly = true;
        batchLog.stopReason = "No progress in batch";
        break;
      }

      // Brief pause to reduce Admin API pressure
      await new Promise((r) => setTimeout(r, 500));
    }

    batchLog.finishedAt = new Date().toISOString();
    writeJson(BATCH_LOG_PATH, batchLog);

    const finalCounts = await getCounts(prisma);
    const integrity = await integrityChecks(prisma);
    const samples = await sampleSessionResolution(prisma, env);
    const postClassify = await classifyAll(prisma);

    const finalReport = {
      stage: "4F-auth-staging",
      at: new Date().toISOString(),
      projectRef,
      batchLogSummary: {
        batches: batchLog.batches.length,
        cumulative: batchLog.cumulative,
        stoppedEarly: batchLog.stoppedEarly,
        stopReason: batchLog.stopReason,
      },
      finalCounts,
      categoryCounts: postClassify.categoryCounts,
      integrity,
      samples,
      businessBaselineIntact:
        finalCounts.users === BASELINE.users &&
        finalCounts.companies === BASELINE.companies &&
        finalCounts.jobs === BASELINE.jobs,
    };
    assertSafeReportPayload(finalReport);
    writeJson(FINAL_PATH, finalReport);
    console.log(JSON.stringify(finalReport, null, 2));

    if (batchLog.stoppedEarly) return 4;
    if (!finalReport.businessBaselineIntact) return 5;
    if (finalCounts.linked !== 3604) return 6;
    if (integrity.duplicateAuthLinks.length > 0) return 7;
    if (integrity.missingAuth > 0 || integrity.emailMismatches > 0) return 8;
    if (integrity.orphanMigrationAuth > 0) return 9;
    if (integrity.invalidEmailUnlinkedCount !== 1) return 10;

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
