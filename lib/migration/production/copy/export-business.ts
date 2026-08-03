/**
 * Production-safe logical export of all 21 VectorWork business tables from Neon.
 * SELECT-only. Never mutates the source.
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
import { assertNeonSource } from "@/lib/migration/production/target-guard";
import {
  buildInsertSql,
  idSetSha256,
  normalizeRowForJsonl,
  orderedRowFingerprintSha256,
  quoteIdent,
} from "@/lib/migration/production/sql-serialize";
import type {
  BusinessExportManifest,
  TableExportStats,
} from "@/lib/migration/production/copy/types";

async function getColumns(
  prisma: PrismaClient,
  table: string
): Promise<string[]> {
  // Table name is restricted to known BUSINESS_TABLES before call.
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}'
     ORDER BY ordinal_position`
  );
  return rows.map((r) => r.column_name);
}

function assertKnownTable(table: string): asserts table is BusinessTable {
  if (!(BUSINESS_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Unknown business table: ${table}`);
  }
}

export async function exportBusinessTables(input: {
  sourceDatabaseUrl: string;
  outputDir: string;
}): Promise<BusinessExportManifest> {
  const sourceIdentity = assertNeonSource(input.sourceDatabaseUrl);
  const url = withPoolParams(input.sourceDatabaseUrl, OPERATOR_POOL_DEFAULTS);
  const prisma = new PrismaClient({
    datasources: { db: { url } },
    log: [],
  });

  fs.mkdirSync(input.outputDir, { recursive: true });

  const tables: Record<string, TableExportStats> = {};
  const notes: string[] = [
    "SELECT-only export. Source Neon was not mutated.",
    "passwordHash / tokens / Stripe IDs preserved exactly as present.",
    "Do not commit this export if it contains production data.",
  ];

  try {
    for (const table of IMPORT_TABLE_ORDER) {
      assertKnownTable(table);
      const columns = await getColumns(prisma, table);
      if (!columns.length) {
        throw new Error(`Table ${table} missing or has no columns on source`);
      }

      const orderClause = columns.includes("id")
        ? `${quoteIdent("id")} ASC`
        : columns.map(quoteIdent).join(", ");

      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM public.${quoteIdent(table)} ORDER BY ${orderClause}`
      );

      const normalized = rows.map((r) => normalizeRowForJsonl(r));
      const ids = normalized
        .map((r) => (r.id == null ? null : String(r.id)))
        .filter((id): id is string => id != null);

      const jsonlName = `${table}.jsonl`;
      const sqlName = `${table}.sql`;
      const jsonlPath = path.join(input.outputDir, jsonlName);
      const sqlPath = path.join(input.outputDir, sqlName);

      const jsonlBody = normalized.map((r) => JSON.stringify(r)).join("\n");
      fs.writeFileSync(
        jsonlPath,
        jsonlBody + (normalized.length ? "\n" : ""),
        "utf8"
      );
      fs.writeFileSync(
        sqlPath,
        buildInsertSql(table, columns, normalized),
        "utf8"
      );

      tables[table] = {
        table,
        row_count: normalized.length,
        columns,
        id_set_sha256: idSetSha256(ids),
        ordered_row_sha256: orderedRowFingerprintSha256(normalized, columns),
        jsonl: jsonlName,
        sql: sqlName,
      };
    }

    // Coverage check
    for (const t of BUSINESS_TABLES) {
      if (!tables[t]) {
        throw new Error(`Export missing required table ${t}`);
      }
    }

    const manifest: BusinessExportManifest = {
      created_at: new Date().toISOString(),
      method:
        "logical JSONL dump via Prisma $queryRawUnsafe (public business tables only)",
      scope: "All 21 VectorWork business tables from Neon public schema",
      writes_enabled: false,
      source: sourceIdentity,
      location: path.resolve(input.outputDir),
      tables,
      notes,
    };

    fs.writeFileSync(
      path.join(input.outputDir, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8"
    );

    return manifest;
  } finally {
    await prisma.$disconnect();
  }
}
