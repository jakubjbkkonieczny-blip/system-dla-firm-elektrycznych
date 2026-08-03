/**
 * Stage 4D — read-only Neon ↔ Supabase staging data validation.
 * SELECT-only. Never mutates either database.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outPath = path.join(root, "scripts/staging/_stage4d-report.json");

const TABLES = [
  "User",
  "Company",
  "CompanyMember",
  "Job",
  "JobAssignment",
  "JobStage",
  "JobStageHistory",
  "JobStageNoteHistory",
  "JobStagePhoto",
  "JobStatusHistory",
  "AuditLog",
  "IdempotencyKey",
  "VerificationToken",
  "AttendanceSession",
  "VacationRequest",
  "JobBudget",
  "JobBudgetItem",
  "JobBudgetLaborItem",
  "StripeWebhookEvent",
  "Notification",
  "PushSubscription",
];

/** Critical columns for identity / ownership hashing */
const IDENTITY_SPECS = {
  User: ["id", "supabaseAuthUserId", "email", "stripeCustomerId", "stripeSubscriptionId", "googleAccessToken", "googleRefreshToken", "pushSubscription", "createdAt", "updatedAt", "deactivatedAt", "scheduledDeletionAt", "pendingDeletionAt"],
  Company: ["id", "slug", "createdAt", "updatedAt", "deactivatedAt", "scheduledDeletionAt"],
  CompanyMember: ["id", "companyId", "userId", "role", "scope", "isActive", "invitedById", "createdAt", "updatedAt"],
  Job: ["id", "companyId", "createdByUserId", "jobNumber", "status", "deletedAt", "createdAt", "updatedAt"],
  Notification: ["id", "userId", "companyId", "type", "createdAt", "readAt"],
  AttendanceSession: ["id", "companyId", "userId", "sessionDate", "status", "createdAt", "updatedAt"],
  VacationRequest: ["id", "companyId", "userId", "status", "decidedById", "createdAt", "updatedAt"],
  JobBudget: ["id", "companyId", "jobId", "totalBudgetCents", "createdAt", "updatedAt"],
  JobBudgetItem: ["id", "companyId", "jobId", "budgetId", "createdByUserId", "assignedUserId", "createdAt", "updatedAt"],
  JobBudgetLaborItem: ["id", "companyId", "jobId", "budgetId", "userId", "createdByUserId", "createdAt", "updatedAt"],
  PushSubscription: ["id", "userId", "endpoint", "p256dh", "auth", "createdAt", "updatedAt"],
  VerificationToken: ["id", "userId", "purpose", "tokenHash", "expiresAt", "usedAt", "createdAt", "failedAttempts"],
};

function loadEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[key] = v;
  }
  return out;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid";
  }
}

function clientFor(env, label) {
  // Prefer pooler DATABASE_URL (Supabase direct may be IPv6-only).
  const url = env.DATABASE_URL;
  const direct = env.DIRECT_URL || env.DATABASE_URL;
  if (!url) throw new Error(`${label}: missing DATABASE_URL`);
  const prisma = new PrismaClient({
    datasources: { db: { url } },
    log: [],
  });
  // Ensure DIRECT_URL is present for Prisma internals if referenced.
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = direct;
  return { prisma, host: hostOf(url), label };
}

async function q(prisma, sql) {
  return prisma.$queryRawUnsafe(sql);
}

async function qOne(prisma, sql) {
  const rows = await q(prisma, sql);
  return rows[0] ?? null;
}

