/**
 * Stage 4F-Auth — VectorWork → Supabase Auth identity migration tooling.
 *
 * THIS MODULE DOES NOT RUN BULK MIGRATION BY DEFAULT.
 * Default CLI mode is dry-run (no writes).
 */

export {
  classifyUser,
  classifyUsers,
  emptyCategoryCounts,
  inspectPasswordHash,
  isExecutableCategory,
  maskEmail,
  normalizeMigrationEmail,
} from "@/lib/supabase/auth-migration/classify";

export {
  assertExecutionGuards,
  MigrationCliError,
  MIGRATION_CLI_HELP,
  parseMigrationArgs,
  writesEnabled,
} from "@/lib/supabase/auth-migration/parse-args";

export {
  buildSingleUserMaps,
  migrateOneUser,
  outcomeAfterSuccessfulExecute,
  selectExecutableCandidates,
} from "@/lib/supabase/auth-migration/migrate-user";
export type { MigrateOneResult } from "@/lib/supabase/auth-migration/migrate-user";

export {
  assertSafeReportPayload,
  buildClassificationReport,
  buildRunSummary,
  emptyRollbackManifest,
  newBatchId,
  tallyOutcomes,
} from "@/lib/supabase/auth-migration/report";

export type {
  AuthAdminPort,
  AuthUserRow,
  BusinessDbPort,
  BusinessUserRow,
  CategoryCounts,
  ClassifiedUser,
  MigrationCategory,
  MigrationMode,
  MigrationOutcome,
  MigrationReportRow,
  MigrationRunSummary,
  ParsedMigrationArgs,
  PasswordHashInfo,
  ProposedAction,
  RollbackManifest,
} from "@/lib/supabase/auth-migration/types";
