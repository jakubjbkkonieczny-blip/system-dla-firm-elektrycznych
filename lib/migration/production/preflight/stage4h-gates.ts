/**
 * Stage 4H GO/NO-GO preflight checker (does NOT perform cutover).
 */

import fs from "node:fs";
import path from "node:path";

import {
  STAGING_PROJECT_REF,
} from "@/lib/migration/production/constants";
import {
  assertArtifactPathSafe,
  defaultArtifactRoot,
} from "@/lib/migration/production/artifacts";
import { envVarPresence, type EnvMap } from "@/lib/migration/production/env";
import { inspectDbUrl, inspectApiUrl } from "@/lib/migration/production/identity";
import { assessProductionTarget } from "@/lib/migration/production/target-guard";

export type GateResult = {
  id: string;
  ok: boolean;
  detail: string;
};

export type Stage4HPreflightReport = {
  at: string;
  WRITES_ENABLED: false;
  performs_cutover: false;
  gates: GateResult[];
  failed_gates: string[];
  verdict: "STAGE_4H_PREFLIGHT_READY" | "STAGE_4H_PREFLIGHT_BLOCKED";
};

function gate(id: string, ok: boolean, detail: string): GateResult {
  return { id, ok, detail };
}

export function evaluateStage4HPreflight(input: {
  repoRoot: string;
  /** Production Neon source env (read-only). */
  neonEnv: EnvMap;
  /** Production Supabase target env (may be absent → blocked). */
  supabaseEnv: EnvMap;
  confirmProductionProjectRef?: string | null;
  /** Optional prior dry-run / tool availability flags from caller. */
  checks?: {
    copyToolingAvailable?: boolean;
    copyDryRunPassed?: boolean | null;
    authRunnerAvailable?: boolean;
    authDryRunCapable?: boolean;
    validatorAvailable?: boolean;
    freezeDocumented?: boolean;
    buildOk?: boolean | null;
    typecheckOk?: boolean | null;
    testsOk?: boolean | null;
    prismaValidateOk?: boolean | null;
  };
}): Stage4HPreflightReport {
  const gates: GateResult[] = [];
  const c = input.checks ?? {};
  const confirm = input.confirmProductionProjectRef?.trim().toLowerCase() || null;

  gates.push(
    gate(
      "production_project_ref_confirmed",
      Boolean(confirm) && confirm !== STAGING_PROJECT_REF,
      confirm
        ? confirm === STAGING_PROJECT_REF
          ? "confirmed ref is staging"
          : "operator provided confirm-production-project-ref"
        : "missing --confirm-production-project-ref"
    )
  );

  gates.push(
    gate(
      "production_ref_not_staging",
      confirm !== STAGING_PROJECT_REF &&
        inspectDbUrl(input.supabaseEnv.DATABASE_URL).projectRef !==
          STAGING_PROJECT_REF &&
        inspectApiUrl(input.supabaseEnv.NEXT_PUBLIC_SUPABASE_URL).projectRef !==
          STAGING_PROJECT_REF,
      `staging_ref=${STAGING_PROJECT_REF}`
    )
  );

  const neon = inspectDbUrl(input.neonEnv.DATABASE_URL);
  gates.push(
    gate(
      "neon_source_identity_confirmed",
      neon.present && neon.isNeon,
      neon.present
        ? `${neon.hostFamily} ${neon.hostMasked ?? ""} db=${neon.database ?? ""}`
        : "Neon DATABASE_URL missing"
    )
  );

  const target = assessProductionTarget({
    confirmProductionProjectRef: confirm,
    expectedProductionProjectRef: confirm,
    databaseUrl: input.supabaseEnv.DATABASE_URL,
    directUrl: input.supabaseEnv.DIRECT_URL,
    nextPublicSupabaseUrl: input.supabaseEnv.NEXT_PUBLIC_SUPABASE_URL,
    requireWriteConfirmation: Boolean(confirm),
    allowUnconfirmedRead: true,
  });

  gates.push(
    gate(
      "supabase_production_target_identity_confirmed",
      target.status === "PRODUCTION_TARGET_OK" && Boolean(confirm),
      target.status === "PRODUCTION_TARGET_OK"
        ? `ref=${target.projectRefMasked}`
        : target.reasons.join("; ") || target.status
    )
  );

  const copyPath = path.join(
    input.repoRoot,
    "lib/migration/production/copy/export-business.ts"
  );
  const importPath = path.join(
    input.repoRoot,
    "lib/migration/production/copy/import-business.ts"
  );
  gates.push(
    gate(
      "copy_tooling_available",
      c.copyToolingAvailable ??
        (fs.existsSync(copyPath) && fs.existsSync(importPath)),
      "export-business + import-business modules"
    )
  );

  gates.push(
    gate(
      "copy_dry_run_passes",
      c.copyDryRunPassed === true,
      c.copyDryRunPassed == null
        ? "not evaluated in this invocation — run scripts/production/copy-dry-run.ts"
        : c.copyDryRunPassed
          ? "passed"
          : "failed or blocked"
    )
  );

  const authRunner = path.join(
    input.repoRoot,
    "scripts/production/auth-migrate.ts"
  );
  gates.push(
    gate(
      "auth_production_runner_available",
      c.authRunnerAvailable ?? fs.existsSync(authRunner),
      authRunner
    )
  );

  gates.push(
    gate(
      "auth_dry_run_capability",
      c.authDryRunCapable ?? fs.existsSync(authRunner),
      "production auth-migrate defaults to dry-run"
    )
  );

  const validator = path.join(
    input.repoRoot,
    "lib/migration/production/validate/compare.ts"
  );
  gates.push(
    gate(
      "validator_available",
      c.validatorAvailable ?? fs.existsSync(validator),
      validator
    )
  );

  const artifactRoot = defaultArtifactRoot(input.repoRoot);
  const artifactSafety = assertArtifactPathSafe(artifactRoot, input.repoRoot);
  gates.push(
    gate(
      "backup_path_outside_git",
      artifactSafety.outsideGit,
      artifactSafety.outsideGit
        ? artifactSafety.resolved
        : `INSIDE_REPO: ${artifactSafety.resolved}`
    )
  );

  const authEnabled =
    (input.supabaseEnv.SUPABASE_AUTH_ENABLED ??
      input.neonEnv.SUPABASE_AUTH_ENABLED ??
      process.env.SUPABASE_AUTH_ENABLED ??
      "false") === "true";
  gates.push(
    gate(
      "supabase_auth_enabled_false",
      !authEnabled,
      `SUPABASE_AUTH_ENABLED=${authEnabled ? "true" : "false"}`
    )
  );

  const freezeDoc = path.join(
    input.repoRoot,
    "docs/supabase-migration-stage-4g-b.md"
  );
  gates.push(
    gate(
      "freeze_mechanism_documented",
      c.freezeDocumented ?? fs.existsSync(freezeDoc),
      freezeDoc
    )
  );

  gates.push(
    gate(
      "production_destination_state_known",
      Boolean(input.supabaseEnv.DATABASE_URL) &&
        target.status !== "PRODUCTION_TARGET_IDENTITY_UNCONFIRMED",
      input.supabaseEnv.DATABASE_URL
        ? target.status
        : "production Supabase env not configured"
    )
  );

  const required = envVarPresence(
    { ...input.neonEnv, ...input.supabaseEnv },
    confirm
      ? [
          "DATABASE_URL",
          "NEXT_PUBLIC_SUPABASE_URL",
          "SUPABASE_SERVICE_ROLE_KEY",
        ]
      : ["DATABASE_URL"]
  );
  gates.push(
    gate(
      "required_env_presence",
      required.missing.length === 0 || !confirm,
      confirm
        ? required.missing.length
          ? `missing=${required.missing.join(",")}`
          : `present=${required.present.join(",")}`
        : "identity unconfirmed; full env gate deferred"
    )
  );

  gates.push(
    gate(
      "build_status_known",
      c.buildOk !== undefined && c.buildOk !== null,
      c.buildOk == null
        ? "run npx next build"
        : c.buildOk
          ? "ok"
          : "failed"
    )
  );
  gates.push(
    gate(
      "typecheck_status_known",
      c.typecheckOk !== undefined && c.typecheckOk !== null,
      c.typecheckOk == null
        ? "run npx tsc --noEmit"
        : c.typecheckOk
          ? "ok"
          : "failed"
    )
  );
  gates.push(
    gate(
      "test_status_known",
      c.testsOk !== undefined && c.testsOk !== null,
      c.testsOk == null
        ? "run targeted production migration tests"
        : c.testsOk
          ? "ok"
          : "failed"
    )
  );
  gates.push(
    gate(
      "prisma_validate_status_known",
      c.prismaValidateOk !== undefined && c.prismaValidateOk !== null,
      c.prismaValidateOk == null
        ? "run npx prisma validate"
        : c.prismaValidateOk
          ? "ok"
          : "failed"
    )
  );

  // Soft-fail gates that are "known" but failed should block
  for (const g of gates) {
    if (
      (g.id === "build_status_known" ||
        g.id === "typecheck_status_known" ||
        g.id === "test_status_known" ||
        g.id === "prisma_validate_status_known") &&
      g.detail === "failed"
    ) {
      g.ok = false;
    }
  }

  // copy_dry_run not evaluated should block readiness
  const copyGate = gates.find((g) => g.id === "copy_dry_run_passes");
  if (copyGate && c.copyDryRunPassed == null) {
    copyGate.ok = false;
  }

  const failed = gates.filter((g) => !g.ok).map((g) => g.id);
  return {
    at: new Date().toISOString(),
    WRITES_ENABLED: false,
    performs_cutover: false,
    gates,
    failed_gates: failed,
    verdict:
      failed.length === 0
        ? "STAGE_4H_PREFLIGHT_READY"
        : "STAGE_4H_PREFLIGHT_BLOCKED",
  };
}
