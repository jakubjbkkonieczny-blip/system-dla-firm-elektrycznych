/**
 * Stage 4E — staging connectivity / cutover probe (temporary).
 * Does not print secrets. Safe to delete after Stage 4E.
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import dns from "node:dns/promises";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

function maskUrl(url) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port || "(default)",
      user: decodeURIComponent(u.username),
      db: u.pathname.replace(/^\//, ""),
      sslmode: u.searchParams.get("sslmode") || "unset",
      isNeon: /\.neon\.tech$/i.test(u.hostname),
      isSupabase:
        /supabase\.com$/i.test(u.hostname) ||
        /supabase\.co$/i.test(u.hostname),
    };
  } catch (e) {
    return { error: String(e) };
  }
}

async function tcpProbe(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, family: 0 }, () => {
      socket.destroy();
      resolve({ ok: true, family: socket.remoteFamily });
    });
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    socket.on("error", (err) => {
      resolve({ ok: false, error: err.code || err.message });
    });
  });
}

async function dnsProbe(host) {
  const out = { host, A: [], AAAA: [] };
  try {
    out.A = await dns.resolve4(host);
  } catch (e) {
    out.A_error = e.code || e.message;
  }
  try {
    out.AAAA = await dns.resolve6(host);
  } catch (e) {
    out.AAAA_error = e.code || e.message;
  }
  return out;
}

async function prismaSmoke(label, databaseUrl, directUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = directUrl;
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [],
  });
  const result = {
    label,
    database: maskUrl(databaseUrl),
    direct: maskUrl(directUrl),
  };
  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT current_database() AS db, inet_server_addr()::text AS addr, current_setting('server_version') AS version"
    );
    result.connect = { ok: true, ...rows[0] };

    const counts = await prisma.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*)::int FROM "User") AS users,
        (SELECT COUNT(*)::int FROM "User" WHERE "supabaseAuthUserId" IS NOT NULL) AS linked,
        (SELECT COUNT(*)::int FROM "Company") AS companies,
        (SELECT COUNT(*)::int FROM "Job") AS jobs
    `);
    result.counts = counts[0];

    // Transaction commit
    await prisma.$transaction(async (tx) => {
      const r = await tx.$queryRawUnsafe("SELECT 1::int AS n");
      if (r[0].n !== 1) throw new Error("tx commit probe failed");
    });
    result.tx_commit = { ok: true };

    // Transaction rollback
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT 1");
        throw new Error("FORCE_ROLLBACK");
      });
      result.tx_rollback = { ok: false, error: "did not roll back" };
    } catch (e) {
      result.tx_rollback = {
        ok: String(e.message || e).includes("FORCE_ROLLBACK"),
        detail: "intentional throw",
      };
    }

    // Advisory lock
    const lockKey = BigInt("1234567890123456789");
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${lockKey.toString()})`
      );
      const r = await tx.$queryRawUnsafe("SELECT 1::int AS locked");
      if (r[0].locked !== 1) throw new Error("advisory lock probe failed");
    });
    result.advisory_lock = { ok: true };

    // Auth schema presence (Supabase only expected)
    try {
      const auth = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM information_schema.schemata WHERE schema_name = 'auth'`
      );
      result.auth_schema = auth[0].n > 0;
      if (auth[0].n > 0) {
        const au = await prisma.$queryRawUnsafe(
          `SELECT COUNT(*)::int AS n FROM auth.users`
        );
        result.auth_users_count = au[0].n;
      }
    } catch (e) {
      result.auth_schema_error = e.code || e.message;
    }

    // Migration table
    try {
      const mig = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "_prisma_migrations"`
      );
      result.prisma_migrations_rows = mig[0].n;
    } catch (e) {
      result.prisma_migrations_error = e.code || e.message;
    }
  } catch (e) {
    result.connect = {
      ok: false,
      error: e.code || e.message,
      meta: e.meta || undefined,
    };
  } finally {
    await prisma.$disconnect();
  }
  return result;
}

async function writeProbe(label, databaseUrl, directUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = directUrl;
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [],
  });
  const marker = `stage4e-probe-${Date.now()}`;
  const out = { label, marker, created: [], deleted: [] };
  try {
    const company = await prisma.company.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!company) {
      out.skipped = "no company for AuditLog FK";
      return out;
    }
    out.companyId = company.id;

    const created = await prisma.auditLog.create({
      data: {
        companyId: company.id,
        action: marker,
        entityType: "Stage4EProbe",
        entityId: marker,
        data: { stage: "4E", purpose: "write-probe", marker },
      },
      select: { id: true, action: true },
    });
    out.created.push({ table: "AuditLog", id: created.id, action: created.action });

    const found = await prisma.auditLog.findUnique({ where: { id: created.id } });
    out.read_back = Boolean(found && found.action === marker);

    // FK enforcement: invalid companyId
    try {
      await prisma.auditLog.create({
        data: {
          companyId: "nonexistent_company_id_stage4e_fk_probe",
          action: `${marker}-fk`,
          entityType: "Stage4EProbe",
          entityId: marker,
        },
      });
      out.fk_enforced = false;
    } catch (e) {
      out.fk_enforced = true;
      out.fk_code = e.code || undefined;
    }

    // Unique constraint: User.email
    const uniqEmail = `stage4e.probe.${Date.now()}@example.invalid`;
    try {
      await prisma.user.create({
        data: {
          email: uniqEmail,
          displayName: "Stage4E Probe (delete me)",
        },
        select: { id: true },
      }).then(async (u) => {
        out.created.push({ table: "User", id: u.id, email: uniqEmail });
        try {
          await prisma.user.create({
            data: { email: uniqEmail, displayName: "dup" },
          });
          out.unique_enforced = false;
        } catch (e) {
          out.unique_enforced = true;
          out.unique_code = e.code || undefined;
        }
        await prisma.user.delete({ where: { id: u.id } });
        out.deleted.push({ table: "User", id: u.id });
      });
    } catch (e) {
      out.unique_probe_error = e.code || e.message;
    }

    await prisma.auditLog.delete({ where: { id: created.id } });
    out.deleted.push({ table: "AuditLog", id: created.id });
    const gone = await prisma.auditLog.findUnique({ where: { id: created.id } });
    out.cleanup_ok = gone === null;
  } catch (e) {
    out.error = e.code || e.message;
    out.meta = e.meta || undefined;
    // Best-effort cleanup of probe rows
    try {
      await prisma.auditLog.deleteMany({
        where: { entityType: "Stage4EProbe", action: { startsWith: "stage4e-probe-" } },
      });
      await prisma.user.deleteMany({
        where: { email: { startsWith: "stage4e.probe." } },
      });
    } catch {
      /* ignore */
    }
  } finally {
    await prisma.$disconnect();
  }
  return out;
}

