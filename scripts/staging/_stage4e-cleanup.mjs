/**
 * Stage 4E — cleanup leftover integration-test rows on Supabase staging.
 *
 * Safety: only deletes rows that match ALL of:
 * - created at/after Stage 4E start
 * - User.id is UUID form (tests use randomUUID; migrated rows use cuid)
 * - email ends with @example.com / @example.invalid or stage4e probe prefixes
 *
 * Companies: UUID id + created at/after Stage 4E start.
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAGE4E_START = "2026-08-03T15:15:00.000Z";
const UUID_RE =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

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

const env = {
  ...loadEnvFile(path.join(root, ".env")),
  ...loadEnvFile(path.join(root, ".env.local")),
};
const host = new URL(env.DATABASE_URL).hostname;
if (/neon\.tech/i.test(host)) {
  console.error("Refusing cleanup on Neon");
  process.exit(2);
}

const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
});
const mode = process.argv[2] || "inspect";

async function counts() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT COUNT(*)::int FROM "User") AS users,
      (SELECT COUNT(*)::int FROM "Company") AS companies,
      (SELECT COUNT(*)::int FROM "Job") AS jobs,
      (SELECT COUNT(*)::int FROM "CompanyMember") AS members,
      (SELECT COUNT(*)::int FROM "User" WHERE "supabaseAuthUserId" IS NOT NULL) AS linked
  `);
  return rows[0];
}

try {
  const before = await counts();

  const testUsers = await prisma.$queryRawUnsafe(`
    SELECT id, email, "createdAt"
    FROM "User"
    WHERE "createdAt" >= TIMESTAMPTZ '${STAGE4E_START}'
      AND id ~ '${UUID_RE}'
      AND (
        email ILIKE '%@example.com'
        OR email ILIKE '%@example.invalid'
        OR email ILIKE 'stage4e.probe.%'
        OR email ILIKE 'vw.stage4e.probe.%'
      )
    ORDER BY "createdAt" DESC
  `);

  const testCompanies = await prisma.$queryRawUnsafe(`
    SELECT id, name, "createdAt"
    FROM "Company"
    WHERE "createdAt" >= TIMESTAMPTZ '${STAGE4E_START}'
      AND id ~ '${UUID_RE}'
    ORDER BY "createdAt" DESC
  `);

  const report = {
    host,
    mode,
    stage4e_start: STAGE4E_START,
    before,
    test_users_found: testUsers.length,
    test_companies_found: testCompanies.length,
    sample_emails: testUsers.slice(0, 20).map((u) => u.email),
    sample_companies: testCompanies.slice(0, 10).map((c) => c.name),
  };

  if (mode === "cleanup") {
    const userIds = testUsers.map((u) => u.id);
    const companyIds = testCompanies.map((c) => c.id);

    if (companyIds.length) {
      // Prefer companyId filters (schema relations vary by table).
      await prisma.jobStageNoteHistory.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.jobStageHistory.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.jobStagePhoto.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.jobStage.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.jobBudgetLaborItem.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.jobBudgetItem.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.jobBudget.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.jobAssignment.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.jobStatusHistory.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.attendanceSession.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.vacationRequest.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.notification.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.idempotencyKey.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.companyMember.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    }

    if (userIds.length) {
      await prisma.notification.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.pushSubscription.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.verificationToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.idempotencyKey.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.companyMember.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    await prisma.auditLog.deleteMany({
      where: { entityType: "Stage4EProbe" },
    });

    report.deleted = {
      users: userIds.length,
      companies: companyIds.length,
    };
  }

  report.after = await counts();
  const outPath = path.join(root, "scripts/staging/_stage4e-cleanup.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await prisma.$disconnect();
}
