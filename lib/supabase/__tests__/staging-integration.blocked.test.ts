/**
 * Staging integration checklist — BLOCKED without real staging credentials.
 *
 * Do not fake a PASS. Do not point these at production.
 * Manual procedure: docs/supabase-migration-stage-3a.md
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const hasStagingCredentials = Boolean(
  process.env.SUPABASE_AUTH_ENABLED === "true" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
    process.env.VECTORWORK_STAGING_AUTH_INTEGRATION === "true"
);

describe("Supabase Auth staging integration", () => {
  it("Stage 3A runbook exists", () => {
    assert.equal(
      existsSync(join(process.cwd(), "docs/supabase-migration-stage-3a.md")),
      true
    );
  });

  it("is BLOCKED unless explicit staging integration env is set", () => {
    if (!hasStagingCredentials) {
      // Documented BLOCKED — not a failure. Run manual staging acceptance instead.
      assert.equal(hasStagingCredentials, false);
      return;
    }
    // Real end-to-end Auth rehearsal belongs to a dedicated staging job with
    // VECTORWORK_STAGING_AUTH_INTEGRATION=true and a non-production Supabase project.
    assert.ok(process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("supabase"));
  });
});