async function allocateJobNumberProbe(databaseUrl, directUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = directUrl;
  const { Prisma } = await import("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [],
  });
  const out = { ok: false };
  try {
    // Prefer a company that already has jobs (read path only).
    const withJobs = await prisma.job.findFirst({
      select: { companyId: true },
      orderBy: { createdAt: "asc" },
    });
    const company = withJobs
      ? await prisma.company.findUnique({
          where: { id: withJobs.companyId },
          select: { id: true },
        })
      : await prisma.company.findFirst({
          select: { id: true },
          orderBy: { createdAt: "asc" },
        });
    if (!company) {
      out.skipped = "no company";
      return out;
    }
    out.companyId = company.id;

    // Mirror lib/server/jobs/job-number.ts (Prisma.sql + BigInt param).
    let nextNumber = null;
    let lockKeyStr = null;
    try {
      await prisma.$transaction(async (tx) => {
        const companyId = company.id;
        let k1 = 0;
        let k2 = 0;
        for (let i = 0; i < companyId.length; i++) {
          const c = companyId.charCodeAt(i);
          k1 = (Math.imul(k1, 31) + c) | 0;
          k2 = (Math.imul(k2, 37) + c) | 0;
        }
        const lockKey =
          (BigInt(k1 >>> 0) << BigInt(32)) | BigInt(k2 >>> 0);
        lockKeyStr = lockKey.toString();
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(${lockKey})`
        );
        const agg = await tx.job.aggregate({
          where: { companyId },
          _max: { jobNumber: true },
        });
        nextNumber = (agg._max.jobNumber ?? 0) + 1;
        throw new Error("STAGE4E_JOBNUM_ROLLBACK");
      });
    } catch (e) {
      if (!String(e.message || e).includes("STAGE4E_JOBNUM_ROLLBACK")) {
        throw e;
      }
    }

    out.ok = true;
    out.lockKey = lockKeyStr;
    out.nextJobNumber = nextNumber;
    out.persisted = false;
  } catch (e) {
    out.error = e.code || e.message;
    out.error_message = e.message;
    out.meta = e.meta || undefined;
  } finally {
    await prisma.$disconnect();
  }
  return out;
}

const mode = process.argv[2] || "baseline";

const neon = loadEnvFile(path.join(root, ".env"));
const local = loadEnvFile(path.join(root, ".env.local"));
const sb = loadEnvFile(path.join(root, ".env.supabase-staging"));

if (mode === "baseline") {
  const report = {
    stage: "4E",
    mode: "pre-cutover-baseline",
    created_at: new Date().toISOString(),
    runtime_mechanism: {
      description:
        "Local Next.js staging rehearsal via dotenv: .env then .env.local override. No .vercel / remote staging deploy config in repo.",
      env_files: {
        ".env": {
          DATABASE_URL: maskUrl(neon.DATABASE_URL),
          DIRECT_URL: maskUrl(neon.DIRECT_URL),
        },
        ".env.local": {
          DATABASE_URL: maskUrl(local.DATABASE_URL),
          DIRECT_URL: maskUrl(local.DIRECT_URL),
          SUPABASE_AUTH_ENABLED: local.SUPABASE_AUTH_ENABLED || null,
          VECTORWORK_STAGING_AUTH_INTEGRATION:
            local.VECTORWORK_STAGING_AUTH_INTEGRATION || null,
          NEXT_PUBLIC_SUPABASE_URL: local.NEXT_PUBLIC_SUPABASE_URL
            ? local.NEXT_PUBLIC_SUPABASE_URL.replace(/https?:\/\//, "")
            : null,
        },
        ".env.supabase-staging": {
          DATABASE_URL: maskUrl(sb.DATABASE_URL),
          DIRECT_URL: maskUrl(sb.DIRECT_URL),
        },
      },
    },
  };

  // DNS / TCP for supabase hosts
  const hosts = [
    maskUrl(sb.DATABASE_URL).host,
    maskUrl(sb.DIRECT_URL).host,
  ].filter(Boolean);
  report.network = {};
  for (const h of hosts) {
    const dnsInfo = await dnsProbe(h);
    const port =
      h.includes("pooler") ? Number(maskUrl(sb.DATABASE_URL).port || 5432) : 5432;
    const tcp = await tcpProbe(h, port);
    report.network[h] = { dns: dnsInfo, tcp: { port, ...tcp } };
  }

  report.neon_smoke = await prismaSmoke(
    "neon_current",
    neon.DATABASE_URL,
    neon.DIRECT_URL || neon.DATABASE_URL
  );

  // Prefer pooler as both URL and DIRECT when direct host unreachable
  const pooler = sb.DATABASE_URL;
  const direct = sb.DIRECT_URL;
  const directHost = maskUrl(direct).host;
  const directReachable = report.network[directHost]?.tcp?.ok === true;

  report.supabase_pooler_smoke = await prismaSmoke(
    "supabase_pooler",
    pooler,
    directReachable ? direct : pooler
  );

  if (directReachable) {
    report.supabase_direct_smoke = await prismaSmoke(
      "supabase_direct",
      direct,
      direct
    );
  } else {
    report.supabase_direct_smoke = {
      skipped: true,
      reason: "direct host TCP unreachable from this machine",
      host: directHost,
    };
  }

  report.recommended_staging_runtime = {
    DATABASE_URL: "Supabase Session pooler (aws-*-pooler.supabase.com:5432, user postgres.<ref>)",
    DIRECT_URL: directReachable
      ? "Supabase direct db.<ref>.supabase.co:5432"
      : "Same Session pooler URL as DATABASE_URL (IPv6 direct ENETUNREACH workaround; Prisma migrate deploy may need pooler)",
    pooling_mode: "Session (port 5432) — required for pg_advisory_xact_lock / Prisma",
    ssl: "require (append ?sslmode=require if unset)",
    prisma: "url=DATABASE_URL (pooled), directUrl=DIRECT_URL",
  };

  const outPath = path.join(root, "scripts/staging/_stage4e-baseline.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ wrote: outPath, summary: {
    neon_ok: report.neon_smoke.connect?.ok,
    supabase_pooler_ok: report.supabase_pooler_smoke.connect?.ok,
    direct_reachable: directReachable,
    neon_users: report.neon_smoke.counts?.users,
    sb_users: report.supabase_pooler_smoke.counts?.users,
    sb_linked: report.supabase_pooler_smoke.counts?.linked,
    auth_users: report.supabase_pooler_smoke.auth_users_count,
  }}, null, 2));
  process.exit(
    report.neon_smoke.connect?.ok && report.supabase_pooler_smoke.connect?.ok
      ? 0
      : 1
  );
}

if (mode === "post-cutover") {
  // Use effective runtime: .env.local overrides .env
  const databaseUrl = local.DATABASE_URL || neon.DATABASE_URL;
  const directUrl = local.DIRECT_URL || local.DATABASE_URL || neon.DIRECT_URL;
  const masked = maskUrl(databaseUrl);
  if (masked.isNeon || !masked.isSupabase) {
    console.error("BLOCKED: post-cutover runtime still Neon or not Supabase", masked);
    process.exit(2);
  }
  const smoke = await prismaSmoke("staging_runtime", databaseUrl, directUrl);
  const writes = await writeProbe("staging_runtime", databaseUrl, directUrl);
  const jobnum = await allocateJobNumberProbe(databaseUrl, directUrl);
  const out = {
    stage: "4E",
    mode: "post-cutover",
    created_at: new Date().toISOString(),
    runtime: { database: masked, direct: maskUrl(directUrl) },
    smoke,
    writes,
    jobnum,
  };
  const outPath = path.join(root, "scripts/staging/_stage4e-post.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    wrote: outPath,
    connect: smoke.connect?.ok,
    counts: smoke.counts,
    writes_ok: writes.cleanup_ok === true && writes.read_back === true,
    fk_enforced: writes.fk_enforced,
    advisory: smoke.advisory_lock?.ok,
    jobnum: jobnum.ok,
    neon_dependency: masked.isNeon,
  }, null, 2));
  process.exit(smoke.connect?.ok && writes.cleanup_ok && jobnum.ok ? 0 : 1);
}

console.error("Unknown mode", mode);
process.exit(1);
