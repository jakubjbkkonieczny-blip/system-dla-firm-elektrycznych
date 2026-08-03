/**
 * Stage 4E — run npm test with staging Supabase DATABASE_URL from .env.local.
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

const envFile = {
  ...loadEnvFile(path.join(root, ".env")),
  ...loadEnvFile(path.join(root, ".env.local")),
};
const host = new URL(envFile.DATABASE_URL).hostname;
if (/neon\.tech/i.test(host) || !/supabase/i.test(host)) {
  console.error("Refusing: expected Supabase staging in .env.local, got", host);
  process.exit(2);
}

console.log("npm test against host:", host);

const env = { ...process.env, ...envFile };
// Ensure no leftover Neon override
delete env.DOTENV_CONFIG_PATH;

const r = spawnSync("npm", ["test"], {
  cwd: root,
  env,
  encoding: "utf8",
  shell: true,
  stdio: "inherit",
});

console.log(`TEST_EXIT=${r.status}`);
fs.writeFileSync(
  path.join(root, "scripts/staging/_stage4e-npm-test.json"),
  JSON.stringify(
    {
      host,
      exit: r.status,
      at: new Date().toISOString(),
      note: "npm test with .env.local Supabase staging DATABASE_URL/DIRECT_URL",
    },
    null,
    2
  )
);
process.exit(r.status ?? 1);
