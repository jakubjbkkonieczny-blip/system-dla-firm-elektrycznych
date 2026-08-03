/**
 * Stage 4E — re-run DB-heavy tests that failed under session pool exhaustion.
 * Forces connection_limit=1 and runs files sequentially.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[key] = v;
  }
  return out;
}

function withConnLimit(url, limit) {
  const u = new URL(url);
  u.searchParams.set("sslmode", "require");
  u.searchParams.set("connection_limit", String(limit));
  u.searchParams.set("pool_timeout", "30");
  return u.toString();
}

const envFile = {
  ...loadEnvFile(path.join(root, ".env")),
  ...loadEnvFile(path.join(root, ".env.local")),
};
const databaseUrl = withConnLimit(envFile.DATABASE_URL, 1);
const host = new URL(databaseUrl).hostname;
if (/neon\.tech/i.test(host)) {
  console.error("Refusing Neon");
  process.exit(2);
}

const files = [
  "lib/server/deactivation/__tests__/email-verification-flow.test.ts",
  "lib/server/notifications/__tests__/stage-notifications.test.ts",
  "lib/server/notifications/__tests__/vacation-notifications.test.ts",
];

const results = [];
for (const file of files) {
  console.log("\n===", file, "===");
  // Brief pause to let pooler release sessions
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  const env = {
    ...process.env,
    ...envFile,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
  };
  const r = spawnSync("node", ["scripts/run-tests.mjs", file], {
    cwd: root,
    env,
    encoding: "utf8",
    shell: true,
    stdio: "inherit",
  });
  results.push({ file, exit: r.status });
}

fs.writeFileSync(
  path.join(root, "scripts/staging/_stage4e-retry-tests.json"),
  JSON.stringify(
    { host, connection_limit: 1, results, at: new Date().toISOString() },
    null,
    2
  )
);
console.log(JSON.stringify({ results }, null, 2));
process.exit(results.every((r) => r.exit === 0) ? 0 : 1);
