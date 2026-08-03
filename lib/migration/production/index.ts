/**
 * Stage 4G-B — production-safe migration tooling (library).
 * Does not perform Stage 4H cutover.
 */

export {
  BUSINESS_TABLES,
  FREEZE_OBSERVATION_TABLES,
  IDENTITY_SPECS,
  IMPORT_TABLE_ORDER,
  OPERATOR_POOL_DEFAULTS,
  STAGING_PROJECT_REF,
} from "@/lib/migration/production/constants";

export {
  assessProductionTarget,
  assertNeonSource,
  assertProductionWriteTarget,
  assertSupabaseDestination,
  parseConfirmProductionProjectRef,
  ProductionTargetGuardError,
  refsFromEnv,
} from "@/lib/migration/production/target-guard";

export {
  extractProjectRefFromApiUrl,
  extractProjectRefFromDbUrl,
  identityFingerprint,
  inspectApiUrl,
  inspectDbUrl,
  maskProjectRef,
} from "@/lib/migration/production/identity";

export {
  applyEnvToProcess,
  envVarPresence,
  loadEnvFile,
  mergeEnvFiles,
  resolveRepoRoot,
  withPoolParams,
} from "@/lib/migration/production/env";

export {
  assertArtifactPathSafe,
  defaultArtifactRoot,
  ensureArtifactDir,
  writeJsonArtifact,
} from "@/lib/migration/production/artifacts";

export { exportBusinessTables } from "@/lib/migration/production/copy/export-business";
export { importBusinessTables } from "@/lib/migration/production/copy/import-business";
export { copyDryRun } from "@/lib/migration/production/copy/dry-run";

export {
  parseProductionAuthArgs,
  productionAuthWritesEnabled,
  PRODUCTION_AUTH_CLI_HELP,
} from "@/lib/migration/production/auth/parse-production-args";
export {
  appendRollbackEntry,
  emailFingerprint,
  emptyProductionRollbackInventory,
  executeProductionAuthRollback,
  newProductionAuthBatchId,
} from "@/lib/migration/production/auth/rollback";
export type {
  ProductionRollbackEntry,
  ProductionRollbackInventory,
} from "@/lib/migration/production/auth/rollback";
export {
  buildExceptionList,
  dispositionFor,
} from "@/lib/migration/production/auth/exceptions";

export { validateNeonAgainstSupabase } from "@/lib/migration/production/validate/compare";

export {
  compareFreezeSnapshots,
  takeFreezeSnapshot,
  verifyFreeze,
} from "@/lib/migration/production/freeze/snapshot";

export { evaluateStage4HPreflight } from "@/lib/migration/production/preflight/stage4h-gates";

export {
  buildInsertSql,
  idSetSha256,
  normalizeRowForJsonl,
  sqlLiteral,
  sha256Hex,
} from "@/lib/migration/production/sql-serialize";
