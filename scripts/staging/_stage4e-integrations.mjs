/**
 * Stage 4E — read-only integration DB-path checks (Stripe/Google/Push).
 * No external API calls, no credential rotation, no charges.
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const env = {
  ...loadEnvFile(path.join(root, ".env")),
  ...loadEnvFile(path.join(root, ".env.local")),
};
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.DIRECT_URL = env.DIRECT_URL || env.DATABASE_URL;

const host = new URL(env.DATABASE_URL).hostname;
if (/neon\.tech/i.test(host)) {
  console.error("BLOCKED: still Neon");
  process.exit(2);
}

const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
});

const report = {
  stage: "4E",
  mode: "integrations-db-path",
  created_at: new Date().toISOString(),
  host,
};

try {
  report.stripe = {
    users_with_customer: await prisma.user.count({
      where: { stripeCustomerId: { not: null } },
    }),
    users_with_subscription: await prisma.user.count({
      where: { stripeSubscriptionId: { not: null } },
    }),
    webhook_events: await prisma.stripeWebhookEvent.count(),
    sample_webhook: await prisma.stripeWebhookEvent.findFirst({
      select: { id: true, eventType: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    note: "DB columns readable on Supabase. No Stripe API calls performed.",
  };

  report.google = {
    users_with_access_token: await prisma.user.count({
      where: { googleAccessToken: { not: null } },
    }),
    users_with_refresh_token: await prisma.user.count({
      where: { googleRefreshToken: { not: null } },
    }),
    note: "Token columns readable. No Google API calls performed.",
  };

  report.push = {
    push_subscription_rows: await prisma.pushSubscription.count(),
    users_with_legacy_push_json: await prisma.user.count({
      where: { pushSubscription: { not: null } },
    }),
    sample: await prisma.pushSubscription.findFirst({
      select: { id: true, userId: true, endpoint: true },
    }),
    note: "PushSubscription table readable. No web-push sends performed.",
  };

  // Authorization invariants still keyed by User.id
  const member = await prisma.companyMember.findFirst({
    include: {
      user: { select: { id: true, supabaseAuthUserId: true, isActive: true } },
      company: { select: { id: true, name: true } },
    },
  });
  report.authorization = {
    membership_keyed_by_userId: Boolean(member?.userId),
    sample_role: member?.role ?? null,
    sample_user_linked: member?.user?.supabaseAuthUserId != null,
    inactive_users: await prisma.user.count({ where: { isActive: false } }),
    companies: await prisma.company.count(),
    memberships: await prisma.companyMember.count(),
  };
} catch (e) {
  report.error = e.code || e.message;
} finally {
  await prisma.$disconnect();
}

const outPath = path.join(root, "scripts/staging/_stage4e-integrations.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      wrote: outPath,
      stripe_webhooks: report.stripe?.webhook_events,
      google_tokens: report.google?.users_with_refresh_token,
      push_rows: report.push?.push_subscription_rows,
      error: report.error,
    },
    null,
    2
  )
);
process.exit(report.error ? 1 : 0);
