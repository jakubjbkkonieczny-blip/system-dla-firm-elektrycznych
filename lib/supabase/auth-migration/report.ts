/**
 * Secret-safe migration reporting helpers.
 */

import { randomBytes } from "node:crypto";

import type {
  CategoryCounts,
  ClassifiedUser,
  MigrationOutcome,
  MigrationReportRow,
  MigrationRunSummary,
  ParsedMigrationArgs,
  RollbackManifest,
} from "@/lib/supabase/auth-migration/types";

export function newBatchId(): string {
  return `4f-auth-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`;
}

export function emptyRollbackManifest(batchId: string): RollbackManifest {
  return {
    batchId,
    createdAuthUserIds: [],
    linkedUserIds: [],
    guidance: [
      "Never delete business User rows as part of Auth rollback.",
      "Safe rollback for this batch: unlink User.supabaseAuthUserId for linkedUserIds where previous was null, then Admin deleteUser for createdAuthUserIds.",
      "Do not delete Auth identities that existed before the batch (not listed in createdAuthUserIds).",
      "Partial batches: resume with the same tool (idempotent); already-linked rows become ALREADY_MIGRATED.",
    ],
  };
}

export function tallyOutcomes(
  rows: MigrationReportRow[]
): Partial<Record<MigrationOutcome, number>> {
  const out: Partial<Record<MigrationOutcome, number>> = {};
  for (const row of rows) {
    out[row.outcome] = (out[row.outcome] ?? 0) + 1;
  }
  return out;
}

export function buildRunSummary(input: {
  mode: ParsedMigrationArgs["mode"];
  args: ParsedMigrationArgs;
  writesEnabled: boolean;
  categoryCounts: CategoryCounts;
  rows: MigrationReportRow[];
  rollback: RollbackManifest;
  notes?: string[];
}): MigrationRunSummary {
  return {
    stage: "4F-auth",
    mode: input.mode,
    at: new Date().toISOString(),
    architecture: "auth.users.id → User.supabaseAuthUserId → User.id",
    writesEnabled: input.writesEnabled,
    args: {
      mode: input.args.mode,
      userId: input.args.userId,
      limit: input.args.limit,
      batchSize: input.args.batchSize,
      confirmBulkMigrate: input.args.confirmBulkMigrate,
    },
    categoryCounts: input.categoryCounts,
    outcomeCounts: tallyOutcomes(input.rows),
    totalConsidered: input.rows.length,
    rows: input.rows,
    rollbackManifest: input.rollback,
    notes: input.notes ?? [],
  };
}

/** Classification-only report (no secrets). */
export function buildClassificationReport(input: {
  categoryCounts: CategoryCounts;
  classified: ClassifiedUser[];
  authUsersTotal: number;
  businessUsersTotal: number;
  notes?: string[];
}): {
  stage: "4F-auth";
  mode: "classify-readonly";
  at: string;
  architecture: string;
  totals: {
    businessUsers: number;
    authUsers: number;
    linked: number;
  };
  categoryCounts: CategoryCounts;
  samplesByCategory: Partial<
    Record<string, Array<{ userId: string; emailMasked: string; outcome: string }>>
  >;
  notes: string[];
} {
  const linked = input.classified.filter(
    (row) => row.category === "G_ALREADY_LINKED"
  ).length;

  const samplesByCategory: Partial<
    Record<string, Array<{ userId: string; emailMasked: string; outcome: string }>>
  > = {};

  for (const row of input.classified) {
    const bucket = samplesByCategory[row.category] ?? [];
    if (bucket.length < 3) {
      bucket.push({
        userId: row.userId,
        emailMasked: row.emailMasked,
        outcome: row.outcome,
      });
      samplesByCategory[row.category] = bucket;
    }
  }

  return {
    stage: "4F-auth",
    mode: "classify-readonly",
    at: new Date().toISOString(),
    architecture: "auth.users.id → User.supabaseAuthUserId → User.id",
    totals: {
      businessUsers: input.businessUsersTotal,
      authUsers: input.authUsersTotal,
      linked,
    },
    categoryCounts: input.categoryCounts,
    samplesByCategory,
    notes: input.notes ?? [
      "Read-only classification. No Auth users created. No User.supabaseAuthUserId writes.",
      "Password hashes are never included in this report.",
    ],
  };
}

/** Strip any accidental secret-looking fields before serialization. */
export function assertSafeReportPayload(payload: unknown): void {
  const json = JSON.stringify(payload);
  if (/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/.test(json)) {
    throw new Error("Refusing to write report: bcrypt hash detected in payload");
  }
  if (/"passwordHash"\s*:/.test(json)) {
    throw new Error("Refusing to write report: passwordHash field detected");
  }
  if (/service_role|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./i.test(json)) {
    throw new Error("Refusing to write report: credential-like token detected");
  }
}
