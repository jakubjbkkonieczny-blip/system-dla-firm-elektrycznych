import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SUPABASE_AUTH_ENABLED_ENV,
  isSupabaseAuthEnabled,
} from "../feature-flags";

describe("Supabase Auth feature flag (Phase 1 unused)", () => {
  it("defaults to disabled when env is missing", () => {
    assert.equal(isSupabaseAuthEnabled({}), false);
  });

  it("is disabled for any value other than exact true", () => {
    assert.equal(
      isSupabaseAuthEnabled({ [SUPABASE_AUTH_ENABLED_ENV]: "1" }),
      false
    );
    assert.equal(
      isSupabaseAuthEnabled({ [SUPABASE_AUTH_ENABLED_ENV]: "TRUE" }),
      false
    );
    assert.equal(
      isSupabaseAuthEnabled({ [SUPABASE_AUTH_ENABLED_ENV]: "false" }),
      false
    );
  });

  it("enables only when SUPABASE_AUTH_ENABLED=true", () => {
    assert.equal(
      isSupabaseAuthEnabled({ [SUPABASE_AUTH_ENABLED_ENV]: "true" }),
      true
    );
    assert.equal(
      isSupabaseAuthEnabled({ [SUPABASE_AUTH_ENABLED_ENV]: " true " }),
      true
    );
  });
});
