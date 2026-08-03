import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUSINESS_TABLES,
  IMPORT_TABLE_ORDER,
  STAGING_PROJECT_REF,
  assertArtifactPathSafe,
  buildInsertSql,
  compareFreezeSnapshots,
  evaluateStage4HPreflight,
  idSetSha256,
  normalizeRowForJsonl,
  sha256Hex,
  sqlLiteral,
} from "@/lib/migration/production";
import type { FreezeSnapshot } from "@/lib/migration/production/freeze/snapshot";

describe("copy serialize + table coverage", () => {
  it("covers all 21 business tables in import order", () => {
    assert.equal(BUSINESS_TABLES.length, 21);
    assert.equal(IMPORT_TABLE_ORDER.length, 21);
    assert.deepEqual(
      [...IMPORT_TABLE_ORDER].sort(),
      [...BUSINESS_TABLES].sort()
    );
    assert.equal(IMPORT_TABLE_ORDER[0], "User");
    assert.equal(IMPORT_TABLE_ORDER[1], "Company");
  });

  it("preserves nulls and timestamps in JSONL normalization", () => {
    const row = normalizeRowForJsonl({
      id: "1",
      deletedAt: null,
      createdAt: new Date("2026-01-02T03:04:05.678Z"),
      flag: false,
    });
    assert.equal(row.deletedAt, null);
    assert.equal(row.createdAt, "2026-01-02T03:04:05.678Z");
    assert.equal(row.flag, false);
  });

  it("sqlLiteral emits NULL and does not drop values", () => {
    assert.equal(sqlLiteral(null), "NULL");
    assert.equal(sqlLiteral(true), "TRUE");
    assert.match(buildInsertSql("User", ["id", "email"], [{ id: "1", email: null }]), /NULL/);
  });

  it("id set hash is deterministic", () => {
    assert.equal(idSetSha256(["b", "a"]), idSetSha256(["a", "b"]));
    assert.notEqual(idSetSha256(["a"]), idSetSha256(["b"]));
  });
});

describe("artifacts + freeze compare + preflight", () => {
  it("detects artifact path inside repo", () => {
    const repo = process.cwd();
    const inside = assertArtifactPathSafe(repo, repo);
    assert.equal(inside.outsideGit, false);
    const outside = assertArtifactPathSafe(`${repo}-artifacts-outside`, repo);
    assert.equal(outside.outsideGit, true);
  });

  it("freeze compare reports FREEZE_NOT_CONFIRMED on change", () => {
    const base: FreezeSnapshot = {
      at: "t1",
      source: {
        present: true,
        hostFamily: "neon",
        hostMasked: "neon(x.***)",
        port: "5432",
        database: "neondb",
        poolerModeHint: null,
        projectRef: null,
        projectRefMasked: null,
        isStagingRef: false,
        isNeon: true,
        isSupabase: false,
        usernameSuffixRef: null,
      },
      tables: [
        {
          table: "AuditLog",
          row_count: 1,
          max_created_at: "a",
          max_updated_at: null,
          fingerprint: sha256Hex("1"),
        },
      ],
    };
    const changed: FreezeSnapshot = {
      ...base,
      at: "t2",
      tables: [
        {
          ...base.tables[0]!,
          row_count: 2,
          fingerprint: sha256Hex("2"),
        },
      ],
    };
    const result = compareFreezeSnapshots(base, changed, 5000);
    assert.equal(result.verdict, "FREEZE_NOT_CONFIRMED");
    assert.equal(result.WRITES_ENABLED, false);
  });

  it("stage4h preflight blocks when production identity unconfirmed", () => {
    const report = evaluateStage4HPreflight({
      repoRoot: process.cwd(),
      neonEnv: {
        DATABASE_URL:
          "postgresql://u:p@ep-x-pooler.c-3.eu-central-1.aws.neon.tech/neondb",
      },
      supabaseEnv: {},
      confirmProductionProjectRef: null,
      checks: {
        copyDryRunPassed: false,
        buildOk: true,
        typecheckOk: true,
        testsOk: true,
        prismaValidateOk: true,
      },
    });
    assert.equal(report.verdict, "STAGE_4H_PREFLIGHT_BLOCKED");
    assert.ok(report.failed_gates.includes("production_project_ref_confirmed"));
    assert.ok(
      !report.failed_gates.includes("production_ref_not_staging") ||
        STAGING_PROJECT_REF
    );
    assert.equal(report.WRITES_ENABLED, false);
    assert.equal(report.performs_cutover, false);
  });
});
