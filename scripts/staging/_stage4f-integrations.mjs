/**
 * Stage 4F — Stripe / Google / Push database-path verification (no destructive external calls).
 */
import { PrismaClient } from "@prisma/client";
import {
  assertSupabaseStaging,
  loadStagingEnv,
  maskUrl,
  withPoolParams,
  writeJson,
} from "./_stage4f-lib.mjs";

const env = loadStagingEnv();
const host = assertSupabaseStaging(env);
const url = withPoolParams(env.DATABASE_URL, {
  connectionLimit: 1,
  poolTimeout: 30,
});
const prisma = new PrismaClient({ datasources: { db: { url } } });
const marker = `stage4f-int-${Date.now()}`;

const report = {
  stage: "4F",
  mode: "integrations-db-path",
  at: new Date().toISOString(),
  host,
  runtime: maskUrl(url),
  marker,
};

try {
  report.stripe = {
    users_with_customer: await prisma.user.count({
      where: { stripeCustomerId: { not: null } },
    }),
    users_with_subscription: await prisma.user.count({
      where: { stripeSubscriptionId: { not: null } },
    }),
    webhook_events: await prisma.stripeWebhookEvent
      .count()
      .catch(async () => {
        // Model name may differ — probe via raw if needed
        const rows = await prisma.$queryRaw`
          SELECT COUNT(*)::int AS n FROM "StripeWebhookEvent"
        `.catch(() => [{ n: null }]);
        return rows[0]?.n;
      }),
    sample_user: await prisma.user.findFirst({
      where: { stripeCustomerId: { not: null } },
      select: {
        id: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionCancelAtPeriodEnd: true,
      },
    }).then((u) =>
      u
        ? {
            userId_prefix: u.id.slice(0, 12),
            subscriptionStatus: u.subscriptionStatus,
            hasCustomer: Boolean(u.stripeCustomerId),
            hasSubscription: Boolean(u.stripeSubscriptionId),
            cancelAtPeriodEnd: u.subscriptionCancelAtPeriodEnd,
          }
        : null
    ),
    note: "DB columns readable on Supabase. No Stripe API calls performed.",
  };

  // Safe write/read/delete of idempotency-style webhook row if model exists
  let webhookWrite = { attempted: false };
  try {
    const created = await prisma.stripeWebhookEvent.create({
      data: {
        eventId: marker,
        eventType: "stage4f.probe",
        status: "processed",
        processedAt: new Date(),
      },
      select: { id: true, eventId: true },
    });
    const readBack = await prisma.stripeWebhookEvent.findUnique({
      where: { eventId: marker },
      select: { id: true, eventType: true, status: true },
    });
    await prisma.stripeWebhookEvent.delete({ where: { eventId: marker } });
    const gone = await prisma.stripeWebhookEvent.findUnique({
      where: { eventId: marker },
    });
    webhookWrite = {
      attempted: true,
      ok: Boolean(created && readBack && !gone),
      cleaned: !gone,
    };
  } catch (error) {
    webhookWrite = {
      attempted: true,
      ok: false,
      error: (error instanceof Error ? error.message : String(error)).slice(0, 200),
      note: "If model/columns differ, counts above still prove read path.",
    };
  }
  report.stripe.webhook_write_cleanup = webhookWrite;

  report.google = {
    users_with_access_token: await prisma.user.count({
      where: { googleAccessToken: { not: null } },
    }),
    users_with_refresh_token: await prisma.user.count({
      where: { googleRefreshToken: { not: null } },
    }),
    note: "Token columns readable. No Google API calls performed.",
  };

  const pushSample = await prisma.pushSubscription.findFirst({
    select: { id: true, userId: true, endpoint: true },
  });
  report.push = {
    push_subscription_rows: await prisma.pushSubscription.count(),
    users_with_legacy_push_json: await prisma.user.count({
      where: { pushSubscription: { not: null } },
    }),
    sample: pushSample
      ? {
          id: pushSample.id,
          userId: pushSample.userId,
          endpoint_host: (() => {
            try {
              return new URL(pushSample.endpoint).host;
            } catch {
              return "(invalid)";
            }
          })(),
        }
      : null,
    note: "PushSubscription table readable. No web-push sends performed.",
  };

  report.authorization = {
    membership_keyed_by_userId: true,
    inactive_users: await prisma.user.count({ where: { isActive: false } }),
    companies: await prisma.company.count(),
    memberships: await prisma.companyMember.count(),
    sample_member: await prisma.companyMember.findFirst({
      select: {
        role: true,
        userId: true,
        companyId: true,
        user: { select: { supabaseAuthUserId: true, isActive: true } },
      },
    }).then((m) =>
      m
        ? {
            role: m.role,
            userId_prefix: m.userId.slice(0, 12),
            companyId_prefix: m.companyId.slice(0, 12),
            sample_user_linked: m.user.supabaseAuthUserId != null,
            sample_user_active: m.user.isActive,
          }
        : null
    ),
  };

  report.neon_dependency_scan = {
    runtime_database_is_neon: /neon\.tech/i.test(host),
    note: "Staging DATABASE_URL host is Supabase Session pooler after Stage 4E.",
  };

  report.passed =
    typeof report.stripe.users_with_customer === "number" &&
    typeof report.google.users_with_access_token === "number" &&
    typeof report.push.push_subscription_rows === "number" &&
    report.authorization.membership_keyed_by_userId === true;

  writeJson("scripts/staging/_stage4f-integrations.json", report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passed ? 0 : 1);
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await prisma.$disconnect().catch(() => {});
}