function num(v) {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  return Number(v);
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function md5Hex(s) {
  return crypto.createHash("md5").update(s, "utf8").digest("hex");
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pushMismatch(mismatches, area, detail) {
  mismatches.push({ area, ...detail });
}

async function tableExists(prisma, table) {
  const row = await qOne(
    prisma,
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '${table}'
    ) AS exists`
  );
  return Boolean(row?.exists);
}

async function getColumns(prisma, table) {
  return q(
    prisma,
    `SELECT column_name, data_type, udt_name, is_nullable, column_default,
            character_maximum_length, numeric_precision, numeric_scale, datetime_precision
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${table}'
     ORDER BY ordinal_position`
  );
}

async function getIndexes(prisma, table) {
  return q(
    prisma,
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = '${table}'
     ORDER BY indexname`
  );
}

async function getPrimaryKeyCols(prisma, table) {
  const rows = await q(
    prisma,
    `SELECT a.attname AS column_name
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
     WHERE n.nspname = 'public' AND c.relname = '${table}' AND i.indisprimary
     ORDER BY a.attnum`
  );
  return rows.map((r) => r.column_name);
}

async function getUniqueConstraints(prisma, table) {
  return q(
    prisma,
    `SELECT
       c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS definition
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relname = '${table}'
       AND c.contype IN ('u', 'p')
     ORDER BY c.conname`
  );
}

async function getForeignKeys(prisma, table) {
  return q(
    prisma,
    `SELECT
       c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS definition
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relname = '${table}'
       AND c.contype = 'f'
     ORDER BY c.conname`
  );
}

async function getFkOrphans(prisma, table) {
  // Orphan counts for each FK on the table (child → parent).
  const fks = await q(
    prisma,
    `SELECT
       c.conname AS constraint_name,
       (
         SELECT string_agg(quote_ident(a.attname), ',' ORDER BY u.ord)
         FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
       ) AS child_cols,
       (
         SELECT string_agg(quote_ident(a.attname), ',' ORDER BY u.ord)
         FROM unnest(c.confkey) WITH ORDINALITY AS u(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = u.attnum
       ) AS parent_cols,
       quote_ident(pn.nspname) || '.' || quote_ident(pt.relname) AS parent_table
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     JOIN pg_class pt ON pt.oid = c.confrelid
     JOIN pg_namespace pn ON pn.oid = pt.relnamespace
     WHERE n.nspname = 'public' AND t.relname = '${table}' AND c.contype = 'f'
     ORDER BY c.conname`
  );

  const results = [];
  for (const fk of fks) {
    const childCols = fk.child_cols.split(",");
    const parentCols = fk.parent_cols.split(",");
    const nullSafe = childCols.map((c) => `${c} IS NOT NULL`).join(" AND ");
    const joinOn = childCols
      .map((c, i) => `c.${c} = p.${parentCols[i]}`)
      .join(" AND ");
    const sql = `
      SELECT COUNT(*)::bigint AS orphan_count
      FROM public."${table}" c
      WHERE ${nullSafe}
        AND NOT EXISTS (
          SELECT 1 FROM ${fk.parent_table} p WHERE ${joinOn}
        )`;
    const row = await qOne(prisma, sql);
    results.push({
      constraint: fk.constraint_name,
      parent_table: fk.parent_table,
      child_cols: fk.child_cols,
      orphan_count: num(row?.orphan_count),
    });
  }
  return results;
}

async function nullDistribution(prisma, table, columns) {
  if (!columns.length) return {};
  const parts = columns.map(
    (c) =>
      `COUNT(*) FILTER (WHERE ${quoteIdent(c.column_name)} IS NULL)::bigint AS ${quoteIdent(
        "null__" + c.column_name
      )}`
  );
  const row = await qOne(
    prisma,
    `SELECT ${parts.join(", ")} FROM public."${table}"`
  );
  const out = {};
  for (const c of columns) {
    out[c.column_name] = num(row?.["null__" + c.column_name]);
  }
  return out;
}

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function rowAndPkStats(prisma, table, pkCols) {
  const pkExpr =
    pkCols.length === 1
      ? quoteIdent(pkCols[0])
      : `CONCAT(${pkCols.map((c) => quoteIdent(c)).join(", '|', ")})`;
  const row = await qOne(
    prisma,
    `SELECT
       COUNT(*)::bigint AS row_count,
       COUNT(${pkExpr})::bigint AS pk_nonnull_count,
       COUNT(DISTINCT ${pkExpr})::bigint AS pk_distinct_count
     FROM public."${table}"`
  );
  return {
    row_count: num(row?.row_count),
    pk_nonnull_count: num(row?.pk_nonnull_count),
    pk_distinct_count: num(row?.pk_distinct_count),
    pk_duplicate_count:
      num(row?.pk_nonnull_count) - num(row?.pk_distinct_count),
  };
}

async function uniqueKeyDuplicates(prisma, table) {
  const uniques = await q(
    prisma,
    `SELECT
       c.conname AS constraint_name,
       (
         SELECT string_agg(quote_ident(a.attname), ',' ORDER BY u.ord)
         FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
       ) AS cols
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relname = '${table}'
       AND c.contype = 'u'
     ORDER BY c.conname`
  );
  const out = [];
  for (const u of uniques) {
    const cols = u.cols.split(",");
    const expr =
      cols.length === 1
        ? cols[0]
        : `CONCAT(${cols.join(", '|', ")})`;
    const nullSafe = cols.map((c) => `${c} IS NOT NULL`).join(" AND ");
    const row = await qOne(
      prisma,
      `SELECT COUNT(*)::bigint AS dup_groups
       FROM (
         SELECT ${expr} AS k, COUNT(*)::bigint AS c
         FROM public."${table}"
         WHERE ${nullSafe}
         GROUP BY ${expr}
         HAVING COUNT(*) > 1
       ) d`
    );
    out.push({
      constraint: u.constraint_name,
      cols: u.cols,
      duplicate_groups: num(row?.dup_groups),
    });
  }
  return out;
}

async function checksumTable(prisma, table, columns) {
  // Deterministic ordered aggregate over all columns as text, keyed by id if present else full row.
  const colList = columns.map((c) => c.column_name);
  const hasId = colList.includes("id");
  const orderCol = hasId ? '"id"' : colList.map(quoteIdent).join(", ");
  const rowExpr = colList
    .map(
      (c) =>
        `COALESCE(${quoteIdent(c)}::text, '<NULL>')`
    )
    .join(` || '|' || `);

  // Batch via server-side string_agg of per-row md5, then hash client-side if needed.
  // For large tables use md5 of ordered id set + md5 of ordered row fingerprints.
  const sql = `
    SELECT
      COUNT(*)::bigint AS row_count,
      COALESCE(
        string_agg(md5(${rowExpr}), '' ORDER BY ${orderCol}),
        ''
      ) AS ordered_row_md5_concat,
      COALESCE(
        string_agg(
          CASE WHEN ${hasId ? '"id"' : "NULL"} IS NOT NULL THEN ${hasId ? '"id"' : "''"}::text ELSE '' END,
          '' ORDER BY ${hasId ? '"id"' : orderCol}
        ),
        ''
      ) AS ordered_id_concat
    FROM public."${table}"
  `;
  const row = await qOne(prisma, sql);
  const concat = row?.ordered_row_md5_concat ?? "";
  const idConcat = row?.ordered_id_concat ?? "";
  return {
    row_count: num(row?.row_count),
    ordered_row_md5: md5Hex(concat),
    ordered_row_sha256: sha256Hex(concat),
    id_set_sha256: sha256Hex(idConcat),
    id_set_md5: md5Hex(idConcat),
  };
}

async function identityFingerprint(prisma, table, cols) {
  const existing = await getColumns(prisma, table);
  const names = new Set(existing.map((c) => c.column_name));
  const useCols = cols.filter((c) => names.has(c));
  if (!useCols.length) return { missing_all: true };
  const hasId = names.has("id");
  const orderCol = hasId ? '"id"' : useCols.map(quoteIdent).join(", ");
  const rowExpr = useCols
    .map((c) => `COALESCE(${quoteIdent(c)}::text, '<NULL>')`)
    .join(` || '|' || `);
  const row = await qOne(
    prisma,
    `SELECT
       COUNT(*)::bigint AS row_count,
       COALESCE(string_agg(md5(${rowExpr}), '' ORDER BY ${orderCol}), '') AS concat_fp
     FROM public."${table}"`
  );
  const concat = row?.concat_fp ?? "";
  return {
    columns: useCols,
    row_count: num(row?.row_count),
    sha256: sha256Hex(concat),
    md5: md5Hex(concat),
  };
}

async function businessIntegrity(prisma) {
  const checks = [];

  async function count(sql, name) {
    const row = await qOne(prisma, sql);
    checks.push({ name, orphan_or_bad_count: num(row?.c) });
  }

  await count(
    `SELECT COUNT(*)::bigint AS c FROM "CompanyMember" cm
     WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = cm."userId")`,
    "CompanyMember → User"
  );
  await count(
    `SELECT COUNT(*)::bigint AS c FROM "CompanyMember" cm
     WHERE NOT EXISTS (SELECT 1 FROM "Company" co WHERE co.id = cm."companyId")`,
    "CompanyMember → Company"
  );
  await count(
    `SELECT COUNT(*)::bigint AS c FROM "Job" j
     WHERE NOT EXISTS (SELECT 1 FROM "Company" co WHERE co.id = j."companyId")`,
    "Job → Company"
  );
  await count(
    `SELECT COUNT(*)::bigint AS c FROM "Job" j
     WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = j."createdByUserId")`,
    "Job → creator User"
  );
  await count(
    `SELECT COUNT(*)::bigint AS c FROM "Notification" n
     WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = n."userId")`,
    "Notification → User"
  );
  await count(
    `SELECT COUNT(*)::bigint AS c FROM "JobBudget" b
     WHERE NOT EXISTS (SELECT 1 FROM "Job" j WHERE j.id = b."jobId")`,
    "JobBudget → Job"
  );
  await count(
    `SELECT COUNT(*)::bigint AS c FROM "PushSubscription" p
     WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = p."userId")`,
    "PushSubscription → User"
  );
  await count(
    `SELECT COUNT(*)::bigint AS c FROM "VerificationToken" v
     WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = v."userId")`,
    "VerificationToken → User"
  );
  await count(
    `SELECT COUNT(*)::bigint AS c FROM "AttendanceSession" a
     WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."userId")
        OR NOT EXISTS (SELECT 1 FROM "Company" co WHERE co.id = a."companyId")`,
    "AttendanceSession → User/Company"
  );
  await count(
    `SELECT COUNT(*)::bigint AS c FROM "VacationRequest" v
     WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = v."userId")
        OR NOT EXISTS (SELECT 1 FROM "Company" co WHERE co.id = v."companyId")`,
    "VacationRequest → User/Company"
  );
  await count(
    `SELECT COUNT(*)::bigint AS c FROM "CompanyMember"
     GROUP BY "companyId", "userId" HAVING COUNT(*) > 1`,
    "CompanyMember duplicate (companyId,userId) groups"
  );
  // The above GROUP BY query returns multiple rows; recount properly:
  const dupCm = await qOne(
    prisma,
    `SELECT COUNT(*)::bigint AS c FROM (
       SELECT 1 FROM "CompanyMember"
       GROUP BY "companyId", "userId" HAVING COUNT(*) > 1
     ) d`
  );
  checks[checks.length - 1].orphan_or_bad_count = num(dupCm?.c);

  return checks;
}

async function authModelCheck(prisma, label) {
  const hasAuth = await qOne(
    prisma,
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth'
     ) AS exists`
  );
  if (!hasAuth?.exists) {
    return { label, auth_schema: false };
  }
  const users = await qOne(
    prisma,
    `SELECT COUNT(*)::bigint AS c FROM auth.users`
  );
  const linked = await qOne(
    prisma,
    `SELECT COUNT(*)::bigint AS c FROM "User" WHERE "supabaseAuthUserId" IS NOT NULL`
  );
  const missingAuth = await qOne(
    prisma,
    `SELECT COUNT(*)::bigint AS c FROM "User" u
     WHERE u."supabaseAuthUserId" IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM auth.users a WHERE a.id::text = u."supabaseAuthUserId"
       )`
  );
  const duplicateLinks = await qOne(
    prisma,
    `SELECT COUNT(*)::bigint AS c FROM (
       SELECT "supabaseAuthUserId" FROM "User"
       WHERE "supabaseAuthUserId" IS NOT NULL
       GROUP BY "supabaseAuthUserId" HAVING COUNT(*) > 1
     ) d`
  );
  return {
    label,
    auth_schema: true,
    auth_users_count: num(users?.c),
    public_user_with_supabaseAuthUserId: num(linked?.c),
    public_user_missing_auth_parent: num(missingAuth?.c),
    duplicate_supabaseAuthUserId: num(duplicateLinks?.c),
    architecture: "auth.users.id → User.supabaseAuthUserId → User.id",
  };
}

async function sideSnapshot(side) {
  const { prisma, host, label } = side;
  const snap = {
    label,
    host,
    tables: {},
    business_integrity: [],
    auth: null,
  };

  for (const table of TABLES) {
    const exists = await tableExists(prisma, table);
    if (!exists) {
      snap.tables[table] = { exists: false };
      continue;
    }
    const columns = await getColumns(prisma, table);
    const pkCols = await getPrimaryKeyCols(prisma, table);
    const indexes = await getIndexes(prisma, table);
    const uniqueIdx = indexes.filter((i) =>
      /\bUNIQUE\b/i.test(i.indexdef)
    );
    const uniques = await getUniqueConstraints(prisma, table);
    const fks = await getForeignKeys(prisma, table);
    const orphans = await getFkOrphans(prisma, table);
    const stats = await rowAndPkStats(prisma, table, pkCols.length ? pkCols : ["id"]);
    const uniqDups = await uniqueKeyDuplicates(prisma, table);
    const nulls = await nullDistribution(prisma, table, columns);
    const checksum = await checksumTable(prisma, table, columns);
    const identity = IDENTITY_SPECS[table]
      ? await identityFingerprint(prisma, table, IDENTITY_SPECS[table])
      : null;

    snap.tables[table] = {
      exists: true,
      columns: columns.map((c) => ({
        column_name: c.column_name,
        data_type: c.data_type,
        udt_name: c.udt_name,
        is_nullable: c.is_nullable,
        column_default: c.column_default,
        character_maximum_length: c.character_maximum_length,
        numeric_precision: c.numeric_precision,
        numeric_scale: c.numeric_scale,
        datetime_precision: c.datetime_precision,
      })),
      pk_cols: pkCols,
      index_count: indexes.length,
      unique_index_count: uniqueIdx.length,
      indexes: indexes.map((i) => ({ name: i.indexname, def: i.indexdef })),
      unique_constraints: uniques,
      foreign_keys: fks,
      fk_orphans: orphans,
      stats,
      unique_duplicates: uniqDups,
      null_distribution: nulls,
      checksum,
      identity,
    };
  }

  snap.business_integrity = await businessIntegrity(prisma);
  snap.auth = await authModelCheck(prisma, label);

  // Extra identity aggregates for critical sets
  snap.identity_sets = {
    user_ids_sha256: (
      await identityFingerprint(prisma, "User", ["id"])
    ).sha256,
    user_supabaseAuthUserId_sha256: (
      await identityFingerprint(prisma, "User", ["id", "supabaseAuthUserId"])
    ).sha256,
    company_ids_sha256: (
      await identityFingerprint(prisma, "Company", ["id"])
    ).sha256,
    company_member_sha256: (
      await identityFingerprint(prisma, "CompanyMember", [
        "id",
        "companyId",
        "userId",
        "role",
        "scope",
      ])
    ).sha256,
    job_ownership_sha256: (
      await identityFingerprint(prisma, "Job", [
        "id",
        "companyId",
        "createdByUserId",
      ])
    ).sha256,
    notification_ownership_sha256: (
      await identityFingerprint(prisma, "Notification", ["id", "userId"])
    ).sha256,
    attendance_ownership_sha256: (
      await identityFingerprint(prisma, "AttendanceSession", [
        "id",
        "companyId",
        "userId",
      ])
    ).sha256,
    vacation_ownership_sha256: (
      await identityFingerprint(prisma, "VacationRequest", [
        "id",
        "companyId",
        "userId",
      ])
    ).sha256,
    budget_ownership_sha256: (
      await identityFingerprint(prisma, "JobBudget", ["id", "companyId", "jobId"])
    ).sha256,
    push_sha256: (
      await identityFingerprint(prisma, "PushSubscription", [
        "id",
        "userId",
        "endpoint",
      ])
    ).sha256,
    verification_sha256: (
      await identityFingerprint(prisma, "VerificationToken", [
        "id",
        "userId",
        "tokenHash",
      ])
    ).sha256,
    stripe_sha256: (
      await identityFingerprint(prisma, "User", [
        "id",
        "stripeCustomerId",
        "stripeSubscriptionId",
        "subscriptionStatus",
      ])
    ).sha256,
    google_sha256: (
      await identityFingerprint(prisma, "User", [
        "id",
        "googleAccessToken",
        "googleRefreshToken",
      ])
    ).sha256,
  };

  return snap;
}

function compareSnapshots(neon, supabase) {
  const mismatches = [];
  const rowCounts = [];
  const pkComparison = [];
  const fkComparison = [];
  const uniqueComparison = [];
  const checksumComparison = [];
  const identityComparison = [];
  const businessComparison = [];
  const schemaComparison = [];

  for (const table of TABLES) {
    const a = neon.tables[table];
    const b = supabase.tables[table];
    if (!a?.exists || !b?.exists) {
      pushMismatch(mismatches, "table_existence", {
        table,
        neon_exists: Boolean(a?.exists),
        supabase_exists: Boolean(b?.exists),
      });
      continue;
    }

    // Row counts
    const rc = {
      table,
      neon: a.stats.row_count,
      supabase: b.stats.row_count,
      match: a.stats.row_count === b.stats.row_count,
    };
    rowCounts.push(rc);
    if (!rc.match) {
      pushMismatch(mismatches, "row_count", rc);
    }

    // PK
    const pk = {
      table,
      neon: a.stats,
      supabase: b.stats,
      pk_cols_match: eq(a.pk_cols, b.pk_cols),
      match:
        a.stats.row_count === b.stats.row_count &&
        a.stats.pk_distinct_count === b.stats.pk_distinct_count &&
        a.stats.pk_duplicate_count === 0 &&
        b.stats.pk_duplicate_count === 0 &&
        a.stats.pk_nonnull_count === a.stats.row_count &&
        b.stats.pk_nonnull_count === b.stats.row_count &&
        eq(a.pk_cols, b.pk_cols),
    };
    pkComparison.push(pk);
    if (!pk.match) {
      pushMismatch(mismatches, "primary_key", {
        table,
        neon: a.stats,
        supabase: b.stats,
        neon_pk_cols: a.pk_cols,
        supabase_pk_cols: b.pk_cols,
      });
    }

    // Columns types/defaults
    if (!eq(a.columns, b.columns)) {
      // Diff column by column
      const mapA = Object.fromEntries(a.columns.map((c) => [c.column_name, c]));
      const mapB = Object.fromEntries(b.columns.map((c) => [c.column_name, c]));
      const names = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);
      for (const name of names) {
        if (!eq(mapA[name], mapB[name])) {
          pushMismatch(mismatches, "column_schema", {
            table,
            column: name,
            neon: mapA[name] ?? null,
            supabase: mapB[name] ?? null,
          });
          schemaComparison.push({
            table,
            column: name,
            neon: mapA[name] ?? null,
            supabase: mapB[name] ?? null,
          });
        }
      }
    }

    // Indexes
    if (a.index_count !== b.index_count || a.unique_index_count !== b.unique_index_count) {
      pushMismatch(mismatches, "index_count", {
        table,
        neon_index_count: a.index_count,
        supabase_index_count: b.index_count,
        neon_unique_index_count: a.unique_index_count,
        supabase_unique_index_count: b.unique_index_count,
      });
    }
    const idxNamesA = a.indexes.map((i) => i.name).sort();
    const idxNamesB = b.indexes.map((i) => i.name).sort();
    if (!eq(idxNamesA, idxNamesB)) {
      pushMismatch(mismatches, "index_names", {
        table,
        neon_only: idxNamesA.filter((n) => !idxNamesB.includes(n)),
        supabase_only: idxNamesB.filter((n) => !idxNamesA.includes(n)),
      });
    }

    // Unique constraints
    const uc = {
      table,
      neon: a.unique_constraints,
      supabase: b.unique_constraints,
      neon_dups: a.unique_duplicates,
      supabase_dups: b.unique_duplicates,
      match:
        eq(
          a.unique_constraints.map((x) => [x.constraint_name, x.definition]),
          b.unique_constraints.map((x) => [x.constraint_name, x.definition])
        ) &&
        a.unique_duplicates.every((d) => d.duplicate_groups === 0) &&
        b.unique_duplicates.every((d) => d.duplicate_groups === 0),
    };
    uniqueComparison.push(uc);
    if (!uc.match) {
      pushMismatch(mismatches, "unique_constraint", {
        table,
        neon_constraints: a.unique_constraints,
        supabase_constraints: b.unique_constraints,
        neon_dups: a.unique_duplicates,
        supabase_dups: b.unique_duplicates,
      });
    }

    // FK definitions + orphans
    const fk = {
      table,
      neon_fks: a.foreign_keys,
      supabase_fks: b.foreign_keys,
      neon_orphans: a.fk_orphans,
      supabase_orphans: b.fk_orphans,
      match:
        eq(
          a.foreign_keys.map((x) => [x.constraint_name, x.definition]),
          b.foreign_keys.map((x) => [x.constraint_name, x.definition])
        ) &&
        a.fk_orphans.every((o) => o.orphan_count === 0) &&
        b.fk_orphans.every((o) => o.orphan_count === 0),
    };
    fkComparison.push(fk);
    if (!fk.match) {
      pushMismatch(mismatches, "foreign_key", {
        table,
        neon_fks: a.foreign_keys,
        supabase_fks: b.foreign_keys,
        neon_orphans: a.fk_orphans.filter((o) => o.orphan_count > 0),
        supabase_orphans: b.fk_orphans.filter((o) => o.orphan_count > 0),
      });
    }

    // NULL distribution
    if (!eq(a.null_distribution, b.null_distribution)) {
      const cols = new Set([
        ...Object.keys(a.null_distribution),
        ...Object.keys(b.null_distribution),
      ]);
      for (const col of cols) {
        if (a.null_distribution[col] !== b.null_distribution[col]) {
          pushMismatch(mismatches, "null_distribution", {
            table,
            column: col,
            neon_nulls: a.null_distribution[col],
            supabase_nulls: b.null_distribution[col],
          });
        }
      }
    }

    // Checksums
    const cs = {
      table,
      neon: a.checksum,
      supabase: b.checksum,
      match: eq(a.checksum, b.checksum),
    };
    checksumComparison.push(cs);
    if (!cs.match) {
      pushMismatch(mismatches, "checksum", {
        table,
        neon: a.checksum,
        supabase: b.checksum,
      });
    }

    // Identity fingerprints for tables that have them
    if (a.identity && b.identity) {
      const idc = {
        table,
        neon: a.identity,
        supabase: b.identity,
        match: a.identity.sha256 === b.identity.sha256 && a.identity.md5 === b.identity.md5,
      };
      identityComparison.push(idc);
      if (!idc.match) {
        pushMismatch(mismatches, "identity_fingerprint", {
          table,
          neon: a.identity,
          supabase: b.identity,
        });
      }
    }
  }

  // Identity sets
  for (const key of Object.keys(neon.identity_sets)) {
    const match = neon.identity_sets[key] === supabase.identity_sets[key];
    identityComparison.push({
      set: key,
      neon: neon.identity_sets[key],
      supabase: supabase.identity_sets[key],
      match,
    });
    if (!match) {
      pushMismatch(mismatches, "identity_set", {
        set: key,
        neon: neon.identity_sets[key],
        supabase: supabase.identity_sets[key],
      });
    }
  }

  // Business integrity (both sides should be zero orphans; also compare)
  for (let i = 0; i < neon.business_integrity.length; i++) {
    const a = neon.business_integrity[i];
    const b = supabase.business_integrity[i];
    const item = {
      name: a.name,
      neon: a.orphan_or_bad_count,
      supabase: b?.orphan_or_bad_count,
      match:
        a.orphan_or_bad_count === b?.orphan_or_bad_count &&
        a.orphan_or_bad_count === 0,
    };
    businessComparison.push(item);
    if (!item.match) {
      pushMismatch(mismatches, "business_integrity", item);
    }
  }

  // Auth model (Supabase only must hold architecture; Neon may lack auth schema)
  if (supabase.auth?.auth_schema) {
    if (supabase.auth.public_user_missing_auth_parent > 0) {
      pushMismatch(mismatches, "auth_model", {
        detail: "User.supabaseAuthUserId references missing auth.users.id",
        count: supabase.auth.public_user_missing_auth_parent,
      });
    }
    if (supabase.auth.duplicate_supabaseAuthUserId > 0) {
      pushMismatch(mismatches, "auth_model", {
        detail: "duplicate User.supabaseAuthUserId",
        count: supabase.auth.duplicate_supabaseAuthUserId,
      });
    }
  }

  return {
    rowCounts,
    pkComparison,
    fkComparison,
    uniqueComparison,
    checksumComparison,
    identityComparison,
    businessComparison,
    schemaComparison,
    mismatches,
  };
}

async function main() {
  const neonEnv = loadEnvFile(path.join(root, ".env"));
  const supabaseEnv = loadEnvFile(path.join(root, ".env.supabase-staging"));

  // Isolate Prisma env per client: create neon first, snapshot, disconnect, then supabase.
  // We set env vars carefully before each client construction.

  const neonUrl = neonEnv.DATABASE_URL;
  const neonDirect = neonEnv.DIRECT_URL || neonUrl;
  const supabaseUrl = supabaseEnv.DATABASE_URL;
  const supabaseDirect = supabaseEnv.DIRECT_URL || supabaseUrl;

  if (!/neon\.tech/i.test(hostOf(neonUrl))) {
    throw new Error("Safety: .env DATABASE_URL is not Neon");
  }
  if (!/supabase/i.test(hostOf(supabaseUrl))) {
    throw new Error("Safety: .env.supabase-staging DATABASE_URL is not Supabase");
  }

  console.log(
    JSON.stringify({
      phase: "connect",
      neon_host: hostOf(neonUrl),
      supabase_host: hostOf(supabaseUrl),
      mode: "read-only SELECT validation",
    })
  );

  process.env.DATABASE_URL = neonUrl;
  process.env.DIRECT_URL = neonDirect;
  const neonPrisma = new PrismaClient({
    datasources: { db: { url: neonUrl } },
  });
  const neonSide = { prisma: neonPrisma, host: hostOf(neonUrl), label: "neon" };

  // Sanity: write guard — abort if transaction_read_only somehow writable checks fail;
  // we simply never issue DML.
  await qOne(neonPrisma, "SELECT 1 AS ok");
  console.log(JSON.stringify({ phase: "snapshot", side: "neon", host: neonSide.host }));
  const neonSnap = await sideSnapshot(neonSide);
  await neonPrisma.$disconnect();

  process.env.DATABASE_URL = supabaseUrl;
  process.env.DIRECT_URL = supabaseDirect;
  // Prefer pooler; if DIRECT is unreachable Prisma still uses DATABASE_URL for queries.
  const supabasePrisma = new PrismaClient({
    datasources: { db: { url: supabaseUrl } },
  });
  const supabaseSide = {
    prisma: supabasePrisma,
    host: hostOf(supabaseUrl),
    label: "supabase_staging",
  };
  await qOne(supabasePrisma, "SELECT 1 AS ok");
  console.log(
    JSON.stringify({
      phase: "snapshot",
      side: "supabase_staging",
      host: supabaseSide.host,
    })
  );
  const supabaseSnap = await sideSnapshot(supabaseSide);
  await supabasePrisma.$disconnect();

  const comparison = compareSnapshots(neonSnap, supabaseSnap);
  const passed = comparison.mismatches.length === 0;

  const report = {
    stage: "4D",
    created_at: new Date().toISOString(),
    mode: "read-only",
    sources: {
      neon_host: neonSnap.host,
      supabase_host: supabaseSnap.host,
    },
    neon_auth: neonSnap.auth,
    supabase_auth: supabaseSnap.auth,
    row_counts: comparison.rowCounts,
    primary_keys: comparison.pkComparison.map((p) => ({
      table: p.table,
      match: p.match,
      neon: p.neon,
      supabase: p.supabase,
      pk_cols_match: p.pk_cols_match,
    })),
    foreign_keys: comparison.fkComparison.map((f) => ({
      table: f.table,
      match: f.match,
      neon_orphan_total: f.neon_orphans.reduce((s, o) => s + o.orphan_count, 0),
      supabase_orphan_total: f.supabase_orphans.reduce(
        (s, o) => s + o.orphan_count,
        0
      ),
      neon_fk_count: f.neon_fks.length,
      supabase_fk_count: f.supabase_fks.length,
      neon_orphans: f.neon_orphans.filter((o) => o.orphan_count > 0),
      supabase_orphans: f.supabase_orphans.filter((o) => o.orphan_count > 0),
    })),
    unique_constraints: comparison.uniqueComparison.map((u) => ({
      table: u.table,
      match: u.match,
      neon_constraint_count: u.neon.length,
      supabase_constraint_count: u.supabase.length,
      neon_dups: u.neon_dups.filter((d) => d.duplicate_groups > 0),
      supabase_dups: u.supabase_dups.filter((d) => d.duplicate_groups > 0),
    })),
    identity: comparison.identityComparison,
    business_integrity: comparison.businessComparison,
    checksums: comparison.checksumComparison.map((c) => ({
      table: c.table,
      match: c.match,
      neon: c.neon,
      supabase: c.supabase,
    })),
    schema_mismatches: comparison.schemaComparison,
    mismatches: comparison.mismatches,
    verdict: passed ? "DATA VALIDATION PASSED" : "STAGE 4D BLOCKED",
    mismatch_count: comparison.mismatches.length,
    table_summaries: Object.fromEntries(
      TABLES.map((t) => [
        t,
        {
          neon_rows: neonSnap.tables[t]?.stats?.row_count ?? null,
          supabase_rows: supabaseSnap.tables[t]?.stats?.row_count ?? null,
          neon_checksum: neonSnap.tables[t]?.checksum ?? null,
          supabase_checksum: supabaseSnap.tables[t]?.checksum ?? null,
        },
      ])
    ),
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify({
      phase: "done",
      verdict: report.verdict,
      mismatch_count: report.mismatch_count,
      report: outPath,
    })
  );
  process.exit(passed ? 0 : 2);
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      phase: "error",
      message: err?.message || String(err),
      stack: err?.stack,
    })
  );
  process.exit(1);
});
