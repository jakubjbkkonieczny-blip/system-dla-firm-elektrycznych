import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessProductionTarget,
  assertNeonSource,
  assertProductionWriteTarget,
  parseConfirmProductionProjectRef,
  ProductionTargetGuardError,
  STAGING_PROJECT_REF,
} from "@/lib/migration/production";

const STAGING_DB =
  `postgresql://postgres.${STAGING_PROJECT_REF}:secret@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`;
const PROD_REF = "abcdefghij1234567890";
const PROD_DB =
  `postgresql://postgres.${PROD_REF}:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`;
const PROD_API = `https://${PROD_REF}.supabase.co`;
const NEON_DB =
  "postgresql://user:secret@ep-example-pooler.c-3.eu-central-1.aws.neon.tech:5432/neondb";

describe("production target guard", () => {
  it("refuses staging project ref for writes", () => {
    const assessment = assessProductionTarget({
      confirmProductionProjectRef: STAGING_PROJECT_REF,
      databaseUrl: STAGING_DB,
      nextPublicSupabaseUrl: `https://${STAGING_PROJECT_REF}.supabase.co`,
      requireWriteConfirmation: true,
    });
    assert.equal(assessment.status, "PRODUCTION_TARGET_REFUSED");
    assert.equal(assessment.writesAllowed, false);
  });

  it("refuses writes without explicit confirmation", () => {
    const assessment = assessProductionTarget({
      databaseUrl: PROD_DB,
      nextPublicSupabaseUrl: PROD_API,
      requireWriteConfirmation: true,
    });
    assert.equal(assessment.writesAllowed, false);
    assert.ok(
      assessment.reasons.some((r) =>
        r.includes("--confirm-production-project-ref")
      )
    );
  });

  it("refuses Neon as production Supabase target", () => {
    const assessment = assessProductionTarget({
      confirmProductionProjectRef: PROD_REF,
      databaseUrl: NEON_DB,
      requireWriteConfirmation: true,
    });
    assert.equal(assessment.status, "PRODUCTION_TARGET_REFUSED");
  });

  it("refuses disagreeing refs", () => {
    assert.throws(
      () =>
        assertProductionWriteTarget({
          confirmProductionProjectRef: PROD_REF,
          databaseUrl: STAGING_DB,
          nextPublicSupabaseUrl: `https://${STAGING_PROJECT_REF}.supabase.co`,
        }),
      (err: unknown) => err instanceof ProductionTargetGuardError
    );
  });

  it("allows confirmed matching production target", () => {
    const { projectRef, assessment } = assertProductionWriteTarget({
      confirmProductionProjectRef: PROD_REF,
      databaseUrl: PROD_DB,
      nextPublicSupabaseUrl: PROD_API,
    });
    assert.equal(projectRef, PROD_REF);
    assert.equal(assessment.status, "PRODUCTION_TARGET_OK");
    assert.equal(assessment.writesAllowed, true);
  });

  it("assertNeonSource accepts Neon and rejects Supabase", () => {
    const neon = assertNeonSource(NEON_DB);
    assert.equal(neon.isNeon, true);
    assert.throws(() => assertNeonSource(PROD_DB), ProductionTargetGuardError);
  });

  it("parseConfirmProductionProjectRef reads CLI flag", () => {
    assert.equal(
      parseConfirmProductionProjectRef([
        "--confirm-production-project-ref",
        PROD_REF,
      ]),
      PROD_REF
    );
    assert.equal(parseConfirmProductionProjectRef(["--dry-run"]), null);
  });
});
