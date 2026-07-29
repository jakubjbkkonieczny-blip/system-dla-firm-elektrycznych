/**
 * Adapter selection tests — no silent fallback between modes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSupabaseAuthEnabled } from "../feature-flags";

describe("auth adapter mode selection", () => {
  it("modes are mutually exclusive based on exact flag", () => {
    const legacy = !isSupabaseAuthEnabled({ SUPABASE_AUTH_ENABLED: "false" });
    const supabase = isSupabaseAuthEnabled({ SUPABASE_AUTH_ENABLED: "true" });
    assert.equal(legacy, true);
    assert.equal(supabase, true);
    // Cannot be both for the same env snapshot:
    assert.equal(
      isSupabaseAuthEnabled({ SUPABASE_AUTH_ENABLED: "true" }) &&
        isSupabaseAuthEnabled({ SUPABASE_AUTH_ENABLED: "false" }),
      false
    );
  });

  it("invalid flag values fail closed to legacy (predictable)", () => {
    assert.equal(isSupabaseAuthEnabled({ SUPABASE_AUTH_ENABLED: "yes" }), false);
    assert.equal(isSupabaseAuthEnabled({ SUPABASE_AUTH_ENABLED: "on" }), false);
    assert.equal(isSupabaseAuthEnabled({ SUPABASE_AUTH_ENABLED: "" }), false);
  });
});
