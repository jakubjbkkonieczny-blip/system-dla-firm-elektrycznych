/**
 * Copy dry-run / preflight — no writes.
 */

import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  BUSINESS_TABLES,
  IMPORT_TABLE_ORDER,
  OPERATOR_POOL_DEFAULTS,
  type BusinessTable,
} from "@/lib/migration/production/constants";
import { defaultArtifactRoot } from "@/lib/migration/production/artifacts";
import { withPoolParams } from "@/lib/migration/production/env";
import { inspectDbUrl } from "@/lib/migration/production/identity";
import {
  assertNeonSource,
  assessProductionTarget,
} from "@/lib/migration/production/target-guard";
import { quoteIdent } from "@/lib/migration/production/sql-serialize";
import type { CopyDryRunReport } from "@/lib/migration/production/copy/types";

type QueryClient = {
  $queryRawUnsafe: <T = unknown>(
    query: string,
    ...values: unknown[]
  ) => Promise<T>;
  $disconnect: () => Promise<void>;
};

async function tableExists(prisma: QueryClient, table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}'
    ) AS exists`
  );
  return Boolean(rows[0]?.exists);
}

async function tableCount(prisma: QueryClient, table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    `SELECT COUNT(*)::bigint AS c FROM public.${quoteIdent(table)}`
  );
  const v = rows[0]?.c ?? 0;
  return typeof v === "bigint" ? Number(v) : Number(v);
}

async function getColumns(prisma: QueryClient, table: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}'
     ORDER BY ordinal_position`
  );
  return rows.map((r) => r.column_name);
}

