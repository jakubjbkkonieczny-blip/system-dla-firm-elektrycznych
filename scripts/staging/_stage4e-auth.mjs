/**
 * Stage 4E — auth linking state + controlled synthetic Auth resolution check.
 * Does NOT bulk-link users. Does NOT invent Auth identities for migrated rows.
 * Creates at most one disposable Auth+User pair via documented provisioning path,
 * then deletes both.
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
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

// Staging runtime: .env then .env.local override (Next.js style)
const base = loadEnvFile(path.join(root, ".env"));
const local = loadEnvFile(path.join(root, ".env.local"));
const env = { ...base, ...local };
for (const [k, v] of Object.entries(env)) process.env[k] = v;

const report = {
  stage: "4E",
  mode: "auth-validation",
  created_at: new Date().toISOString(),
  architecture: "auth.users.id → User.supabaseAuthUserId → User.id",
  created: [],
  deleted: [],
};

const dbHost = new URL(env.DATABASE_URL).hostname;
report.runtime = {
  db_host: dbHost,
  is_neon: /\.neon\.tech$/i.test(dbHost),
  is_supabase: /supabase/i.test(dbHost),
  auth_enabled: env.SUPABASE_AUTH_ENABLED === "true",
  auth_url_host: (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/^https?:\/\//, ""),
};

if (report.runtime.is_neon || !report.runtime.is_supabase) {
  console.error("BLOCKED: DB runtime not Supabase staging");
  process.exit(2);
}

const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const publishable = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !service || !publishable) {
  report.blocker = "Missing Supabase Auth env (URL/publishable/service_role)";
  fs.writeFileSync(
    path.join(root, "scripts/staging/_stage4e-auth.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify({ wrote: true, blocker: report.blocker }, null, 2));
  process.exit(1);
}

const admin = createClient(supabaseUrl, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

try {
  const counts = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT COUNT(*)::int FROM "User") AS users,
      (SELECT COUNT(*)::int FROM "User" WHERE "supabaseAuthUserId" IS NOT NULL) AS linked,
      (SELECT COUNT(*)::int FROM auth.users) AS auth_users
  `);
  report.counts = counts[0];

  const authUsers = await prisma.$queryRawUnsafe(`
    SELECT id::text AS id, email, created_at
    FROM auth.users
    ORDER BY created_at ASC
    LIMIT 5
  `);
  report.existing_auth_users = authUsers.map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
  }));

  // Can existing auth users resolve to a VectorWork User?
  const linkChecks = [];
  for (const au of authUsers) {
    const linked = await prisma.user.findUnique({
      where: { supabaseAuthUserId: au.id },
      select: { id: true, email: true, isActive: true },
    });
    const byEmail = au.email
      ? await prisma.user.findUnique({
          where: { email: String(au.email).trim().toLowerCase() },
          select: {
            id: true,
            email: true,
            supabaseAuthUserId: true,
            isActive: true,
          },
        })
      : null;
    linkChecks.push({
      authUserId: au.id,
      authEmail: au.email,
      linked_via_supabaseAuthUserId: linked
        ? { userId: linked.id, isActive: linked.isActive }
        : null,
      business_user_same_email: byEmail
        ? {
            userId: byEmail.id,
            supabaseAuthUserId: byEmail.supabaseAuthUserId,
            isActive: byEmail.isActive,
          }
        : null,
      session_resolve_would_succeed: Boolean(linked && linked.isActive),
    });
  }
  report.existing_auth_link_checks = linkChecks;
  report.existing_migrated_users_login_possible =
    report.counts.linked > 0
      ? "only for linked rows"
      : "NO — 0/3605 User.supabaseAuthUserId populated; resolveLinkedUser fails closed (AUTH_USER_UNLINKED)";

  report.expected_at_this_stage = {
    null_links: true,
    reason:
      "Stage 4C copied business data only; Auth identity import/linking is a separate prerequisite. Repository has linkUserToSupabaseAuthUser / ensureLinkedUser helpers but no bulk import runner for production users.",
  };

  // Controlled synthetic path: admin.createUser + provisionUserAfterSignup equivalent
  // Only if VECTORWORK_STAGING_AUTH_INTEGRATION=true
  if (env.VECTORWORK_STAGING_AUTH_INTEGRATION !== "true") {
    report.synthetic_auth_test = {
      skipped: true,
      reason: "VECTORWORK_STAGING_AUTH_INTEGRATION not true",
    };
  } else {
    const stamp = Date.now().toString(36);
    const email = `vw.stage4e.probe.${stamp}@mailinator.com`;
    const password = `Vw!${randomBytes(9).toString("base64url")}9aA1`;

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { displayName: "Stage4E Probe" },
    });
    if (created.error || !created.data.user) {
      report.synthetic_auth_test = {
        ok: false,
        error: created.error?.message || "createUser failed",
      };
    } else {
      const authUserId = created.data.user.id;
      report.created.push({ kind: "auth.users", id: authUserId, email });

      // Mirror Case 1 provisioning (new registration) — create VectorWork User linked
      const user = await prisma.user.create({
        data: {
          email,
          displayName: "Stage4E Probe",
          supabaseAuthUserId: authUserId,
          passwordHash: null,
          accountRole: "worker",
        },
        select: { id: true, email: true, supabaseAuthUserId: true, isActive: true },
      });
      report.created.push({ kind: "User", id: user.id, email });

      // Resolve path: auth.users.id → User.supabaseAuthUserId → User.id
      const resolved = await prisma.user.findUnique({
        where: { supabaseAuthUserId: authUserId },
        select: { id: true, email: true, isActive: true, supabaseAuthUserId: true },
      });

      // Also verify signIn obtains a session (Auth side)
      const anon = createClient(supabaseUrl, publishable, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const signed = await anon.auth.signInWithPassword({ email, password });
      const sessionOk = Boolean(signed.data.session?.access_token && !signed.error);
      const sessionAuthId = signed.data.user?.id || null;

      report.synthetic_auth_test = {
        ok:
          Boolean(resolved) &&
          resolved.id === user.id &&
          resolved.supabaseAuthUserId === authUserId &&
          sessionOk &&
          sessionAuthId === authUserId,
        mapping: {
          auth_users_id: authUserId,
          User_supabaseAuthUserId: resolved?.supabaseAuthUserId || null,
          User_id: resolved?.id || null,
        },
        password_signin_session: sessionOk,
        note: "Synthetic new user only — does not prove migrated-user login.",
      };

      // Cleanup: delete business user then auth user
      await prisma.user.delete({ where: { id: user.id } });
      report.deleted.push({ kind: "User", id: user.id });
      const delAuth = await admin.auth.admin.deleteUser(authUserId);
      report.deleted.push({
        kind: "auth.users",
        id: authUserId,
        ok: !delAuth.error,
        error: delAuth.error?.message,
      });

      // Confirm gone
      const stillUser = await prisma.user.findUnique({ where: { id: user.id } });
      report.cleanup_ok = stillUser === null;
    }
  }

  // Authorization regression sample (read-only): memberships/roles remain keyed by User.id
  const sampleMember = await prisma.companyMember.findFirst({
    select: {
      id: true,
      userId: true,
      companyId: true,
      role: true,
    },
  });
  report.authorization_sample = {
    companyMember_uses_userId: Boolean(sampleMember?.userId),
    sample: sampleMember
      ? {
          role: sampleMember.role,
          userId_prefix: sampleMember.userId.slice(0, 8),
          companyId_prefix: sampleMember.companyId.slice(0, 8),
        }
      : null,
  };

  const inactive = await prisma.user.count({ where: { isActive: false } });
  report.inactive_users = inactive;
} catch (e) {
  report.error = e.code || e.message;
  report.meta = e.meta || undefined;
} finally {
  await prisma.$disconnect();
}

const outPath = path.join(root, "scripts/staging/_stage4e-auth.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      wrote: outPath,
      linked: report.counts?.linked,
      auth_users: report.counts?.auth_users,
      existing_resolve: report.existing_auth_link_checks?.map(
        (c) => c.session_resolve_would_succeed
      ),
      synthetic_ok: report.synthetic_auth_test?.ok,
      cleanup_ok: report.cleanup_ok,
      error: report.error,
    },
    null,
    2
  )
);

const fail =
  Boolean(report.error) ||
  (report.synthetic_auth_test &&
    report.synthetic_auth_test.skipped !== true &&
    report.synthetic_auth_test.ok !== true);
process.exit(fail ? 1 : 0);
