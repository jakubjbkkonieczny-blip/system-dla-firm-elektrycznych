/**
 * Stage 4F — cleanup leftover integration-test rows on Supabase staging.
 *
 * Safety: only deletes rows that match ALL of:
 * - created at/after Stage 4F window start
 * - User.id is UUID form (tests use randomUUID; migrated rows use cuid)
 * - email ends with @example.com / @example.invalid or stage4f probe prefixes
 *
 * Companies: UUID id + created at/after window start.
 */
import { PrismaClient } from "@prisma/client";
import {
  assertSupabaseStaging,
  BASELINE,
  loadStagingEnv,
  withPoolParams,
  writeJson,
} from "./_stage4f-lib.mjs";

// Covers Stage 4E leftovers + Stage 4F test window on 2026-08-03.
const STAGE4F_START = "2026-08-03T15:15:00.000Z";
const UUID_RE =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const env = loadStagingEnv();
const host = assertSupabaseStaging(env);
const url = withPoolParams(env.DATABASE_URL, {
  connectionLimit: 1,
  poolTimeout: 30,
});
const prisma = new PrismaClient({ datasources: { db: { url } } });
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
    WHERE "createdAt" >= TIMESTAMPTZ '${STAGE4F_START}'
      AND id ~ '${UUID_RE}'
      AND (
        email ILIKE '%@example.com'
        OR email ILIKE '%@example.invalid'
        OR email ILIKE 'stage4e.probe.%'
        OR email ILIKE 'stage4f.%'
        OR email ILIKE 'vw.stage4e.probe.%'
      )
    ORDER BY "createdAt" DESC
  `);

  const testCompanies = await prisma.$queryRawUnsafe(`
    SELECT id, name, "createdAt"
    FROM "Company"
    WHERE "createdAt" >= TIMESTAMPTZ '${STAGE4F_START}'
      AND id ~ '${UUID_RE}'
    ORDER BY "createdAt" DESC
  `);

  // Also stage4f named companies (cuid owner possible)
  const namedCompanies = await prisma.company.findMany({
    where: {
      OR: [
        { name: { startsWith: "stage4f-tx-" } },
        { name: { startsWith: "stage4e-" } },
      ],
      createdAt: { gte: new Date(STAGE4F_START) },
    },
    select: { id: true, name: true },
  });

  const report = {
    stage: "4F",
    mode,
    at: new Date().toISOString(),
    host,
    stage4f_start: STAGE4F_START,
    baseline: BASELINE,
    before,
    test_users_found: testUsers.length,
    test_companies_found: testCompanies.length,
    named_companies_found: namedCompanies.length,
    sample_emails: testUsers.slice(0, 20).map((u) => u.email),
    sample_companies: testCompanies.slice(0, 10).map((c) => c.name),
  };

  if (mode === "cleanup") {
    const userIds = testUsers.map((u) => u.id);
    const companyIds = [
      ...new Set([
        ...testCompanies.map((c) => c.id),
        ...namedCompanies.map((c) => c.id),
      ]),
    ];

    if (companyIds.length) {
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

    await prisma.stripeWebhookEvent.deleteMany({
      where: { eventId: { startsWith: "stage4f-int-" } },
    });
    await prisma.user.deleteMany({
      where: {
        email: { contains: "stage4f-tx-" },
        createdAt: { gte: new Date(STAGE4F_START) },
      },
    });

    report.deleted = {
      users: userIds.length,
      companies: companyIds.length,
    };
  }

  const after = await counts();
  report.after = after;
  report.baseline_match =
    Number(after.users) === BASELINE.users &&
    Number(after.companies) === BASELINE.companies &&
    Number(after.jobs) === BASELINE.jobs;

  writeJson("scripts/staging/_stage4f-cleanup.json", report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.baseline_match || mode === "inspect" ? 0 : 1);
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await prisma.$disconnect().catch(() => {});
}
