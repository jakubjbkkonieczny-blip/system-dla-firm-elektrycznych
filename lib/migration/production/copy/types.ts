import type { BusinessTable } from "@/lib/migration/production/constants";
import type { MaskedDbIdentity } from "@/lib/migration/production/identity";

export type TableExportStats = {
  table: BusinessTable;
  row_count: number;
  columns: string[];
  id_set_sha256: string;
  ordered_row_sha256: string;
  jsonl: string;
  sql: string;
};

export type BusinessExportManifest = {
  created_at: string;
  method: string;
  scope: string;
  writes_enabled: false;
  source: MaskedDbIdentity;
  location: string;
  tables: Record<string, TableExportStats>;
  notes: string[];
};

export type CopyDryRunReport = {
  at: string;
  WRITES_ENABLED: false;
  ok: boolean;
  source: MaskedDbIdentity;
  destination: MaskedDbIdentity | null;
  destination_status:
    | "EMPTY_OK"
    | "NON_EMPTY_STOP"
    | "MISSING"
    | "UNCONFIRMED"
    | "REFUSED";
  table_coverage: {
    expected: number;
    source_present: string[];
    source_missing: string[];
    dest_present: string[];
    dest_missing: string[];
  };
  source_counts: Record<string, number>;
  destination_counts: Record<string, number>;
  column_compatibility: Array<{
    table: string;
    ok: boolean;
    detail: string;
  }>;
  dependency_plan: string[];
  manifest_destination: string | null;
  disk: {
    checked: boolean;
    free_bytes: number | null;
    warning: string | null;
  };
  reasons: string[];
  verdict: "COPY_DRY_RUN_SAFE" | "COPY_DRY_RUN_BLOCKED";
};

export type ImportOptions = {
  exportDir: string;
  destinationDatabaseUrl: string;
  confirmProductionProjectRef: string;
  nextPublicSupabaseUrl?: string | null;
  batchSize?: number;
  execute: boolean;
};
