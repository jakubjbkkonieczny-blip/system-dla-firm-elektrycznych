/**
 * Production-safe read-only Neon ↔ Supabase deterministic validator.
 * Requires explicit source/target configuration.
 * Refuses staging targets, same-DB comparisons, and Supabase→Supabase staging mistakes.
 */

import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import {
  BUSINESS_TABLES,
  IDENTITY_SPECS,
  OPERATOR_POOL_DEFAULTS,
  STAGING_PROJECT_REF,
} from "@/lib/migration/production/constants";
import { withPoolParams } from "@/lib/migration/production/env";
import {
  identityFingerprint,
  inspectDbUrl,
  type MaskedDbIdentity,
} from "@/lib/migration/production/identity";
import { quoteIdent } from "@/lib/migration/production/sql-serialize";
import {
  assertNeonSource,
  assessProductionTarget,
} from "@/lib/migration/production/target-guard";

export type ValidationMismatch = {
  area: string;
  table?: string;
  detail: string;
};

export type ProductionValidationReport = {
  at: string;
  WRITES_ENABLED: false;
  ok: boolean;
  verdict: "VALIDATION_PASSED" | "VALIDATION_FAILED" | "VALIDATION_BLOCKED";
  source: MaskedDbIdentity;
  destination: MaskedDbIdentity;
  mismatches: ValidationMismatch[];
  table_summaries: Array<{
    table: string;
    source_count: number;
    dest_count: number;
    id_set_sha256_match: boolean | null;
    ordered_row_sha256_match: boolean | null;
  }>;
  reasons: string[];
};

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  return Number(v);
}

async function qOne(
  prisma: PrismaClient,
  sql: string
): Promise<Record<string, unknown> | null> {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql);
  return rows[0] ?? null;
}

async function getColumns(
  prisma: PrismaClient,
  table: string
): Promise<
  Array<{ column_name: string; data_type: string; udt_name: string; is_nullable: string }>
> {
  return prisma.$queryRawUnsafe(
    `SELECT column_name, data_type, udt_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}'
     ORDER BY ordinal_position`
  );
}

async function checksumTable(
  prisma: PrismaClient,
  table: string,
  columns: string[]
): Promise<{
  row_count: number;
  id_set_sha256: string;
  ordered_row_sha256: string;
}> {
  const hasId = columns.includes("id");
  const orderCol = hasId
    ? quoteIdent("id")
    : columns.map(quoteIdent).join(", ");
  const rowExpr = columns
    .map((c) => `COALESCE(${quoteIdent(c)}::text, '<NULL>')`)
    .join(` || '|' || `);

  const row = await qOne(
    prisma,
    `SELECT
       COUNT(*)::bigint AS row_count,
       COALESCE(string_agg(md5(${rowExpr}), '' ORDER BY ${orderCol}), '') AS ordered_row_md5_concat,
       COALESCE(
         string_agg(
           CASE WHEN ${hasId ? quoteIdent("id") : "NULL"} IS NOT NULL
             THEN ${hasId ? `${quoteIdent("id")}::text` : "''"}
             ELSE '' END,
           '' ORDER BY ${hasId ? quoteIdent("id") : orderCol}
         ),
         ''
       ) AS ordered_id_concat
     FROM public.${quoteIdent(table)}`
  );

  const concat = String(row?.ordered_row_md5_concat ?? "");
  const idConcat = String(row?.ordered_id_concat ?? "");
  return {
    row_count: num(row?.row_count),
    id_set_sha256: sha256Hex(idConcat),
    ordered_row_sha256: sha256Hex(concat),
  };
}

async function nullDistribution(
  prisma: PrismaClient,
  table: string,
  columns: string[]
): Promise<Record<string, number>> {
  if (!columns.length) return {};
  const parts = columns.map(
    (c) =>
      `COUNT(*) FILTER (WHERE ${quoteIdent(c)} IS NULL)::bigint AS ${quoteIdent("null__" + c)}`
  );
  const row = await qOne(
    prisma,
    `SELECT ${parts.join(", ")} FROM public.${quoteIdent(table)}`
  );
  const out: Record<string, number> = {};
  for (const c of columns) {
    out[c] = num(row?.["null__" + c]);
  }
  return out;
}

async function pkStats(prisma: PrismaClient, table: string) {
  const row = await qOne(
    prisma,
    `SELECT
       COUNT(*)::bigint AS row_count,
       COUNT(${quoteIdent("id")})::bigint AS pk_nonnull_count,
       COUNT(DISTINCT ${quoteIdent("id")})::bigint AS pk_distinct_count
     FROM public.${quoteIdent(table)}`
  );
  return {
    row_count: num(row?.row_count),
    pk_nonnull_count: num(row?.pk_nonnull_count),
    pk_distinct_count: num(row?.pk_distinct_count),
    pk_duplicate_count:
      num(row?.pk_nonnull_count) - num(row?.pk_distinct_count),
  };
}

