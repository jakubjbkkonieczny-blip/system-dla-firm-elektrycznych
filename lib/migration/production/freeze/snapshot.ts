/**
 * Read-only freeze verifier.
 * Takes snapshots of write-sensitive tables and compares across an operator interval.
 * Never creates probe rows.
 */

import { PrismaClient } from "@prisma/client";

import {
  FREEZE_OBSERVATION_TABLES,
  OPERATOR_POOL_DEFAULTS,
} from "@/lib/migration/production/constants";
import { withPoolParams } from "@/lib/migration/production/env";
import { inspectDbUrl, type MaskedDbIdentity } from "@/lib/migration/production/identity";
import { quoteIdent, sha256Hex } from "@/lib/migration/production/sql-serialize";

export type FreezeTableSnapshot = {
  table: string;
  row_count: number;
  max_created_at: string | null;
  max_updated_at: string | null;
  fingerprint: string;
};

export type FreezeSnapshot = {
  at: string;
  source: MaskedDbIdentity;
  tables: FreezeTableSnapshot[];
};

export type FreezeCompareResult = {
  WRITES_ENABLED: false;
  interval_ms: number;
  ok: boolean;
  verdict: "FREEZE_CONFIRMED" | "FREEZE_NOT_CONFIRMED";
  changed_tables: Array<{
    table: string;
    before: FreezeTableSnapshot;
    after: FreezeTableSnapshot;
  }>;
  snapshot_a: FreezeSnapshot;
  snapshot_b: FreezeSnapshot;
};

async function columnsFor(
  prisma: PrismaClient,
  table: string
): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}'`
  );
  return new Set(rows.map((r) => r.column_name));
}

export async function takeFreezeSnapshot(
  databaseUrl: string
): Promise<FreezeSnapshot> {
  const identity = inspectDbUrl(databaseUrl);
  const url = withPoolParams(databaseUrl, OPERATOR_POOL_DEFAULTS);
  const prisma = new PrismaClient({
    datasources: { db: { url } },
    log: [],
  });

  try {
    const tables: FreezeTableSnapshot[] = [];
    for (const table of FREEZE_OBSERVATION_TABLES) {
      const cols = await columnsFor(prisma, table);
      const hasCreated = cols.has("createdAt");
      const hasUpdated = cols.has("updatedAt");
      const hasId = cols.has("id");

      const selectParts = [
        `COUNT(*)::bigint AS row_count`,
        hasCreated
          ? `MAX(${quoteIdent("createdAt")})::text AS max_created_at`
          : `NULL::text AS max_created_at`,
        hasUpdated
          ? `MAX(${quoteIdent("updatedAt")})::text AS max_updated_at`
          : `NULL::text AS max_updated_at`,
        hasId
          ? `COALESCE(string_agg(${quoteIdent("id")}::text, '' ORDER BY ${quoteIdent("id")}), '') AS id_concat`
          : `'' AS id_concat`,
      ];

      const rows = await prisma.$queryRawUnsafe<
        Array<{
          row_count: bigint | number;
          max_created_at: string | null;
          max_updated_at: string | null;
          id_concat: string;
        }>
      >(
        `SELECT ${selectParts.join(", ")} FROM public.${quoteIdent(table)}`
      );
      const row = rows[0];
      const row_count =
        typeof row?.row_count === "bigint"
          ? Number(row.row_count)
          : Number(row?.row_count ?? 0);

      tables.push({
        table,
        row_count,
        max_created_at: row?.max_created_at ?? null,
        max_updated_at: row?.max_updated_at ?? null,
        fingerprint: sha256Hex(
          [
            String(row_count),
            row?.max_created_at ?? "",
            row?.max_updated_at ?? "",
            row?.id_concat ?? "",
          ].join("|")
        ),
      });
    }

    return {
      at: new Date().toISOString(),
      source: identity,
      tables,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export function compareFreezeSnapshots(
  a: FreezeSnapshot,
  b: FreezeSnapshot,
  intervalMs: number
): FreezeCompareResult {
  const changed_tables: FreezeCompareResult["changed_tables"] = [];
  for (const before of a.tables) {
    const after = b.tables.find((t) => t.table === before.table);
    if (!after) continue;
    if (before.fingerprint !== after.fingerprint) {
      changed_tables.push({ table: before.table, before, after });
    }
  }

  const ok = changed_tables.length === 0;
  return {
    WRITES_ENABLED: false,
    interval_ms: intervalMs,
    ok,
    verdict: ok ? "FREEZE_CONFIRMED" : "FREEZE_NOT_CONFIRMED",
    changed_tables,
    snapshot_a: a,
    snapshot_b: b,
  };
}

export async function verifyFreeze(input: {
  databaseUrl: string;
  intervalMs: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<FreezeCompareResult> {
  if (!Number.isFinite(input.intervalMs) || input.intervalMs < 1000) {
    throw new Error("intervalMs must be >= 1000");
  }
  const sleep =
    input.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  const a = await takeFreezeSnapshot(input.databaseUrl);
  await sleep(input.intervalMs);
  const b = await takeFreezeSnapshot(input.databaseUrl);
  return compareFreezeSnapshots(a, b, input.intervalMs);
}
