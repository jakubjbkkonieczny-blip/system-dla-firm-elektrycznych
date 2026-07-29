import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SUPABASE_PUBLISHABLE_KEY_ENV,
  SUPABASE_SERVICE_ROLE_KEY_ENV,
  SUPABASE_URL_ENV,
  getSupabaseAdminEnv,
  getSupabasePublicEnv,
  requireSupabaseAdminEnv,
  requireSupabasePublicEnv,
} from "../env";

describe("Supabase env helpers (Phase 1 unused)", () => {
  it("returns null when public env is incomplete", () => {
    assert.equal(getSupabasePublicEnv({}), null);
    assert.equal(
      getSupabasePublicEnv({ [SUPABASE_URL_ENV]: "https://example.supabase.co" }),
      null
    );
  });

  it("reads public env when both URL and publishable key are set", () => {
    const env = {
      [SUPABASE_URL_ENV]: "https://example.supabase.co",
      [SUPABASE_PUBLISHABLE_KEY_ENV]: "publishable-key",
    };
    assert.deepEqual(getSupabasePublicEnv(env), {
      url: "https://example.supabase.co",
      publishableKey: "publishable-key",
    });
  });

  it("requires service role for admin env", () => {
    const partial = {
      [SUPABASE_URL_ENV]: "https://example.supabase.co",
      [SUPABASE_PUBLISHABLE_KEY_ENV]: "publishable-key",
    };
    assert.equal(getSupabaseAdminEnv(partial), null);

    const full = {
      ...partial,
      [SUPABASE_SERVICE_ROLE_KEY_ENV]: "service-role-key",
    };
    assert.deepEqual(getSupabaseAdminEnv(full), {
      url: "https://example.supabase.co",
      publishableKey: "publishable-key",
      serviceRoleKey: "service-role-key",
    });
  });

  it("require helpers throw when env is missing", () => {
    assert.throws(() => requireSupabasePublicEnv({}), /Missing Supabase public env/);
    assert.throws(() => requireSupabaseAdminEnv({}), /Missing Supabase admin env/);
  });
});
