/**
 * Production-safe business import into Supabase PostgreSQL.
 *
 * NEVER truncates / drops / resets a non-empty destination.
 * Requires explicit --confirm-production-project-ref.
 * Staging project ref is refused.
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
import { withPoolParams } from "@/lib/migration/production/env";
import {
  assertProductionWriteTarget,
  assertSupabaseDestination,
} from "@/lib/migration/production/target-guard";
import {
  buildInsertSql,
  normalizeRowForJsonl,
  quoteIdent,
} from "@/lib/migration/production/sql-serialize";
import type { BusinessExportManifest } from "@/lib/migration/production/copy/types";

export type ImportResult = {
  ok: boolean;
  WRITES_ENABLED: boolean;
  tables_imported: Array<{ table: string; row_count: number }>;
  reasons: string[];
};

function readManifest(exportDir: string): BusinessExportManifest {
  const p = path.join(exportDir, "manifest.json");
  if (!fs.existsSync(p)) {
    throw new Error(`Missing manifest.json in ${exportDir}`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8")) as BusinessExportManifest;
}

function readJsonl(
  filePath: string
): Array<Record<string, unknown>> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing JSONL: ${filePath}`);
  }
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.trim()) return [];
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => normalizeRowForJsonl(JSON.parse(line) as Record<string, unknown>));
}

async function tableCount(
  prisma: PrismaClient,
  table: BusinessTable
): Promise<number> {
  const row = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    `SELECT COUNT(*)::bigint AS c FROM public.${quoteIdent(table)}`
  );
  const v = row[0]?.c ?? 0;
  return typeof v === "bigint" ? Number(v) : Number(v);
}

async function getColumns(
  prisma: PrismaClient,
  table: string
): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}'
     ORDER BY ordinal_position`
  );
  return rows.map((r) => r.column_name);
}

/**
 * Preflight destination emptiness for all business tables.
 * Non-empty → STOP (human review required). Never auto-truncate.
 */
export async function assertDestinationEmptyForImport(
  prisma: PrismaClient
): Promise<{ empty: boolean; nonEmpty: Array<{ table: string; count: number }> }> {
  const nonEmpty: Array<{ table: string; count: number }> = [];
  for (const table of BUSINESS_TABLES) {
    const count = await tableCount(prisma, table);
    if (count > 0) nonEmpty.push({ table, count });
  }
  return { empty: nonEmpty.length === 0, nonEmpty };
}

export async function importBusinessTables(input: {
  exportDir: string;
  destinationDatabaseUrl: string;
  confirmProductionProjectRef: string;
  nextPublicSupabaseUrl?: string | null;
  batchSize?: number;
  /** Must be true for writes. Dry path should use copyDryRun instead. */
  execute: boolean;
}): Promise<ImportResult> {
  if (!input.execute) {
    return {
      ok: false,
      WRITES_ENABLED: false,
      tables_imported: [],
      reasons: [
        "Import execute=false; refusing writes. Use copy dry-run / --execute explicitly.",
      ],
    };
  }

  assertProductionWriteTarget({
    confirmProductionProjectRef: input.confirmProductionProjectRef,
    databaseUrl: input.destinationDatabaseUrl,
    nextPublicSupabaseUrl: input.nextPublicSupabaseUrl,
    requireWriteConfirmation: true,
  });

  assertSupabaseDestination(input.destinationDatabaseUrl, {
    confirmRef: input.confirmProductionProjectRef,
  });

  const manifest = readManifest(input.exportDir);
  const batchSize = input.batchSize ?? 100;
  const url = withPoolParams(
    input.destinationDatabaseUrl,
    OPERATOR_POOL_DEFAULTS
  );
  const prisma = new PrismaClient({
    datasources: { db: { url } },
    log: [],
  });

  const imported: Array<{ table: string; row_count: number }> = [];

  try {
    const emptiness = await assertDestinationEmptyForImport(prisma);
    if (!emptiness.empty) {
      return {
        ok: false,
        WRITES_ENABLED: false,
        tables_imported: [],
        reasons: [
          "DESTINATION_NON_EMPTY_STOP: destination contains unexpected business rows; refusing import (no truncate).",
          ...emptiness.nonEmpty.map((t) => `${t.table}=${t.count}`),
        ],
      };
    }

    // All-or-nothing transaction across tables.
    await prisma.$transaction(
      async (tx) => {
        for (const table of IMPORT_TABLE_ORDER) {
          const stats = manifest.tables[table];
          if (!stats) {
            throw new Error(`Manifest missing table ${table}`);
          }
          const jsonlPath = path.join(input.exportDir, stats.jsonl);
          const rows = readJsonl(jsonlPath);
          if (rows.length !== stats.row_count) {
            throw new Error(
              `${table}: JSONL row count ${rows.length} != manifest ${stats.row_count}`
            );
          }

          const destCols = await getColumns(tx as unknown as PrismaClient, table);
          for (const col of stats.columns) {
            if (!destCols.includes(col)) {
              throw new Error(
                `${table}: destination missing column ${col}; refusing import`
              );
            }
          }

          // Insert in deterministic batches; no silent skips.
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const sql = buildInsertSql(table, stats.columns, batch).replace(
              /;\s*$/,
              ""
            );
            if (batch.length === 0) continue;
            await tx.$executeRawUnsafe(sql);
          }

          const count = await tableCount(tx as unknown as PrismaClient, table);
          if (count !== rows.length) {
            throw new Error(
              `${table}: post-insert count ${count} != expected ${rows.length}`
            );
          }
          imported.push({ table, row_count: count });
        }
      },
      {
        // Long-running import; Session-mode compatible.
        maxWait: 60_000,
        timeout: 3_600_000,
      }
    );

    return {
      ok: true,
      WRITES_ENABLED: true,
      tables_imported: imported,
      reasons: [],
    };
  } catch (error) {
    return {
      ok: false,
      WRITES_ENABLED: true,
      tables_imported: imported,
      reasons: [
        error instanceof Error ? error.message : "Unknown import failure",
      ],
    };
  } finally {
    await prisma.$disconnect();
  }
}
