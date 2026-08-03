/**
 * CLI argument parsing + safety guards for Stage 4F-Auth migration tool.
 *
 * Default mode is always dry-run. Writes require an explicit --execute flag.
 * Full bulk execute additionally requires --confirm-bulk-migrate.
 */

import type {
  MigrationMode,
  ParsedMigrationArgs,
} from "@/lib/supabase/auth-migration/types";

export class MigrationCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationCliError";
  }
}

export function parseMigrationArgs(
  argv: string[] = process.argv.slice(2)
): ParsedMigrationArgs {
  let mode: MigrationMode = "dry-run";
  let userId: string | null = null;
  let limit: number | null = null;
  let batchSize = 50;
  let confirmBulkMigrate = false;
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

  return {
    mode,
    userId,
    limit,
    batchSize,
    confirmBulkMigrate,
    help,
    raw: [...argv],
  };
}

/**
 * Execute without --user-id and without finite --limit is treated as full bulk
 * and requires --confirm-bulk-migrate. Dry-run never writes.
 */
export function assertExecutionGuards(input: {
  mode: MigrationMode;
  userId: string | null;
  limit: number | null;
  confirmBulkMigrate: boolean;
}): void {
  if (input.mode !== "execute") return;

  const isSingleUser = Boolean(input.userId);
  const isLimitedBatch = input.limit != null && input.limit > 0;
  const isFullBulk = !isSingleUser && !isLimitedBatch;

  if (isFullBulk && !input.confirmBulkMigrate) {
    throw new MigrationCliError(
      "Refusing full bulk --execute without --confirm-bulk-migrate. " +
        "Use --user-id <id>, --limit <n>, or add --confirm-bulk-migrate after human review."
    );
  }
}

/** True when the parsed args would enable Auth/DB writes. */
export function writesEnabled(args: ParsedMigrationArgs): boolean {
  return args.mode === "execute";
}

export const MIGRATION_CLI_HELP = `
Stage 4F-Auth — VectorWork → Supabase Auth identity migration

Default: --dry-run (no Auth writes, no User.supabaseAuthUserId writes)

Usage:
  npx tsx scripts/staging/_stage4f-auth-migrate.ts [options]

Options:
  --dry-run                 Validate/classify only (default)
  --execute                 Perform writes (requires additional scope flags)
  --user-id <id>            Restrict to one User.id
  --limit <n>               Process at most n executable candidates
  --batch-size <n>          Batch size for reporting/progress (default 50)
  --confirm-bulk-migrate    Required for full bulk --execute (no --user-id/--limit)
  --help                    Show help

Safety:
  no flag                 → dry-run
  --dry-run               → validation only
  --execute --user-id ... → one reviewed user
  --execute --limit ...   → controlled batch
  --execute (bulk)        → requires --confirm-bulk-migrate
`.trim();
