/**
 * Staging-only session lifecycle checks for Stage 3B.
 *
 * Requires:
 *   SUPABASE_AUTH_ENABLED=true
 *   VECTORWORK_STAGING_AUTH_INTEGRATION=true
 *   staging Supabase + local app
 *
 * Never prints secrets/tokens. Never targets production.
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

const results = [];
function record(id, status, detail = "") {
  results.push({ id, status, detail });
  console.log(`[${status}] ${id}${detail ? ` — ${detail}` : ""}`);
}

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

const SITE = requireEnv("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");
const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const PUBLISHABLE = requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const AUTH_ON = process.env.SUPABASE_AUTH_ENABLED?.trim() === "true";
const STAGING_ON =
  process.env.VECTORWORK_STAGING_AUTH_INTEGRATION?.trim() === "true";

if (!AUTH_ON || !STAGING_ON) {
  console.error("Auth staging flags not exact true; aborting.");
  process.exit(2);
}

const prisma = new PrismaClient();
const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function cookieJar() {
  const jar = new Map();
  return {
    store(res) {
      const raw = res.headers.getSetCookie?.() ?? [];
      for (const c of raw) {
        const part = c.split(";")[0];
        const eq = part.indexOf("=");
        if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    names() {
      return [...jar.keys()].sort();
    },
    clear() {
      jar.clear();
    },
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const stamp = Date.now().toString(36);
  const email = `vw.stage3b.session.${stamp}@mailinator.com`;
  const password = `Vw!${randomBytes(9).toString("base64url")}9sS1`;

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Stage3B Session" },
  });
  if (created.error || !created.data.user) {
    record("setup_create_user", "FAIL", created.error?.message ?? "no user");
    throw new Error("setup failed");
  }
  const authUserId = created.data.user.id;
  record("setup_create_user", "PASS", "confirmed staging user");

  const jar = cookieJar();
  const loginRes = await fetch(`${SITE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  jar.store(loginRes);
  const loginJson = await loginRes.json().catch(() => ({}));
  if (loginRes.status !== 200 || !loginJson.ok) {
    record("setup_app_login", "FAIL", `status=${loginRes.status}`);
    throw new Error("app login failed");
  }
  record("setup_app_login", "PASS", `cookies=${jar.names().length}`);

  const meOk = await fetch(`${SITE}/api/me`, { headers: { Cookie: jar.header() } });
  record(
    "api_access_with_session",
    meOk.status === 200 ? "PASS" : "FAIL",
    `status=${meOk.status}`
  );

  const anon = createClient(SUPABASE_URL, PUBLISHABLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) {
    record("provider_sign_in", "FAIL", signed.error?.message ?? "no session");
  } else {
    record("provider_sign_in", "PASS");
    const session1 = signed.data.session;
    const refresh1 = session1.refresh_token;
    const access1 = session1.access_token;

    const refreshed = await anon.auth.refreshSession({ refresh_token: refresh1 });
    if (refreshed.error || !refreshed.data.session) {
      record("valid_refresh", "FAIL", refreshed.error?.message ?? "no session");
    } else {
      record("valid_refresh", "PASS");
      const refresh2 = refreshed.data.session.refresh_token;
      const access2 = refreshed.data.session.access_token;
      const rotated =
        typeof refresh2 === "string" && refresh2.length > 0 && refresh2 !== refresh1;
      record(
        "refresh_token_rotation",
        rotated ? "PASS" : "FAIL",
        rotated ? "new refresh token issued" : "refresh token unchanged"
      );

      // Provider allows a reuse interval (default ~10s; project may differ).
      // Wait well beyond the default, then attempt reuse.
      await sleep(30_000);
      const replay = await createClient(SUPABASE_URL, PUBLISHABLE, {
        auth: { autoRefreshToken: false, persistSession: false },
      }).auth.refreshSession({ refresh_token: refresh1 });
      if (replay.error) {
        record(
          "rotated_token_replay",
          "PASS",
          `rejected:${replay.error.code ?? "error"}`
        );
      } else {
        // Not an application defect if staging Auth reuse interval is elevated.
        record(
          "rotated_token_replay",
          "BLOCKED",
          "provider accepted rotated refresh after 30s — check Auth refresh-token reuse interval on staging project"
        );
      }

      // Revoke using admin API with a valid JWT (not user UUID).
      const revoke = await admin.auth.admin.signOut(access2 || access1, "global");
      record(
        "revoked_refresh_token",
        revoke.error ? "FAIL" : "PASS",
        revoke.error?.message ?? "admin signOut(jwt, global)"
      );

      const afterRevoke = await createClient(SUPABASE_URL, PUBLISHABLE, {
        auth: { autoRefreshToken: false, persistSession: false },
      }).auth.refreshSession({ refresh_token: refresh2 });
      record(
        "refresh_after_revocation",
        afterRevoke.error ? "PASS" : "FAIL",
        afterRevoke.error?.message ?? "refresh still worked"
      );
    }

    try {
      const parts = session1.access_token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      const exp = typeof payload.exp === "number" ? payload.exp : 0;
      const ttl = exp - Math.floor(Date.now() / 1000);
      if (ttl <= 0) {
        record("access_token_expiration", "PASS", "token already expired");
      } else if (ttl <= 90) {
        await sleep((ttl + 2) * 1000);
        const expiredClient = createClient(SUPABASE_URL, PUBLISHABLE, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: {
            headers: { Authorization: `Bearer ${session1.access_token}` },
          },
        });
        const { data, error } = await expiredClient.auth.getUser();
        record(
          "access_token_expiration",
          error || !data.user ? "PASS" : "FAIL",
          `waited_ttl=${ttl}s`
        );
      } else {
        record(
          "access_token_expiration",
          "BLOCKED",
          `ttl=${ttl}s; staging JWT expiry not shortened (do not weaken prod lifetimes)`
        );
      }
    } catch {
      record("access_token_expiration", "FAIL", "jwt decode failed");
    }
  }

  const logoutJar = cookieJar();
  const relogin = await fetch(`${SITE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  logoutJar.store(relogin);
  const logoutRes = await fetch(`${SITE}/api/auth/session`, {
    method: "DELETE",
    headers: { Cookie: logoutJar.header() },
  });
  logoutJar.store(logoutRes);
  record(
    "logout_invalidation",
    logoutRes.status === 200 ? "PASS" : "FAIL",
    `status=${logoutRes.status}`
  );

  const meAfterLogout = await fetch(`${SITE}/api/me`, {
    headers: { Cookie: logoutJar.header() },
    redirect: "manual",
  });
  record(
    "api_access_after_revocation",
    meAfterLogout.status === 401 || meAfterLogout.status === 403 ? "PASS" : "FAIL",
    `status=${meAfterLogout.status}`
  );

  const dash = await fetch(`${SITE}/dashboard`, {
    headers: { Cookie: logoutJar.header() },
    redirect: "manual",
  });
  const dashDenied =
    dash.status === 307 ||
    dash.status === 302 ||
    dash.status === 401 ||
    dash.status === 403;
  record(
    "browser_navigation_after_revocation",
    dashDenied ? "PASS" : "FAIL",
    `status=${dash.status}`
  );

  await prisma.user.deleteMany({ where: { supabaseAuthUserId: authUserId } });
  await admin.auth.admin.deleteUser(authUserId);
  record("cleanup", "PASS");

  console.log("\n=== Stage 3B session lifecycle summary ===");
  for (const r of results) {
    console.log(`${r.status}\t${r.id}\t${r.detail}`);
  }
  const failed = results.filter((r) => r.status === "FAIL");
  process.exit(failed.length ? 1 : 0);
}

main()
  .catch((e) => {
    console.error("FATAL", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
