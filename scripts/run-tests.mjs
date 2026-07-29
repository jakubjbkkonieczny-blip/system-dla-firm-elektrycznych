/**
 * Deterministic test runner for Windows + Unix.
 *
 * - Discovers only `*.test.ts` files under `lib/`
 * - Never treats directories as test targets
 * - Propagates the child process exit code (no || true, no exit overwrite)
 * - Extra CLI args are accepted only if they are `*.test.ts` files
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

const result = spawnSync(
  process.execPath,
  [tsxCli, "--test", ...files],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
    windowsHide: true,
  }
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
