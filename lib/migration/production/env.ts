/**
 * Env loading helpers for production migration tooling.
 * Never logs secret values.
 */

import fs from "node:fs";
import path from "node:path";

import { OPERATOR_POOL_DEFAULTS } from "@/lib/migration/production/constants";

export type EnvMap = Record<string, string | undefined>;

export function loadEnvFile(filePath: string): EnvMap {
  const out: EnvMap = {};
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

export function mergeEnvFiles(filePaths: string[]): EnvMap {
  let merged: EnvMap = {};
  for (const filePath of filePaths) {
    merged = { ...merged, ...loadEnvFile(filePath) };
  }
  return merged;
}

export function applyEnvToProcess(env: EnvMap): void {
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] == null && typeof v === "string") {
      process.env[k] = v;
    }
  }
}

export function withPoolParams(
  url: string,
  opts: {
    connectionLimit?: number;
    poolTimeout?: number;
  } = OPERATOR_POOL_DEFAULTS
): string {
  const u = new URL(url);
  if (!u.searchParams.get("sslmode")) {
    u.searchParams.set("sslmode", "require");
  }
  if (opts.connectionLimit != null) {
    u.searchParams.set("connection_limit", String(opts.connectionLimit));
  }
  if (opts.poolTimeout != null) {
    u.searchParams.set("pool_timeout", String(opts.poolTimeout));
  }
  return u.toString();
}

export function resolveRepoRoot(fromDir: string = process.cwd()): string {
  let cur = path.resolve(fromDir);
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(cur, "package.json"))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(fromDir);
}

export function envVarPresence(env: EnvMap, keys: string[]): {
  present: string[];
  missing: string[];
} {
  const present: string[] = [];
  const missing: string[] = [];
  for (const key of keys) {
    const v = env[key] ?? process.env[key];
    if (typeof v === "string" && v.trim().length > 0) present.push(key);
    else missing.push(key);
  }
  return { present, missing };
}
