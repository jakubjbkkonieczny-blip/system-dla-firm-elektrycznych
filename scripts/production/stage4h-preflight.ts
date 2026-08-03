/**
 * Stage 4H GO/NO-GO preflight. Does NOT perform cutover.
 *
 * Usage:
 *   npx tsx scripts/production/stage4h-preflight.ts \
 *     --neon-env-file .env \
 *     --supabase-env-file <prod-supabase-env> \
 *     --confirm-production-project-ref <ref> \
 *     [--build-ok|--build-fail] [--tsc-ok|--tsc-fail] \
 *     [--tests-ok|--tests-fail] [--prisma-ok|--prisma-fail] \
 *     [--copy-dry-run-ok|--copy-dry-run-fail]
 */

import path from "node:path";

import {
  ensureArtifactDir,
  evaluateStage4HPreflight,
  loadEnvFile,
  parseConfirmProductionProjectRef,
  resolveRepoRoot,
  writeJsonArtifact,
} from "../../lib/migration/production";

function parseArgs(argv: string[]) {
  let neonEnvFile = ".env";
  let supabaseEnvFile: string | null = null;
  const checks: {
    copyDryRunPassed?: boolean | null;
    buildOk?: boolean | null;
    typecheckOk?: boolean | null;
    testsOk?: boolean | null;
    prismaValidateOk?: boolean | null;
  } = {
    copyDryRunPassed: null,
    buildOk: null,
    typecheckOk: null,
    testsOk: null,
    prismaValidateOk: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case "--neon-env-file":
        neonEnvFile = argv[++i] ?? neonEnvFile;
        break;
      case "--supabase-env-file":
        supabaseEnvFile = argv[++i] ?? null;
        break;
      case "--confirm-production-project-ref":
        i += 1;
        break;
      case "--copy-dry-run-ok":
        checks.copyDryRunPassed = true;
        break;
      case "--copy-dry-run-fail":
        checks.copyDryRunPassed = false;
        break;
      case "--build-ok":
        checks.buildOk = true;
        break;
      case "--build-fail":
        checks.buildOk = false;
        break;
      case "--tsc-ok":
        checks.typecheckOk = true;
        break;
      case "--tsc-fail":
        checks.typecheckOk = false;
        break;
      case "--tests-ok":
        checks.testsOk = true;
        break;
      case "--tests-fail":
        checks.testsOk = false;
        break;
      case "--prisma-ok":
        checks.prismaValidateOk = true;
        break;
      case "--prisma-fail":
        checks.prismaValidateOk = false;
        break;
      case "--help":
      case "-h":
        return { help: true as const };
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }

  return {
    help: false as const,
    neonEnvFile,
    supabaseEnvFile,
    confirm: parseConfirmProductionProjectRef(argv),
    checks,
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
      "Usage: npx tsx scripts/production/stage4h-preflight.ts --neon-env-file <neon> [--supabase-env-file <supabase>] [--confirm-production-project-ref <ref>] [--copy-dry-run-ok] [--tsc-ok] [--build-ok] [--tests-ok] [--prisma-ok]"
    );
    return 0;
  }

  const root = resolveRepoRoot();
  const neonEnv = loadEnvFile(path.resolve(root, args.neonEnvFile));
  const supabaseEnv = args.supabaseEnvFile
    ? loadEnvFile(path.resolve(root, args.supabaseEnvFile))
    : {};

  const report = evaluateStage4HPreflight({
    repoRoot: root,
    neonEnv,
    supabaseEnv,
    confirmProductionProjectRef: args.confirm,
    checks: args.checks,
  });

  const artifact = ensureArtifactDir("preflight", {
    repoRoot: root,
    batchId: `stage4h-${Date.now()}`,
  });
  writeJsonArtifact(path.join(artifact.dir, "stage4h-preflight.json"), report);

  console.log(JSON.stringify(report, null, 2));
  console.log(`WRITES_ENABLED=${report.WRITES_ENABLED}`);
  console.log(report.verdict);
  return report.verdict === "STAGE_4H_PREFLIGHT_READY" ? 0 : 1;
}

main().then((code) => process.exit(code));
