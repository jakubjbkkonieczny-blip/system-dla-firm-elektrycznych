/**
 * Read-only freeze verifier. Never creates probe rows.
 *
 * Usage:
 *   npx tsx scripts/production/freeze-verify.ts --env-file <neon-or-prod-env> --interval-seconds 60
 */

import path from "node:path";

import {
  ensureArtifactDir,
  loadEnvFile,
  resolveRepoRoot,
  verifyFreeze,
  writeJsonArtifact,
} from "../../lib/migration/production";

function parseArgs(argv: string[]) {
  let envFile = ".env";
  let intervalSeconds = 60;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--env-file") envFile = argv[++i] ?? envFile;
    else if (a === "--interval-seconds") {
      intervalSeconds = Number.parseInt(argv[++i] ?? "", 10);
    } else if (a === "--help" || a === "-h") return { help: true as const };
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 1) {
    throw new Error("--interval-seconds must be >= 1");
  }
  return { help: false as const, envFile, intervalSeconds };
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
      "Usage: npx tsx scripts/production/freeze-verify.ts --env-file <env> --interval-seconds <n>"
    );
    return 0;
  }

  const root = resolveRepoRoot();
  const env = loadEnvFile(path.resolve(root, args.envFile));
  if (!env.DATABASE_URL) {
    console.error("BLOCKED: DATABASE_URL missing");
    return 1;
  }

  const report = await verifyFreeze({
    databaseUrl: env.DATABASE_URL,
    intervalMs: args.intervalSeconds * 1000,
  });

  const artifact = ensureArtifactDir("freeze", { repoRoot: root });
  writeJsonArtifact(path.join(artifact.dir, "freeze-verify.json"), report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`WRITES_ENABLED=${report.WRITES_ENABLED}`);
  console.log(report.verdict);
  return report.ok ? 0 : 1;
}

main().then((code) => process.exit(code));
