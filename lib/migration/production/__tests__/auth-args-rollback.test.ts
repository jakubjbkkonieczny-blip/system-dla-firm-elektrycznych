import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MigrationCliError } from "@/lib/supabase/auth-migration";
import {
  buildExceptionList,
  dispositionFor,
  emptyProductionRollbackInventory,
  executeProductionAuthRollback,
  parseProductionAuthArgs,
  productionAuthWritesEnabled,
  STAGING_PROJECT_REF,
} from "@/lib/migration/production";
import type {
  AuthAdminPort,
  BusinessDbPort,
  BusinessUserRow,
  ClassifiedUser,
} from "@/lib/supabase/auth-migration";

describe("production auth args", () => {
  it("defaults to dry-run", () => {
    const args = parseProductionAuthArgs([]);
    assert.equal(args.mode, "dry-run");
    assert.equal(productionAuthWritesEnabled(args), false);
  });

  it("refuses execute without production project confirmation", () => {
    assert.throws(
      () => parseProductionAuthArgs(["--execute", "--limit", "1"]),
      MigrationCliError
    );
  });

  it("refuses execute against staging confirm ref", () => {
    assert.throws(
      () =>
        parseProductionAuthArgs([
          "--execute",
          "--limit",
          "1",
          "--confirm-production-project-ref",
          STAGING_PROJECT_REF,
        ]),
      MigrationCliError
    );
  });

  it("requires confirm-bulk-migrate for unrestricted execute", () => {
    assert.throws(
      () =>
        parseProductionAuthArgs([
          "--execute",
          "--confirm-production-project-ref",
          "abcdefghij1234567890",
        ]),
      MigrationCliError
    );
  });

  it("allows limited pilot execute with confirm ref", () => {
    const args = parseProductionAuthArgs([
      "--execute",
      "--limit",
      "3",
      "--confirm-production-project-ref",
      "abcdefghij1234567890",
    ]);
    assert.equal(args.mode, "execute");
    assert.equal(args.limit, 3);
  });
});

describe("exceptions + rollback", () => {
  it("builds exception dispositions without fabricating emails", () => {
    const classified: ClassifiedUser[] = [
      {
        userId: "u1",
        emailMasked: "a***@x",
        emailNormalized: null,
        category: "E_INVALID_EMAIL",
        password: { kind: "missing", descriptor: "missing" },
        isActive: true,
        alreadyLinkedAuthUserId: null,
        conflictAuthUserId: null,
        proposedAction: "SKIP_INVALID_EMAIL",
        outcome: "SKIPPED",
        reason: "invalid email",
      },
    ];
    const rows = buildExceptionList(classified, () => null);
    assert.equal(rows.length, 1);
    assert.equal(
      rows[0]?.recommendedDisposition,
      "correct_email_before_migration_after_human_verification"
    );
    assert.equal(dispositionFor("H_AUTH_EMAIL_CONFLICT"), "leave_unlinked");
  });

  it("rollback unlinks only matching migration-created mapping then deletes Auth user", async () => {
    const user: BusinessUserRow = {
      id: "u1",
      email: "a@example.com",
      passwordHash: null,
      supabaseAuthUserId: "auth-created-1",
      isActive: true,
      deactivatedAt: null,
    };
    const deleted: string[] = [];
    const authAdmin: AuthAdminPort = {
      findAuthUserByEmail: async () => null,
      createUserWithPasswordHash: async () => ({ id: "x" }),
      createUserWithoutPassword: async () => ({ id: "x" }),
      deleteUser: async (id) => {
        deleted.push(id);
      },
    };
    const businessDb: BusinessDbPort = {
      findUserById: async () => user,
      findUserByAuthId: async () => user,
      linkUser: async () => {
        throw new Error("no");
      },
      unlinkUser: async () => {
        user.supabaseAuthUserId = null;
      },
    };

    const inventory = emptyProductionRollbackInventory("batch-1");
    inventory.entries.push({
      businessUserId: "u1",
      emailMasked: "a***",
      emailFingerprint: null,
      classification: "A_BCRYPT_ACTIVE",
      previousSupabaseAuthUserId: null,
      createdAuthUserId: "auth-created-1",
      result: "READY",
      rollbackState: "pending",
    });

    const out = await executeProductionAuthRollback({
      inventory,
      confirmRollback: true,
      authAdmin,
      businessDb,
    });
    assert.equal(user.supabaseAuthUserId, null);
    assert.deepEqual(deleted, ["auth-created-1"]);
    assert.equal(out.entries[0]?.rollbackState, "auth_deleted");
  });

  it("rollback skips Auth delete when mapping mismatch", async () => {
    const user: BusinessUserRow = {
      id: "u1",
      email: "a@example.com",
      passwordHash: null,
      supabaseAuthUserId: "other-auth",
      isActive: true,
      deactivatedAt: null,
    };
    const deleted: string[] = [];
    const out = await executeProductionAuthRollback({
      inventory: {
        ...emptyProductionRollbackInventory("b"),
        entries: [
          {
            businessUserId: "u1",
            emailMasked: "a***",
            emailFingerprint: null,
            classification: "A_BCRYPT_ACTIVE",
            previousSupabaseAuthUserId: null,
            createdAuthUserId: "auth-created-1",
            result: "READY",
            rollbackState: "pending",
          },
        ],
      },
      confirmRollback: true,
      authAdmin: {
        findAuthUserByEmail: async () => null,
        createUserWithPasswordHash: async () => ({ id: "x" }),
        createUserWithoutPassword: async () => ({ id: "x" }),
        deleteUser: async (id) => {
          deleted.push(id);
        },
      },
      businessDb: {
        findUserById: async () => user,
        findUserByAuthId: async () => null,
        linkUser: async () => undefined,
        unlinkUser: async () => undefined,
      },
    });
    assert.equal(user.supabaseAuthUserId, "other-auth");
    assert.deepEqual(deleted, []);
    assert.equal(out.entries[0]?.rollbackState, "skipped_mismatch");
  });

  it("refuses rollback without confirmation", async () => {
    await assert.rejects(
      () =>
        executeProductionAuthRollback({
          inventory: emptyProductionRollbackInventory("b"),
          confirmRollback: false,
          authAdmin: {
            findAuthUserByEmail: async () => null,
            createUserWithPasswordHash: async () => ({ id: "x" }),
            createUserWithoutPassword: async () => ({ id: "x" }),
            deleteUser: async () => undefined,
          },
          businessDb: {
            findUserById: async () => null,
            findUserByAuthId: async () => null,
            linkUser: async () => undefined,
            unlinkUser: async () => undefined,
          },
        }),
      /confirm-rollback/
    );
  });
});