function diskFreeBytes(dirPath: string): number | null {
  try {
    // Node 18+ has fs.statfsSync on some platforms; fall back gracefully.
    const statfs = (
      fs as unknown as {
        statfsSync?: (p: string) => { bavail: number | bigint; bsize: number | bigint };
      }
    ).statfsSync;
    if (!statfs) return null;
    const s = statfs(dirPath);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

export async function copyDryRun(input: {
  sourceDatabaseUrl: string;
  destinationDatabaseUrl?: string | null;
  confirmProductionProjectRef?: string | null;
  nextPublicSupabaseUrl?: string | null;
  manifestDestination?: string | null;
  repoRoot?: string;
}): Promise<CopyDryRunReport> {
  const reasons: string[] = [];
  let sourceIdentity;
  try {
    sourceIdentity = assertNeonSource(input.sourceDatabaseUrl);
  } catch (error) {
    return {
      at: new Date().toISOString(),
      WRITES_ENABLED: false,
      ok: false,
      source: inspectDbUrl(input.sourceDatabaseUrl),
      destination: null,
      destination_status: "MISSING",
      table_coverage: {
        expected: BUSINESS_TABLES.length,
        source_present: [],
        source_missing: [...BUSINESS_TABLES],
        dest_present: [],
        dest_missing: [...BUSINESS_TABLES],
      },
      source_counts: {},
      destination_counts: {},
      column_compatibility: [],
      dependency_plan: [...IMPORT_TABLE_ORDER],
      manifest_destination: input.manifestDestination ?? null,
      disk: { checked: false, free_bytes: null, warning: null },
      reasons: [
        error instanceof Error ? error.message : "Source identity failed",
      ],
      verdict: "COPY_DRY_RUN_BLOCKED",
    };
  }

  const sourceUrl = withPoolParams(
    input.sourceDatabaseUrl,
    OPERATOR_POOL_DEFAULTS
  );
  const sourcePrisma = new PrismaClient({
    datasources: { db: { url: sourceUrl } },
    log: [],
  });

  const source_present: string[] = [];
  const source_missing: string[] = [];
  const source_counts: Record<string, number> = {};
  const column_compatibility: CopyDryRunReport["column_compatibility"] = [];

  let destination = input.destinationDatabaseUrl
    ? inspectDbUrl(input.destinationDatabaseUrl)
    : null;
  let destination_status: CopyDryRunReport["destination_status"] = "MISSING";
  const dest_present: string[] = [];
  const dest_missing: string[] = [];
  const destination_counts: Record<string, number> = {};
  let destPrisma: PrismaClient | null = null;

  try {
    for (const table of BUSINESS_TABLES) {
      const exists = await tableExists(sourcePrisma, table);
      if (!exists) {
        source_missing.push(table);
        reasons.push(`Source missing table ${table}`);
        continue;
      }
      source_present.push(table);
      source_counts[table] = await tableCount(sourcePrisma, table);
    }

    if (input.destinationDatabaseUrl) {
      const assessment = assessProductionTarget({
        confirmProductionProjectRef: input.confirmProductionProjectRef,
        databaseUrl: input.destinationDatabaseUrl,
        nextPublicSupabaseUrl: input.nextPublicSupabaseUrl,
        requireWriteConfirmation: false,
        allowUnconfirmedRead: true,
      });

      destination = assessment.database;

      if (assessment.status === "PRODUCTION_TARGET_REFUSED") {
        destination_status = "REFUSED";
        reasons.push(...assessment.reasons);
      } else if (
        assessment.status === "PRODUCTION_TARGET_IDENTITY_UNCONFIRMED" ||
        !input.confirmProductionProjectRef
      ) {
        destination_status = "UNCONFIRMED";
        reasons.push("PRODUCTION_TARGET_IDENTITY_UNCONFIRMED");
      }

      if (
        destination_status !== "REFUSED" &&
        destination.isSupabase &&
        !destination.isStagingRef
      ) {
        const destUrl = withPoolParams(
          input.destinationDatabaseUrl,
          OPERATOR_POOL_DEFAULTS
        );
        destPrisma = new PrismaClient({
          datasources: { db: { url: destUrl } },
          log: [],
        });

        let anyRows = false;
        for (const table of BUSINESS_TABLES as readonly BusinessTable[]) {
          const exists = await tableExists(destPrisma, table);
          if (!exists) {
            dest_missing.push(table);
            reasons.push(`Destination missing table ${table}`);
            continue;
          }
          dest_present.push(table);
          const count = await tableCount(destPrisma, table);
          destination_counts[table] = count;
          if (count > 0) anyRows = true;

          const sourceCols = await getColumns(sourcePrisma, table);
          const destCols = await getColumns(destPrisma, table);
          const missingOnDest = sourceCols.filter((c) => !destCols.includes(c));
          const ok = missingOnDest.length === 0;
          column_compatibility.push({
            table,
            ok,
            detail: ok
              ? `columns_match_source=${sourceCols.length}`
              : `missing_on_dest=${missingOnDest.join(",")}`,
          });
          if (!ok) {
            reasons.push(
              `Column incompatibility on ${table}: missing ${missingOnDest.join(",")}`
            );
          }
        }

        // Inside this block status is MISSING (initial) or UNCONFIRMED — never REFUSED.
        if (destination_status !== "UNCONFIRMED") {
          destination_status = anyRows ? "NON_EMPTY_STOP" : "EMPTY_OK";
          if (anyRows) {
            reasons.push(
              "DESTINATION_NON_EMPTY_STOP: import would refuse without human review (no auto-truncate)"
            );
          }
        }
      }
    } else {
      reasons.push("Destination DATABASE_URL not provided");
    }

    const manifestDestination =
      input.manifestDestination ??
      defaultArtifactRoot(input.repoRoot);

    let diskWarning: string | null = null;
    const free = diskFreeBytes(path.dirname(manifestDestination));
    if (free != null && free < 500 * 1024 * 1024) {
      diskWarning = "Less than ~500MB free near manifest destination";
      reasons.push(diskWarning);
    }

    const ok =
      reasons.length === 0 &&
      source_missing.length === 0 &&
      destination_status === "EMPTY_OK" &&
      Boolean(input.confirmProductionProjectRef);

    if (!input.confirmProductionProjectRef) {
      // already recorded as UNCONFIRMED; dry-run can still be informational
    }

    return {
      at: new Date().toISOString(),
      WRITES_ENABLED: false,
      ok,
      source: sourceIdentity,
      destination,
      destination_status,
      table_coverage: {
        expected: BUSINESS_TABLES.length,
        source_present,
        source_missing,
        dest_present,
        dest_missing,
      },
      source_counts,
      destination_counts,
      column_compatibility,
      dependency_plan: [...IMPORT_TABLE_ORDER],
      manifest_destination: manifestDestination,
      disk: {
        checked: free != null,
        free_bytes: free,
        warning: diskWarning,
      },
      reasons,
      verdict: ok ? "COPY_DRY_RUN_SAFE" : "COPY_DRY_RUN_BLOCKED",
    };
  } finally {
    await sourcePrisma.$disconnect();
    if (destPrisma) await destPrisma.$disconnect();
  }
}
