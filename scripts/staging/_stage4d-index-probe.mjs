import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = v;
  }
  return out;
}

async function probe(label, envPath) {
  const env = loadEnvFile(envPath);
  const url = env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = env.DIRECT_URL || url;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      t.relname AS table_name,
      (SELECT COUNT(*) FROM pg_index i WHERE i.indrelid = t.oid)::int AS index_count,
      (SELECT COUNT(*) FROM pg_index i WHERE i.indrelid = t.oid AND i.indisunique)::int AS unique_index_count,
      (SELECT COUNT(*) FROM pg_constraint c WHERE c.conrelid = t.oid AND c.contype = 'p')::int AS pk_count,
      (SELECT COUNT(*) FROM pg_constraint c WHERE c.conrelid = t.oid AND c.contype = 'u')::int AS unique_constraint_count,
      (SELECT COUNT(*) FROM pg_constraint c WHERE c.conrelid = t.oid AND c.contype = 'f')::int AS fk_count
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relkind = 'r'
      AND t.relname IN (
        'User','Company','CompanyMember','Job','JobAssignment','JobStage',
        'JobStageHistory','JobStageNoteHistory','JobStagePhoto','JobStatusHistory',
        'AuditLog','IdempotencyKey','VerificationToken','AttendanceSession',
        'VacationRequest','JobBudget','JobBudgetItem','JobBudgetLaborItem',
        'StripeWebhookEvent','Notification','PushSubscription'
      )
    ORDER BY t.relname
  `);
  const userNulls = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*)::int AS rows,
      COUNT(*) FILTER (WHERE "supabaseAuthUserId" IS NULL)::int AS null_supabaseAuthUserId,
      COUNT(*) FILTER (WHERE "supabaseAuthUserId" IS NOT NULL)::int AS linked_supabaseAuthUserId,
      COUNT(*) FILTER (WHERE "stripeCustomerId" IS NULL)::int AS null_stripeCustomerId,
      COUNT(*) FILTER (WHERE "googleRefreshToken" IS NULL)::int AS null_googleRefreshToken,
      COUNT(*) FILTER (WHERE "pushSubscription" IS NULL)::int AS null_pushSubscription
    FROM "User"
  `);
  await prisma.$disconnect();
  return { label, host: new URL(url).hostname, rows, userNulls: userNulls[0] };
}

const neon = await probe("neon", path.join(root, ".env"));
const supabase = await probe(
  "supabase",
  path.join(root, ".env.supabase-staging")
);

const mismatches = [];
for (let i = 0; i < neon.rows.length; i++) {
  const a = neon.rows[i];
  const b = supabase.rows[i];
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    mismatches.push({ neon: a, supabase: b });
  }
}
const nullMatch =
  JSON.stringify(neon.userNulls) === JSON.stringify(supabase.userNulls);

console.log(
  JSON.stringify(
    {
      neon_host: neon.host,
      supabase_host: supabase.host,
      schema_counts: neon.rows,
      schema_counts_match: mismatches.length === 0,
      schema_mismatches: mismatches,
      user_nulls_neon: neon.userNulls,
      user_nulls_supabase: supabase.userNulls,
      user_nulls_match: nullMatch,
    },
    null,
    2
  )
);
process.exit(mismatches.length === 0 && nullMatch ? 0 : 2);
