/**
 * Stage 4F — run validation commands against Supabase staging runtime env.
 * Preserves real exit codes in the report JSON.
 */
import { spawnSync } from "node:child_process";
import {
  ROOT,
  assertSupabaseStaging,
  loadStagingEnv,
  maskUrl,
  writeJson,
} from "./_stage4f-lib.mjs";

const envFile = loadStagingEnv();
const host = assertSupabaseStaging(envFile);

const env = {
  ...process.env,
  ...envFile,
  // Ensure Prisma CLI uses staging pooler (not Neon .env alone).
  DATABASE_URL: envFile.DATABASE_URL,
  DIRECT_URL: envFile.DIRECT_URL || envFile.DATABASE_URL,
};

function run(label, command, args, extraEnv = {}) {
  console.log(`\n=== ${label}: ${command} ${args.join(" ")} ===`);
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...env, ...extraEnv },
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  return {
    label,
    command: [command, ...args].join(" "),
    exit: result.status === null ? 1 : result.status,
    ms: Date.now() - started,
    stdout_tail: stdout.slice(-2000),
    stderr_tail: stderr.slice(-2000),
  };
}

const results = [];

results.push(run("prisma_validate", "npx", ["prisma", "validate"]));
results.push(run("prisma_migrate_status", "npx", ["prisma", "migrate", "status"]));
results.push(
  run("npm_test", "npm", ["test"], {
    // Explicit pooler-safe defaults (also enforced in run-tests.mjs).
    TEST_CONCURRENCY: "4",
    PRISMA_CONNECTION_LIMIT: "2",
  })
);
results.push(run("tsc", "npx", ["tsc", "--noEmit"]));
results.push(run("next_build", "npx", ["next", "build"]));

// Optional lint — record but do not treat as migration gate alone.
results.push(run("eslint", "npx", ["eslint", ".", "--max-warnings", "0"]));

const report = {
  stage: "4F",
  mode: "validate",
  at: new Date().toISOString(),
  host,
  runtime: {
    DATABASE_URL: maskUrl(env.DATABASE_URL),
    DIRECT_URL: maskUrl(env.DIRECT_URL),
  },
  results: results.map((r) => ({
    label: r.label,
    command: r.command,
    exit: r.exit,
    ms: r.ms,
  })),
  details: results,
  gates: {
    prisma_validate: results.find((r) => r.label === "prisma_validate")?.exit,
    prisma_migrate_status: results.find((r) => r.label === "prisma_migrate_status")
      ?.exit,
    npm_test: results.find((r) => r.label === "npm_test")?.exit,
    tsc: results.find((r) => r.label === "tsc")?.exit,
    next_build: results.find((r) => r.label === "next_build")?.exit,
    eslint: results.find((r) => r.label === "eslint")?.exit,
  },
};

const criticalOk = ["prisma_validate", "prisma_migrate_status", "npm_test", "tsc", "next_build"].every(
  (k) => report.gates[k] === 0
);
report.critical_passed = criticalOk;

writeJson("scripts/staging/_stage4f-validate.json", report);
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify({ gates: report.gates, critical_passed: criticalOk }, null, 2));
process.exit(criticalOk ? 0 : 1);
