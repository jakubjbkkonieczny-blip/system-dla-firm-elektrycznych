/**
 * Stage 4E — switch staging runtime (.env.local) to Supabase Session pooler.
 * Leaves .env (Neon) untouched for rollback.
 * Does not print secrets.
 */
import fs from "node:fs";
import path from "node:path";
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

function withSsl(url) {
  const u = new URL(url);
  if (!u.searchParams.get("sslmode")) u.searchParams.set("sslmode", "require");
  return u.toString();
}

function mask(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "(default)",
    user: decodeURIComponent(u.username),
    sslmode: u.searchParams.get("sslmode"),
    neon: /\.neon\.tech$/i.test(u.hostname),
    supabase: /supabase\.(com|co)$/i.test(u.hostname),
  };
}

const sb = loadEnvFile(path.join(root, ".env.supabase-staging"));
const neon = loadEnvFile(path.join(root, ".env"));
const pooler = withSsl(sb.DATABASE_URL);

if (!/pooler\.supabase\.com/i.test(pooler)) {
  throw new Error("Safety: expected session pooler host");
}
if (/neon\.tech/i.test(pooler)) {
  throw new Error("Safety: pooler URL looks like Neon");
}
if (!/yzezdhwffgamtmozmfse/i.test(pooler)) {
  throw new Error("Safety: unexpected Supabase project ref");
}
if (!/\.neon\.tech$/i.test(new URL(neon.DATABASE_URL).hostname)) {
  throw new Error("Safety: .env is not Neon — refusing cutover");
}

const localPath = path.join(root, ".env.local");
const backupPath = path.join(root, ".env.local.stage4e-neon-backup");
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(localPath, backupPath);
}

let local = fs.readFileSync(localPath, "utf8");
if (!/^DATABASE_URL=/m.test(local) || !/^DIRECT_URL=/m.test(local)) {
  throw new Error("missing DATABASE_URL/DIRECT_URL in .env.local");
}

const quoted = JSON.stringify(pooler);
local = local.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${quoted}`);
local = local.replace(/^DIRECT_URL=.*$/m, `DIRECT_URL=${quoted}`);

if (!local.includes("Stage 4E staging DB cutover")) {
  local =
    "# Stage 4E staging DB cutover: Supabase Session pooler (direct host IPv6-only/unreachable from this machine).\n" +
    "# Neon rollback: restore DATABASE_URL/DIRECT_URL from .env.local.stage4e-neon-backup (or copy from .env).\n" +
    local;
}

fs.writeFileSync(localPath, local);

const after = loadEnvFile(localPath);
const report = {
  cutover: "staging .env.local only",
  backup: path.basename(backupPath),
  production_env_untouched: /\.neon\.tech$/i.test(
    new URL(neon.DATABASE_URL).hostname
  ),
  DATABASE_URL: mask(after.DATABASE_URL),
  DIRECT_URL: mask(after.DIRECT_URL),
  no_neon_in_staging_runtime:
    !mask(after.DATABASE_URL).neon && !mask(after.DIRECT_URL).neon,
  same_project:
    /yzezdhwffgamtmozmfse/.test(after.DATABASE_URL) &&
    /yzezdhwffgamtmozmfse/.test(after.DIRECT_URL),
  auth_host: (after.NEXT_PUBLIC_SUPABASE_URL || "").replace(/^https?:\/\//, ""),
  SUPABASE_AUTH_ENABLED: after.SUPABASE_AUTH_ENABLED,
};

console.log(JSON.stringify(report, null, 2));
if (
  !report.production_env_untouched ||
  !report.no_neon_in_staging_runtime ||
  !report.same_project
) {
  process.exit(1);
}
