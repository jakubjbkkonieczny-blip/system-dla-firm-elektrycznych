import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { isSupabaseAuthEnabled } from "../feature-flags";
import { getSupabasePublicEnv, getSupabaseAdminEnv } from "../env";

const ROOT = join(process.cwd());

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("auth flag behavior", () => {
  it("false selects legacy (default)", () => {
    assert.equal(isSupabaseAuthEnabled({}), false);
    assert.equal(isSupabaseAuthEnabled({ SUPABASE_AUTH_ENABLED: "false" }), false);
    assert.equal(isSupabaseAuthEnabled({ SUPABASE_AUTH_ENABLED: "TRUE" }), false);
    assert.equal(isSupabaseAuthEnabled({ SUPABASE_AUTH_ENABLED: "1" }), false);
  });

  it("true selects supabase mode only when exact", () => {
    assert.equal(isSupabaseAuthEnabled({ SUPABASE_AUTH_ENABLED: "true" }), true);
    assert.equal(isSupabaseAuthEnabled({ SUPABASE_AUTH_ENABLED: " true " }), true);
  });
});

describe("env isolation", () => {
  it("legacy mode works without Supabase variables", () => {
    assert.equal(getSupabasePublicEnv({}), null);
    assert.equal(getSupabaseAdminEnv({}), null);
    assert.equal(isSupabaseAuthEnabled({}), false);
  });

  it("admin env requires service role and is separate from public", () => {
    const publicOnly = {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub",
    };
    assert.ok(getSupabasePublicEnv(publicOnly));
    assert.equal(getSupabaseAdminEnv(publicOnly), null);

    const withAdmin = {
      ...publicOnly,
      SUPABASE_SERVICE_ROLE_KEY: "secret",
    };
    const admin = getSupabaseAdminEnv(withAdmin);
    assert.ok(admin);
    assert.equal(admin.serviceRoleKey, "secret");
  });
});

describe("source contracts — Stage 2A", () => {
  it("admin-client is server-only", () => {
    const src = readFileSync(join(ROOT, "lib/supabase/admin-client.ts"), "utf8");
    assert.match(src, /import ["']server-only["']/);
    assert.doesNotMatch(src, /NEXT_PUBLIC_SUPABASE_SERVICE/);
  });

  it("browser client never references service role", () => {
    const src = readFileSync(join(ROOT, "lib/supabase/browser-client.ts"), "utf8");
    assert.doesNotMatch(src, /SERVICE_ROLE|serviceRole|service_role/);
    assert.doesNotMatch(src, /createClient\(/);
  });

  it("index barrel does not re-export admin or browser clients", () => {
    const src = readFileSync(join(ROOT, "lib/supabase/index.ts"), "utf8");
    assert.doesNotMatch(src, /admin-client|browser-client|server-client/);
  });

  it("supabase auth-actions do not import bcrypt or mint legacy sessions", () => {
    const src = readFileSync(join(ROOT, "lib/supabase/auth-actions.ts"), "utf8");
    assert.doesNotMatch(src, /from ["']bcrypt["']/);
    assert.doesNotMatch(src, /createSignedSessionToken|setSessionCookie/);
    assert.doesNotMatch(src, /passwordHash\s*:/);
  });

  it("provisioning sets passwordHash null and does not create memberships", () => {
    const src = readFileSync(join(ROOT, "lib/supabase/provisioning.ts"), "utf8");
    assert.match(src, /passwordHash:\s*null/);
    assert.doesNotMatch(src, /bcrypt/);
    assert.doesNotMatch(src, /companyMember\.create|prisma\.companyMember/i);
  });

  it("no production code changes DATABASE_URL or DIRECT_URL assignment", () => {
    const files = [
      ...walkTsFiles(join(ROOT, "lib")),
      ...walkTsFiles(join(ROOT, "app")),
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(
        src,
        /process\.env\.(DATABASE_URL|DIRECT_URL)\s*=/,
        `must not assign DB URLs in ${file}`
      );
    }
  });

  it("no @supabase/auth-helpers-nextjs dependency", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.equal(all["@supabase/auth-helpers-nextjs"], undefined);
    assert.ok(all["@supabase/ssr"]);
  });

  it("client components under app/ do not import admin-client", () => {
    const files = walkTsFiles(join(ROOT, "app")).filter((f) => f.endsWith(".tsx"));
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(
        src,
        /admin-client|createSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY/,
        file
      );
    }
  });
});
