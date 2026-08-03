/**
 * Stage 4G-B — production target inventory (masked only).
 * Never prints secrets.
 *
 * Usage:
 *   npx tsx scripts/production/inventory-target.ts
 */

import fs from "node:fs";
import path from "node:path";

import {
  STAGING_PROJECT_REF,
  inspectApiUrl,
  inspectDbUrl,
  loadEnvFile,
  resolveRepoRoot,
} from "../../lib/migration/production";

const FILES = [
  ".env.example",
  ".env",
  ".env.local",
  ".env.supabase-staging",
  ".env.local.stage4e-neon-backup",
  ".env.production",
  ".env.prod",
  ".env.supabase-production",
  ".env.supabase-prod",
];

const KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_AUTH_ENABLED",
  "SESSION_SECRET",
  "VECTORWORK_EXPECTED_PRODUCTION_PROJECT_REF",
];

function main(): number {
  const root = resolveRepoRoot();
  const reports = [];

  for (const file of FILES) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) {
      reports.push({ file, exists: false });
      continue;
    }
    const env = loadEnvFile(full);
    reports.push({
      file,
      exists: true,
      keysPresent: KEYS.filter((k) => Boolean(env[k])),
      keysMissing: KEYS.filter((k) => !env[k]),
      DATABASE_URL: inspectDbUrl(env.DATABASE_URL),
      DIRECT_URL: inspectDbUrl(env.DIRECT_URL),
      NEXT_PUBLIC_SUPABASE_URL: inspectApiUrl(env.NEXT_PUBLIC_SUPABASE_URL),
      SUPABASE_AUTH_ENABLED: env.SUPABASE_AUTH_ENABLED ?? null,
      hasServiceRoleKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      hasPublishableKey: Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      expectedProductionRefConfigured: Boolean(
        env.VECTORWORK_EXPECTED_PRODUCTION_PROJECT_REF
      ),
    });
  }

  const productionCandidates = reports.filter((r) => {
    if (!("DATABASE_URL" in r) || !r.exists) return false;
    const db = (r as { DATABASE_URL: ReturnType<typeof inspectDbUrl> })
      .DATABASE_URL;
    const api = (
      r as { NEXT_PUBLIC_SUPABASE_URL: ReturnType<typeof inspectApiUrl> }
    ).NEXT_PUBLIC_SUPABASE_URL;
    return (
      (db.isSupabase && !db.isStagingRef) ||
      (api.present && !api.isStagingRef && Boolean(api.projectRef))
    );
  });

  const summary = {
    staging_project_ref: STAGING_PROJECT_REF,
    production_target_status: productionCandidates.length
      ? "CANDIDATE_PRESENT"
      : "PRODUCTION_TARGET_IDENTITY_UNCONFIRMED",
    production_candidates: productionCandidates.map((r) => r.file),
    files: reports,
  };

  console.log(JSON.stringify(summary, null, 2));
  return productionCandidates.length ? 0 : 3;
}

process.exit(main());
