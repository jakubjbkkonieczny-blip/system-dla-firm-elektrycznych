/**
 * Production-safe Neon → JSONL business export (SELECT-only).
 *
 * Usage:
 *   npx tsx scripts/production/export-business.ts --env-file .env --out <dir>
 *
 * Default --out is outside the git repo under vectorwork-migration-artifacts/.
 */

import path from "node:path";

import {
  ensureArtifactDir,
  exportBusinessTables,
  loadEnvFile,
  resolveRepoRoot,
} from "../../lib/migration/production";

function parseArgs(argv: string[]) {
  let envFile: string | null = null;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--env-file") envFile = argv[++i] ?? null;
    else if (a === "--out") out = argv[++i] ?? null;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: npx tsx scripts/production/export-business.ts --env-file <neon-env> [--out <dir>]`);
      return { help: true as const };
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return { help: false as const, envFile, out };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return 0;

  const root = resolveRepoRoot();
  const envPath = path.resolve(root, args.envFile ?? ".env");
  const env = loadEnvFile(envPath);
  if (!env.DATABASE_URL) {
    console.error("BLOCKED: missing DATABASE_URL in env file");
    return 1;
  }

  const artifact = args.out
    ? {
        dir: path.resolve(args.out),
        outsideGit: true,
        warnings: [] as string[],
      }
    : ensureArtifactDir("business-export", { repoRoot: root });

  if (artifact.warnings.length) {
    for (const w of artifact.warnings) console.warn(`WARN: ${w}`);
  }

  try {
    const manifest = await exportBusinessTables({
      sourceDatabaseUrl: env.DATABASE_URL,
      outputDir: artifact.dir,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          WRITES_ENABLED: false,
          location: manifest.location,
          source: manifest.source,
          table_count: Object.keys(manifest.tables).length,
          totals: Object.fromEntries(
            Object.entries(manifest.tables).map(([k, v]) => [k, v.row_count])
          ),
        },
        null,
        2
      )
    );
    return 0;
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Export failed"
    );
    return 1;
  }
}

main().then((code) => process.exit(code));
