import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PHASE_0_DEPENDENCIES,
  SUPABASE_PASSWORD_MIGRATION_STRATEGY,
  assertAllPhase0DependenciesResolved,
  getPhase0Dependency,
} from "../phase0-dependencies";

describe("Phase 0 Supabase dependency verification", () => {
  it("records bcrypt import as CONFIRMED with reset fallback strategy", () => {
    const bcryptImport = getPhase0Dependency("bcrypt-hash-import");
    assert.ok(bcryptImport);
    assert.equal(bcryptImport.status, "CONFIRMED");
    assert.equal(
      SUPABASE_PASSWORD_MIGRATION_STRATEGY,
      "bcrypt_import_with_reset_fallback"
    );
  });

  it("confirms every required external dependency", () => {
    assert.equal(PHASE_0_DEPENDENCIES.length, 8);
    for (const dependency of PHASE_0_DEPENDENCIES) {
      assert.equal(
        dependency.status,
        "CONFIRMED",
        `${dependency.id} must be CONFIRMED before cutover`
      );
      assert.ok(dependency.officialSources.length > 0);
    }
    assert.doesNotThrow(() => assertAllPhase0DependenciesResolved());
  });
});
