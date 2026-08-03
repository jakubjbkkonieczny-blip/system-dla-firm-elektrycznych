/**
 * Stage 4E — run Prisma CLI against staging runtime (.env.local).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile(filePath) {
  const out = {};
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

const local = loadEnvFile(path.join(root, ".env.local"));
const host = new URL(local.DATABASE_URL).hostname;
if (/neon\.tech/i.test(host)) {
  console.error("Refusing: .env.local still Neon");
  process.exit(2);
}
if (!/supabase/i.test(host)) {
  console.error("Refusing: .env.local not Supabase", host);
  process.exit(2);
}

const env = {
  ...process.env,
  DATABASE_URL: local.DATABASE_URL,
  DIRECT_URL: local.DIRECT_URL || local.DATABASE_URL,
};

console.log("Using host:", host);

function run(args) {
  console.log("\n> npx", args.join(" "));
  const r = spawnSync("npx", args, {
    cwd: root,
    env,
    encoding: "utf8",
    shell: true,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  console.log(`EXIT=${r.status}`);
  return r.status ?? 1;
}

const codes = {
  validate: run(["prisma", "validate"]),
  migrate_status: run(["prisma", "migrate", "status"]),
};

fs.writeFileSync(
  path.join(root, "scripts/staging/_stage4e-prisma-cli.json"),
  JSON.stringify({ host, codes, at: new Date().toISOString() }, null, 2)
);

process.exit(Object.values(codes).every((c) => c === 0) ? 0 : 1);