export async function validateNeonAgainstSupabase(input: {
  sourceDatabaseUrl: string;
  destinationDatabaseUrl: string;
  confirmProductionProjectRef?: string | null;
  nextPublicSupabaseUrl?: string | null;
}): Promise<ProductionValidationReport> {
  const mismatches: ValidationMismatch[] = [];
  const reasons: string[] = [];
  const table_summaries: ProductionValidationReport["table_summaries"] = [];

  let source: MaskedDbIdentity;
  try {
    source = assertNeonSource(input.sourceDatabaseUrl);
  } catch (error) {
    return {
      at: new Date().toISOString(),
      WRITES_ENABLED: false,
      ok: false,
      verdict: "VALIDATION_BLOCKED",
      source: inspectDbUrl(input.sourceDatabaseUrl),
      destination: inspectDbUrl(input.destinationDatabaseUrl),
      mismatches: [],
      table_summaries: [],
      reasons: [
        error instanceof Error ? error.message : "Invalid Neon source",
      ],
    };
  }

  const destAssessment = assessProductionTarget({
    confirmProductionProjectRef: input.confirmProductionProjectRef,
    databaseUrl: input.destinationDatabaseUrl,
    nextPublicSupabaseUrl: input.nextPublicSupabaseUrl,
    requireWriteConfirmation: false,
    allowUnconfirmedRead: true,
  });

  const destination = destAssessment.database;

  if (destination.isStagingRef || destination.projectRef === STAGING_PROJECT_REF) {
    reasons.push(`Staging destination ${STAGING_PROJECT_REF} refused`);
  }
  if (destination.isNeon) {
    reasons.push("Destination is Neon; expected production Supabase");
  }
  if (!destination.isSupabase) {
    reasons.push("Destination is not Supabase");
  }
  if (
    identityFingerprint(source) &&
    identityFingerprint(source) === identityFingerprint(destination)
  ) {
    reasons.push("Source and destination appear to be the same database");
  }
  if (!input.confirmProductionProjectRef) {
    reasons.push("PRODUCTION_TARGET_IDENTITY_UNCONFIRMED");
  }
  if (destAssessment.status === "PRODUCTION_TARGET_REFUSED") {
    reasons.push(...destAssessment.reasons);
  }

  if (reasons.length) {
    return {
      at: new Date().toISOString(),
      WRITES_ENABLED: false,
      ok: false,
      verdict: "VALIDATION_BLOCKED",
      source,
      destination,
      mismatches: [],
      table_summaries: [],
      reasons,
    };
  }

  const sourcePrisma = new PrismaClient({
    datasources: {
      db: {
        url: withPoolParams(input.sourceDatabaseUrl, OPERATOR_POOL_DEFAULTS),
      },
    },
    log: [],
  });
  const destPrisma = new PrismaClient({
    datasources: {
      db: {
        url: withPoolParams(
          input.destinationDatabaseUrl,
          OPERATOR_POOL_DEFAULTS
        ),
      },
    },
    log: [],
  });

  try {
    for (const table of BUSINESS_TABLES) {
      const sourceCols = await getColumns(sourcePrisma, table);
      const destCols = await getColumns(destPrisma, table);
      if (!sourceCols.length || !destCols.length) {
        mismatches.push({
          area: "table_presence",
          table,
          detail: `source_cols=${sourceCols.length} dest_cols=${destCols.length}`,
        });
        continue;
      }

      const sourceNames = sourceCols.map((c) => c.column_name);
      const destNames = destCols.map((c) => c.column_name);
      for (const c of sourceNames) {
        if (!destNames.includes(c)) {
          mismatches.push({
            area: "column_missing",
            table,
            detail: `dest missing ${c}`,
          });
        }
      }

      // Column type checks for intersection
      for (const sc of sourceCols) {
        const dc = destCols.find((d) => d.column_name === sc.column_name);
        if (!dc) continue;
        if (sc.data_type !== dc.data_type || sc.udt_name !== dc.udt_name) {
          mismatches.push({
            area: "column_type",
            table,
            detail: `${sc.column_name}: source=${sc.data_type}/${sc.udt_name} dest=${dc.data_type}/${dc.udt_name}`,
          });
        }
        if (sc.is_nullable !== dc.is_nullable) {
          mismatches.push({
            area: "column_nullability",
            table,
            detail: `${sc.column_name}: source=${sc.is_nullable} dest=${dc.is_nullable}`,
          });
        }
      }

      const common = sourceNames.filter((c) => destNames.includes(c));
      const sCheck = await checksumTable(sourcePrisma, table, common);
      const dCheck = await checksumTable(destPrisma, table, common);

      if (sCheck.row_count !== dCheck.row_count) {
        mismatches.push({
          area: "row_count",
          table,
          detail: `source=${sCheck.row_count} dest=${dCheck.row_count}`,
        });
      }

      const idMatch = sCheck.id_set_sha256 === dCheck.id_set_sha256;
      const rowMatch = sCheck.ordered_row_sha256 === dCheck.ordered_row_sha256;
      if (!idMatch) {
        mismatches.push({
          area: "id_set_sha256",
          table,
          detail: `source=${sCheck.id_set_sha256} dest=${dCheck.id_set_sha256}`,
        });
      }
      if (!rowMatch) {
        mismatches.push({
          area: "ordered_row_sha256",
          table,
          detail: `source=${sCheck.ordered_row_sha256} dest=${dCheck.ordered_row_sha256}`,
        });
      }

      if (common.includes("id")) {
        const sPk = await pkStats(sourcePrisma, table);
        const dPk = await pkStats(destPrisma, table);
        if (sPk.pk_duplicate_count > 0 || dPk.pk_duplicate_count > 0) {
          mismatches.push({
            area: "pk_uniqueness",
            table,
            detail: `source_dups=${sPk.pk_duplicate_count} dest_dups=${dPk.pk_duplicate_count}`,
          });
        }
      }

      const sNull = await nullDistribution(sourcePrisma, table, common);
      const dNull = await nullDistribution(destPrisma, table, common);
      for (const col of common) {
        if (sNull[col] !== dNull[col]) {
          mismatches.push({
            area: "null_distribution",
            table,
            detail: `${col}: source=${sNull[col]} dest=${dNull[col]}`,
          });
        }
      }

      const identityCols = IDENTITY_SPECS[table];
      if (identityCols) {
        const useCols = identityCols.filter((c) => common.includes(c));
        if (useCols.length) {
          const sId = await checksumTable(sourcePrisma, table, [...useCols]);
          const dId = await checksumTable(destPrisma, table, [...useCols]);
          if (sId.ordered_row_sha256 !== dId.ordered_row_sha256) {
            mismatches.push({
              area: "identity_fingerprint",
              table,
              detail: `identity columns mismatch (${useCols.join(",")})`,
            });
          }
        }
      }

      table_summaries.push({
        table,
        source_count: sCheck.row_count,
        dest_count: dCheck.row_count,
        id_set_sha256_match: idMatch,
        ordered_row_sha256_match: rowMatch,
      });
    }

    // Ownership / FK integrity samples (destination + source orphan counts must match 0 ideally)
    const ownershipChecks: Array<{ name: string; sql: string }> = [
      {
        name: "CompanyMember→User",
        sql: `SELECT COUNT(*)::bigint AS c FROM "CompanyMember" cm
              WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = cm."userId")`,
      },
      {
        name: "CompanyMember→Company",
        sql: `SELECT COUNT(*)::bigint AS c FROM "CompanyMember" cm
              WHERE NOT EXISTS (SELECT 1 FROM "Company" co WHERE co.id = cm."companyId")`,
      },
      {
        name: "Job→Company",
        sql: `SELECT COUNT(*)::bigint AS c FROM "Job" j
              WHERE NOT EXISTS (SELECT 1 FROM "Company" co WHERE co.id = j."companyId")`,
      },
      {
        name: "Job→creator",
        sql: `SELECT COUNT(*)::bigint AS c FROM "Job" j
              WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = j."createdByUserId")`,
      },
      {
        name: "Attendance→User",
        sql: `SELECT COUNT(*)::bigint AS c FROM "AttendanceSession" a
              WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."userId")`,
      },
      {
        name: "Vacation→User",
        sql: `SELECT COUNT(*)::bigint AS c FROM "VacationRequest" v
              WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = v."userId")`,
      },
      {
        name: "Notification→User",
        sql: `SELECT COUNT(*)::bigint AS c FROM "Notification" n
              WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = n."userId")`,
      },
      {
        name: "PushSubscription→User",
        sql: `SELECT COUNT(*)::bigint AS c FROM "PushSubscription" p
              WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = p."userId")`,
      },
      {
        name: "VerificationToken→User",
        sql: `SELECT COUNT(*)::bigint AS c FROM "VerificationToken" t
              WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = t."userId")`,
      },
      {
        name: "JobBudget→Job",
        sql: `SELECT COUNT(*)::bigint AS c FROM "JobBudget" b
              WHERE NOT EXISTS (SELECT 1 FROM "Job" j WHERE j.id = b."jobId")`,
      },
    ];

    for (const check of ownershipChecks) {
      const s = num((await qOne(sourcePrisma, check.sql))?.c);
      const d = num((await qOne(destPrisma, check.sql))?.c);
      if (s !== d) {
        mismatches.push({
          area: "fk_orphan_count_mismatch",
          detail: `${check.name}: source=${s} dest=${d}`,
        });
      }
      if (d > 0) {
        mismatches.push({
          area: "fk_orphan_on_destination",
          detail: `${check.name}: dest_orphans=${d}`,
        });
      }
    }

    const ok = mismatches.length === 0;
    return {
      at: new Date().toISOString(),
      WRITES_ENABLED: false,
      ok,
      verdict: ok ? "VALIDATION_PASSED" : "VALIDATION_FAILED",
      source,
      destination,
      mismatches,
      table_summaries,
      reasons: ok ? [] : [`${mismatches.length} mismatch(es)`],
    };
  } finally {
    await sourcePrisma.$disconnect();
    await destPrisma.$disconnect();
  }
}
