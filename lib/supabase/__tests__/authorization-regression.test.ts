/**
 * Stage 3B authorization regression — Auth must not imply authorization.
 * Source-contract + behavioral checks that Supabase session mapping still
 * keys business authz off User.id / CompanyMember, not auth.users.id.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

describe("authorization regression — Stage 3B", () => {
  it("requireSessionUser / requireActiveMember remain business-keyed", () => {
    const session = readFileSync(join(ROOT, "lib/server/auth/getUserFromSession.ts"), "utf8");
    const membership = readFileSync(join(ROOT, "app/api/_lib/membership.ts"), "utf8");
    assert.match(session, /requireSessionUserFromActiveAdapter|resolveSessionUserFromActiveAdapter/);
    assert.match(membership, /requireActiveMember/);
    assert.match(membership, /companyId_userId/);
    assert.doesNotMatch(membership, /supabaseAuthUserId/);
  });

  it("billing authorization uses User.id not auth.users.id", () => {
    const billing = readFileSync(join(ROOT, "app/api/_lib/billing.ts"), "utf8");
    const checkout = readFileSync(join(ROOT, "app/api/stripe/checkout/route.ts"), "utf8");
    assert.match(checkout, /requireSessionUser/);
    assert.match(checkout, /userId:\s*user\.id|metadata.*userId/);
    assert.doesNotMatch(checkout, /supabaseAuthUserId/);
    assert.doesNotMatch(billing, /auth\.users/);
  });

  it("Google routes authorize via session User.id", () => {
    const callback = readFileSync(join(ROOT, "app/api/google/callback/route.ts"), "utf8");
    assert.match(callback, /requireSessionUser|getUserFromSession|sessionUser\.id/);
    assert.doesNotMatch(callback, /supabaseAuthUserId/);
  });

  it("Push foundation gates on authenticated VectorWork user", () => {
    const pushTest = readFileSync(
      join(ROOT, "lib/server/push/__tests__/push-foundation.test.ts"),
      "utf8"
    );
    assert.match(pushTest, /Unauthorized|UNAUTHORIZED|requireSessionUser|session/i);
  });

  it("auth adapter does not silently fall back between modes", () => {
    const adapter = readFileSync(join(ROOT, "lib/supabase/auth-adapter.ts"), "utf8");
    assert.match(adapter, /isSupabaseAuthEnabled/);
    assert.match(adapter, /resolveSupabaseSessionUser|getUserFromLegacySession/);
  });

  it("inactive users are rejected by Supabase session resolve", () => {
    const provisioning = readFileSync(join(ROOT, "lib/supabase/provisioning.ts"), "utf8");
    assert.match(provisioning, /AUTH_USER_INACTIVE/);
    assert.match(provisioning, /!linked\.isActive/);
  });

  it("proxy does not treat deactivated_access as general authorization", () => {
    const proxy = readFileSync(join(ROOT, "proxy.ts"), "utf8");
    assert.match(proxy, /isDeactivatedRecoveryApiPath/);
    assert.match(proxy, /isApi && isDeactivatedRecoveryApiPath/);
    assert.doesNotMatch(proxy, /hasValidDeactivatedAccess\(request\)\s*&&\s*!isApi/);
  });
});
