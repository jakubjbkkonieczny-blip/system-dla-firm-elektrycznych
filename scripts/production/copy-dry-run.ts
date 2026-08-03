/**
 * Business copy dry-run / preflight. WRITES_ENABLED=false always.
 *
 * Usage:
 *   npx tsx scripts/production/copy-dry-run.ts \
 *     --source-env-file .env \
 *     --dest-env-file <prod-supabase-env> \
 *     --confirm-production-project-ref <ref>
 */

import path from "node:path";

import {
  copyDryRun,
  loadEnvFile,
  parseConfirmProductionProjectRef,
  resolveRepoRoot,
  writeJsonArtifact,
  ensureArtifactDir,
} from "../../lib/migration/production";

function parseArgs(argv: string[]) {
  let sourceEnvFile = ".env";
  let destEnvFile: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--source-env-file") sourceEnvFile = argv[++i] ?? sourceEnvFile;
    else if (a === "--dest-env-file") destEnvFile = argv[++i] ?? null;
    else if (a === "--confirm-production-project-ref") i += 1;
    else if (a === "--help" || a === "-h") return { help: true as const };
    else throw new Error(`Unknown argument: ${a}`);
  }
  return {
    help: false as const,
    sourceEnvFile,
    destEnvFile,
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
      "Usage: npx tsx scripts/production/copy-dry-run.ts --source-env-file <neon> [--dest-env-file <supabase>] [--confirm-production-project-ref <ref>]"
    );
    return 0;
  }

  const root = resolveRepoRoot();
  const sourceEnv = loadEnvFile(path.resolve(root, args.sourceEnvFile));
  const destEnv = args.destEnvFile
    ? loadEnvFile(path.resolve(root, args.destEnvFile))
    : {};

  if (!sourceEnv.DATABASE_URL) {
    console.error("BLOCKED: source DATABASE_URL missing");
    return 1;
  }

  const report = await copyDryRun({
    sourceDatabaseUrl: sourceEnv.DATABASE_URL,
    destinationDatabaseUrl: destEnv.DATABASE_URL,
    confirmProductionProjectRef: args.confirm,
    nextPublicSupabaseUrl: destEnv.NEXT_PUBLIC_SUPABASE_URL,
    repoRoot: root,
  });

  const artifact = ensureArtifactDir("preflight", {
    repoRoot: root,
    batchId: `copy-dry-run-${Date.now()}`,
  });
  writeJsonArtifact(path.join(artifact.dir, "copy-dry-run.json"), report);

  console.log(JSON.stringify(report, null, 2));
  console.log(`WRITES_ENABLED=${report.WRITES_ENABLED}`);
  console.log(report.verdict);
  return report.ok ? 0 : 1;
}

main().then((code) => process.exit(code));
