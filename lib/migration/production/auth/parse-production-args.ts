/**
 * Production Auth migration CLI args.
 * Extends Stage 4F-Auth guards with production project confirmation.
 * Default mode is always dry-run.
 */

import {
  assertExecutionGuards,
  MigrationCliError,
} from "@/lib/supabase/auth-migration/parse-args";
import type { MigrationMode } from "@/lib/supabase/auth-migration/types";
import { STAGING_PROJECT_REF } from "@/lib/migration/production/constants";

export type ParsedProductionAuthArgs = {
  mode: MigrationMode;
  userId: string | null;
  limit: number | null;
  batchSize: number;
  confirmBulkMigrate: boolean;
  confirmProductionProjectRef: string | null;
  /** Rollback path only — never implied by migrate. */
  confirmRollback: boolean;
  rollbackManifestPath: string | null;
  artifactDir: string | null;
  sourceEnvFile: string | null;
  help: boolean;
  raw: string[];
};

export function parseProductionAuthArgs(
  argv: string[] = process.argv.slice(2)
): ParsedProductionAuthArgs {
  let mode: MigrationMode = "dry-run";
  let userId: string | null = null;
  let limit: number | null = null;
  let batchSize = 50;
  let confirmBulkMigrate = false;
  let confirmProductionProjectRef: string | null = null;
  let confirmRollback = false;
  let rollbackManifestPath: string | null = null;
  let artifactDir: string | null = null;
  let sourceEnvFile: string | null = null;
  let help = false;
  let sawDryRun = false;
  let sawExecute = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        help = true;
        break;
      case "--dry-run":
        sawDryRun = true;
        mode = "dry-run";
        break;
      case "--execute":
        sawExecute = true;
        mode = "execute";
        break;
      case "--confirm-bulk-migrate":
        confirmBulkMigrate = true;
        break;
      case "--confirm-production-project-ref": {
        const value = argv[++i];
        if (!value || value.startsWith("--")) {
          throw new MigrationCliError(
            "--confirm-production-project-ref requires a value"
          );
        }
        confirmProductionProjectRef = value.trim().toLowerCase();
        break;
      }
      case "--confirm-rollback":
        confirmRollback = true;
        break;
      case "--rollback-manifest": {
        const value = argv[++i];
        if (!value || value.startsWith("--")) {
          throw new MigrationCliError("--rollback-manifest requires a path");
        }
        rollbackManifestPath = value;
        break;
      }
      case "--artifact-dir": {
        const value = argv[++i];
        if (!value || value.startsWith("--")) {
          throw new MigrationCliError("--artifact-dir requires a path");
        }
        artifactDir = value;
        break;
      }
      case "--env-file": {
        const value = argv[++i];
        if (!value || value.startsWith("--")) {
          throw new MigrationCliError("--env-file requires a path");
        }
        sourceEnvFile = value;
        break;
      }
      case "--user-id": {
        const value = argv[++i];
        if (!value || value.startsWith("--")) {
          throw new MigrationCliError("--user-id requires a value");
        }
        userId = value.trim();
        break;
      }
      case "--limit": {
        const value = argv[++i];
        if (!value || value.startsWith("--")) {
          throw new MigrationCliError("--limit requires a positive integer");
        }
        const n = Number.parseInt(value, 10);
        if (!Number.isFinite(n) || n <= 0) {
          throw new MigrationCliError("--limit must be a positive integer");
        }
        limit = n;
        break;
      }
      case "--batch-size": {
        const value = argv[++i];
        if (!value || value.startsWith("--")) {
          throw new MigrationCliError("--batch-size requires a positive integer");
        }
        const n = Number.parseInt(value, 10);
        if (!Number.isFinite(n) || n <= 0) {
          throw new MigrationCliError("--batch-size must be a positive integer");
        }
        batchSize = n;
        break;
      }
      default:
        throw new MigrationCliError(`Unknown argument: ${arg}`);
    }
  }

  if (sawDryRun && sawExecute) {
    throw new MigrationCliError("Pass only one of --dry-run or --execute");
  }

  assertExecutionGuards({
    mode,
    userId,
    limit,
    confirmBulkMigrate,
  });

  if (mode === "execute") {
    if (!confirmProductionProjectRef) {
      throw new MigrationCliError(
        "Refusing production Auth --execute without --confirm-production-project-ref <ref>"
      );
    }
    if (confirmProductionProjectRef === STAGING_PROJECT_REF) {
      throw new MigrationCliError(
        `Refusing staging project ref ${STAGING_PROJECT_REF} as production Auth target`
      );
    }
  }

  return {
    mode,
    userId,
    limit,
    batchSize,
    confirmBulkMigrate,
    confirmProductionProjectRef,
    confirmRollback,
    rollbackManifestPath,
    artifactDir,
    sourceEnvFile,
    help,
    raw: [...argv],
  };
}

export function productionAuthWritesEnabled(
  args: ParsedProductionAuthArgs
): boolean {
  return args.mode === "execute";
}

export const PRODUCTION_AUTH_CLI_HELP = `
Stage 4G-B / 4H — Production Supabase Auth identity migration

DEFAULT: --dry-run (no Auth writes, no User.supabaseAuthUserId writes)

Usage:
  npx tsx scripts/production/auth-migrate.ts [options]

Options:
  --dry-run                              Classify/validate only (default)
  --execute                              Perform writes (requires confirmations)
  --confirm-production-project-ref <ref> Required for --execute (never inferred)
  --user-id <id>                         Pilot: one business User.id
  --limit <n>                            Pilot: at most n executable candidates
  --batch-size <n>                       Reporting batch size (default 50)
  --confirm-bulk-migrate                 Required for unrestricted bulk --execute
  --env-file <path>                      Env file with production Supabase target
  --artifact-dir <path>                  Override artifact root (default outside git)
  --help                                 Show help

Safety:
  staging ref ${STAGING_PROJECT_REF} is always refused
  Neon is refused as Auth/business target
  never overwrites non-null supabaseAuthUserId
  never claims User by email alone
  never logs password hashes / service role keys
`.trim();
