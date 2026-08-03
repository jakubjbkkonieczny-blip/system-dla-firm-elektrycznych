/**
 * Deterministic JSONL / SQL value serialization for business copy tooling.
 */

import { createHash } from "node:crypto";

export function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    // Preserve already-ISO strings; normalize Date-parseable timestamps.
    const d = new Date(value);
    if (!Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return d.toISOString();
    }
    return value;
  }
  return String(value);
}

/** Normalize a DB row for deterministic JSONL (timestamps → ISO, BigInt → number/string). */
export function normalizeRowForJsonl(
  row: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = null;
    } else if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (typeof value === "bigint") {
      out[key] = Number.isSafeInteger(Number(value))
        ? Number(value)
        : value.toString();
    } else if (Buffer.isBuffer(value)) {
      out[key] = value.toString("base64");
    } else if (typeof value === "object") {
      // JSON / objects — stable stringify via JSON parse roundtrip
      out[key] = JSON.parse(JSON.stringify(value));
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Refusing non-finite number in SQL literal");
    }
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) {
    return `'${value.toISOString().replace("T", " ").replace("Z", "+00")}'`;
  }
  if (typeof value === "object") {
    const json = JSON.stringify(value).replace(/'/g, "''");
    return `'${json}'::jsonb`;
  }
  const s = String(value).replace(/'/g, "''");
  return `'${s}'`;
}

export function buildInsertSql(
  table: string,
  columns: string[],
  rows: Record<string, unknown>[]
): string {
  if (!rows.length) {
    return `-- ${table}: 0 rows\n`;
  }
  const colList = columns.map(quoteIdent).join(", ");
  const valueLines = rows.map((row) => {
    const vals = columns.map((c) => sqlLiteral(row[c]));
    return `(${vals.join(", ")})`;
  });
  return `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES\n${valueLines.join(",\n")};\n`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function idSetSha256(ids: string[]): string {
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  return sha256Hex(sorted.join("\n"));
}

export function orderedRowFingerprintSha256(
  rows: Record<string, unknown>[],
  columns: string[]
): string {
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return "<NULL>";
        if (typeof v === "object") return JSON.stringify(v);
        return String(v);
      })
      .join("|")
  );
  return sha256Hex(lines.join("\n"));
}
