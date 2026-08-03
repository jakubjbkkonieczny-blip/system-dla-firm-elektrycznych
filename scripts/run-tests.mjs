/**
 * Deterministic test runner for Windows + Unix.
 *
 * - Discovers only `*.test.ts` files under `lib/`
 * - Never treats directories as test targets
 * - Propagates the child process exit code (no || true, no exit overwrite)
 * - Extra CLI args are accepted only if they are `*.test.ts` files
 *
 * Supabase Session pooler safety (Stage 4F):
 * Parallel Node test workers each create a PrismaClient. Session pool capacity
 * is small (~15). When DATABASE_URL points at *.pooler.supabase.com, this runner
 * caps --test-concurrency and applies a low per-process connection_limit unless
 * explicitly overridden via TEST_CONCURRENCY / PRISMA_CONNECTION_LIMIT.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIB_ROOT = join(ROOT, "lib");
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");

function collectTestFiles(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(absolute, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      out.push(absolute);
    }
  }
}

function toPosixRelative(absolutePath) {
  return relative(ROOT, absolutePath).split(sep).join("/");
}

function resolveArgAsTestFile(arg) {
  const absolute = join(ROOT, arg);
  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    throw new Error(`Test path does not exist: ${arg}`);
  }
  if (!stats.isFile() || !absolute.endsWith(".test.ts")) {
    throw new Error(
      `Refusing non-test path (directories and non-*.test.ts are not valid targets): ${arg}`
    );
  }
  return absolute;
}

function isSupabaseSessionPooler(urlString) {
  if (!urlString) return false;
  try {
    return /pooler\.supabase\.com$/i.test(new URL(urlString).hostname);
  } catch {
    return false;
  }
}

function withPoolParams(urlString, connectionLimit) {
  const u = new URL(urlString);
  if (!u.searchParams.get("sslmode")) {
    u.searchParams.set("sslmode", "require");
  }
  u.searchParams.set("connection_limit", String(connectionLimit));
  if (!u.searchParams.get("pool_timeout")) {
    u.searchParams.set("pool_timeout", "30");
  }
  return u.toString();
}

const discovered = [];
collectTestFiles(LIB_ROOT, discovered);
discovered.sort((a, b) => a.localeCompare(b));

const extraArgs = process.argv.slice(2);
let files;
try {
  files =
    extraArgs.length > 0
      ? extraArgs.map(resolveArgAsTestFile)
      : discovered;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

if (files.length === 0) {
  console.error("No *.test.ts files found under lib/");
  process.exit(1);
}

console.log(`Running ${files.length} test file(s):`);
for (const file of files) {
  console.log(`  - ${toPosixRelative(file)}`);
}

const childEnv = { ...process.env };
const databaseUrl = childEnv.DATABASE_URL || "";
const pooler = isSupabaseSessionPooler(databaseUrl);
const nodeArgs = [tsxCli, "--test"];

if (pooler) {
  // Stay under Session pool ~15: concurrency * connection_limit <= ~12.
  const connectionLimit = Math.max(
    1,
    Number.parseInt(childEnv.PRISMA_CONNECTION_LIMIT || "2", 10) || 2
  );
  const concurrency = Math.max(
    1,
    Number.parseInt(childEnv.TEST_CONCURRENCY || "4", 10) || 4
  );
  childEnv.DATABASE_URL = withPoolParams(databaseUrl, connectionLimit);
  if (childEnv.DIRECT_URL && isSupabaseSessionPooler(childEnv.DIRECT_URL)) {
    childEnv.DIRECT_URL = withPoolParams(childEnv.DIRECT_URL, connectionLimit);
  } else if (!childEnv.DIRECT_URL) {
    childEnv.DIRECT_URL = childEnv.DATABASE_URL;
  }
  nodeArgs.push(`--test-concurrency=${concurrency}`);
  console.log(
    `[run-tests] Supabase Session pooler detected — test-concurrency=${concurrency}, connection_limit=${connectionLimit}`
  );
} else if (childEnv.TEST_CONCURRENCY) {
  const concurrency = Math.max(
    1,
    Number.parseInt(childEnv.TEST_CONCURRENCY, 10) || 1
  );
  nodeArgs.push(`--test-concurrency=${concurrency}`);
}

nodeArgs.push(...files);

const result = spawnSync(process.execPath, nodeArgs, {
  cwd: ROOT,
  stdio: "inherit",
  env: childEnv,
  windowsHide: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
