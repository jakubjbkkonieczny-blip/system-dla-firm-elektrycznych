/**
 * Shared helpers for Stage 4F staging stabilization scripts.
 * Never logs secrets.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const BASELINE = { users: 3605, companies: 2543, jobs: 58 };

export function loadEnvFile(filePath) {
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

export function loadStagingEnv() {
  return {
    ...loadEnvFile(path.join(ROOT, ".env")),
    ...loadEnvFile(path.join(ROOT, ".env.local")),
  };
}

export function assertSupabaseStaging(env) {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("missing DATABASE_URL");
  const host = new URL(url).hostname;
  if (/neon\.tech/i.test(host)) {
    throw new Error(`Refusing Neon host: ${host}`);
  }
  if (!/pooler\.supabase\.com/i.test(host) && !/supabase\.(com|co)/i.test(host)) {
    throw new Error(`Expected Supabase host, got: ${host}`);
  }
  return host;
}

export function withPoolParams(url, { connectionLimit, poolTimeout = 30 } = {}) {
  const u = new URL(url);
  if (!u.searchParams.get("sslmode")) u.searchParams.set("sslmode", "require");
  if (connectionLimit != null) {
    u.searchParams.set("connection_limit", String(connectionLimit));
  }
  if (poolTimeout != null) {
    u.searchParams.set("pool_timeout", String(poolTimeout));
  }
  return u.toString();
}

export function maskUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "(default)",
    user: decodeURIComponent(u.username),
    db: u.pathname.replace(/^\//, "") || "(default)",
    sslmode: u.searchParams.get("sslmode"),
    connection_limit: u.searchParams.get("connection_limit"),
    pool_timeout: u.searchParams.get("pool_timeout"),
    isNeon: /\.neon\.tech$/i.test(u.hostname),
    isSupabasePooler: /pooler\.supabase\.com/i.test(u.hostname),
    isSupabaseDirect: /^db\.[a-z0-9]+\.supabase\.co$/i.test(u.hostname),
  };
}

export function writeJson(relPath, data) {
  const full = path.join(ROOT, relPath);
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n");
  return full;
}
