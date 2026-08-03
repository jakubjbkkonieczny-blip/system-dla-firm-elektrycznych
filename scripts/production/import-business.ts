/**
 * Production-safe business import into Supabase.
 * Refuses staging. Requires --confirm-production-project-ref and --execute.
 * Never truncates a non-empty destination.
 *
 * Usage:
 *   npx tsx scripts/production/import-business.ts \
 *     --export-dir <dir> \
 *     --env-file <prod-supabase-env> \
 *     --confirm-production-project-ref <ref> \
 *     --execute
 */

import path from "node:path";

import {
  importBusinessTables,
  loadEnvFile,
  parseConfirmProductionProjectRef,
  resolveRepoRoot,
  STAGING_PROJECT_REF,
} from "../../lib/migration/production";

function parseArgs(argv: string[]) {
  let exportDir: string | null = null;
  let envFile: string | null = null;
  let execute = false;
  let batchSize = 100;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--export-dir") exportDir = argv[++i] ?? null;
    else if (a === "--env-file") envFile = argv[++i] ?? null;
    else if (a === "--execute") execute = true;
    else if (a === "--batch-size") {
      batchSize = Number.parseInt(argv[++i] ?? "", 10);
    } else if (a === "--confirm-production-project-ref") {
      i += 1; // consumed by parseConfirmProductionProjectRef
    } else if (a === "--help" || a === "-h") {
      return { help: true as const };
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return {
    help: false as const,
    exportDir,
    envFile,
    execute,
    batchSize,
    confirm: parseConfirmProductionProjectRef(argv),
  };
}

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 2;
  }
  if (args.help) {
    console.log(
      "Usage: npx tsx scripts/production/import-business.ts --export-dir <dir> --env-file <env> --confirm-production-project-ref <ref> --execute"
    );
    return 0;
  }

  if (!args.execute) {
    console.error(
      "Refusing import writes without --execute (use copy-dry-run.ts for preflight)"
    );
    return 2;
  }
  if (!args.confirm) {
    console.error(
      "Refusing import without --confirm-production-project-ref <ref>"
    );
    return 2;
  }
  if (args.confirm === STAGING_PROJECT_REF) {
    console.error(`Refusing staging project ref ${STAGING_PROJECT_REF}`);
    return 2;
  }
  if (!args.exportDir || !args.envFile) {
    console.error("BLOCKED: --export-dir and --env-file are required");
    return 2;
  }

  const root = resolveRepoRoot();
  const env = loadEnvFile(path.resolve(root, args.envFile));
  if (!env.DATABASE_URL) {
    console.error("BLOCKED: destination DATABASE_URL missing");
    return 1;
  }

  const result = await importBusinessTables({
    exportDir: path.resolve(root, args.exportDir),
    destinationDatabaseUrl: env.DATABASE_URL,
    confirmProductionProjectRef: args.confirm,
    nextPublicSupabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    batchSize: args.batchSize,
    execute: true,
  });

  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

main().then((code) => process.exit(code));
