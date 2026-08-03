import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertExecutionGuards,
  assertSafeReportPayload,
  buildClassificationReport,
  classifyUsers,
  inspectPasswordHash,
  isExecutableCategory,
  maskEmail,
  migrateOneUser,
  MigrationCliError,
  normalizeMigrationEmail,
  parseMigrationArgs,
  selectExecutableCandidates,
  writesEnabled,
  type AuthAdminPort,
  type BusinessDbPort,
  type BusinessUserRow,
} from "../auth-migration";

/** Fixed valid bcrypt ($2b$ cost 10) — not a production secret; plaintext is "test-password-ok". */
const BCRYPT_OK =
  "$2b$10$jDcFwY3UEMF55ma2qIX63udhSkmLRbJ9v5H4e1WIatlCKDdAC2Mku";

function user(partial: Partial<BusinessUserRow> & { id: string }): BusinessUserRow {
  return {
    email: partial.email ?? `${partial.id}@example.com`,
    passwordHash: partial.passwordHash === undefined ? BCRYPT_OK : partial.passwordHash,
    supabaseAuthUserId: partial.supabaseAuthUserId ?? null,
    isActive: partial.isActive ?? true,
    deactivatedAt: partial.deactivatedAt ?? null,
    id: partial.id,
  };
}

function mockPorts(seed: {
  users: BusinessUserRow[];
  authByEmail?: Map<string, { id: string; email: string | null }>;
}) {
  const users = new Map(seed.users.map((u) => [u.id, { ...u }]));
  const authUsers = new Map<string, { id: string; email: string }>();
  const calls = {
    createWithHash: 0,
    createWithoutPassword: 0,
    deleteUser: 0,
    linkUser: 0,
    unlinkUser: 0,
  };

  if (seed.authByEmail) {
    for (const [email, row] of seed.authByEmail) {
      authUsers.set(email, { id: row.id, email: row.email ?? email });
    }
  }

  const authAdmin: AuthAdminPort = {
    findAuthUserByEmail: async (email) => {
      const hit = authUsers.get(email);
      return hit ? { id: hit.id, email: hit.email } : null;
    },
    createUserWithPasswordHash: async ({ email }) => {
      calls.createWithHash += 1;
      const id = `auth-hash-${calls.createWithHash}`;
      authUsers.set(email, { id, email });
      return { id };
    },
    createUserWithoutPassword: async ({ email }) => {
      calls.createWithoutPassword += 1;
      const id = `auth-reset-${calls.createWithoutPassword}`;
      authUsers.set(email, { id, email });
      return { id };
    },
    deleteUser: async (authUserId) => {
      calls.deleteUser += 1;
      for (const [email, row] of authUsers) {
        if (row.id === authUserId) authUsers.delete(email);
      }
    },
  };

  const businessDb: BusinessDbPort = {
    findUserById: async (userId) => users.get(userId) ?? null,
    findUserByAuthId: async (authUserId) => {
      for (const u of users.values()) {
        if (u.supabaseAuthUserId === authUserId) return u;
      }
      return null;
    },
    linkUser: async (userId, authUserId) => {
      calls.linkUser += 1;
      const u = users.get(userId);
      if (!u) throw new Error("user missing");
      if (u.supabaseAuthUserId && u.supabaseAuthUserId !== authUserId) {
        throw new Error("refuses overwrite");
      }
      u.supabaseAuthUserId = authUserId;
    },
    unlinkUser: async (userId) => {
      calls.unlinkUser += 1;
      const u = users.get(userId);
      if (u) u.supabaseAuthUserId = null;
    },
  };

  return { authAdmin, businessDb, users, authUsers, calls };
}

describe("auth-migration CLI guards", () => {
  it("defaults to dry-run with no writes", () => {
    const args = parseMigrationArgs([]);
    assert.equal(args.mode, "dry-run");
    assert.equal(writesEnabled(args), false);
  });

  it("accepts explicit --dry-run", () => {
    const args = parseMigrationArgs(["--dry-run", "--limit", "5"]);
    assert.equal(args.mode, "dry-run");
    assert.equal(args.limit, 5);
  });

  it("allows --execute --user-id without bulk confirm", () => {
    const args = parseMigrationArgs(["--execute", "--user-id", "cuid1"]);
    assert.equal(args.mode, "execute");
    assert.equal(args.userId, "cuid1");
    assert.equal(writesEnabled(args), true);
  });

  it("allows --execute --limit without bulk confirm", () => {
    const args = parseMigrationArgs(["--execute", "--limit", "10"]);
    assert.equal(args.limit, 10);
  });

  it("refuses full bulk --execute without --confirm-bulk-migrate", () => {
    assert.throws(
      () => parseMigrationArgs(["--execute"]),
      (err: unknown) =>
        err instanceof MigrationCliError &&
        /confirm-bulk-migrate/.test(err.message)
    );
    assert.throws(
      () =>
        assertExecutionGuards({
          mode: "execute",
          userId: null,
          limit: null,
          confirmBulkMigrate: false,
        }),
      MigrationCliError
    );
  });

  it("allows full bulk --execute with --confirm-bulk-migrate", () => {
    const args = parseMigrationArgs([
      "--execute",
      "--confirm-bulk-migrate",
    ]);
    assert.equal(args.confirmBulkMigrate, true);
  });

  it("rejects unknown flags", () => {
    assert.throws(() => parseMigrationArgs(["--explode"]), MigrationCliError);
  });
});

describe("auth-migration classification", () => {
  it("classifies bcrypt / placeholder / inactive / linked / conflicts", () => {
    const users = [
      user({ id: "a1", passwordHash: BCRYPT_OK, isActive: true }),
      user({ id: "b1", passwordHash: BCRYPT_OK, isActive: false }),
      user({ id: "c1", passwordHash: "testhash", isActive: true }),
      user({ id: "d1", passwordHash: "hash", isActive: false }),
      user({ id: "e1", email: "not-an-email", passwordHash: BCRYPT_OK }),
      user({
        id: "g1",
        supabaseAuthUserId: "11111111-1111-1111-1111-111111111111",
        passwordHash: BCRYPT_OK,
      }),
      user({ id: "h1", email: "conflict@example.com", passwordHash: BCRYPT_OK }),
      user({ id: "i1", passwordHash: "!!!not-bcrypt!!!", isActive: true }),
      user({ id: "f1", email: "dup@example.com", passwordHash: BCRYPT_OK }),
      user({ id: "f2", email: "DUP@example.com", passwordHash: BCRYPT_OK }),
    ];

    const { classified, categoryCounts } = classifyUsers({
      users,
      authUsers: [
        { id: "auth-conflict", email: "conflict@example.com" },
      ],
    });

    assert.equal(categoryCounts.A_BCRYPT_ACTIVE, 1);
    assert.equal(categoryCounts.B_BCRYPT_INACTIVE, 1);
    assert.equal(categoryCounts.C_PLACEHOLDER_ACTIVE, 1);
    assert.equal(categoryCounts.D_PLACEHOLDER_INACTIVE, 1);
    assert.equal(categoryCounts.E_INVALID_EMAIL, 1);
    assert.equal(categoryCounts.F_DUPLICATE_EMAIL, 2);
    assert.equal(categoryCounts.G_ALREADY_LINKED, 1);
    assert.equal(categoryCounts.H_AUTH_EMAIL_CONFLICT, 1);
    assert.equal(categoryCounts.I_EXCEPTIONAL, 1);

    const byId = new Map(classified.map((r) => [r.userId, r]));
    assert.equal(byId.get("a1")?.outcome, "READY");
    assert.equal(byId.get("b1")?.outcome, "INACTIVE");
    assert.equal(byId.get("c1")?.outcome, "RESET_REQUIRED");
    assert.equal(byId.get("g1")?.outcome, "ALREADY_MIGRATED");
    assert.equal(byId.get("h1")?.outcome, "AUTH_CONFLICT");
    assert.equal(byId.get("i1")?.outcome, "INVALID_PASSWORD_HASH");
    assert.ok(isExecutableCategory("A_BCRYPT_ACTIVE"));
    assert.equal(isExecutableCategory("H_AUTH_EMAIL_CONFLICT"), false);
  });

  it("inspects bcrypt cost/prefix without exposing full hash", () => {
    const info = inspectPasswordHash(BCRYPT_OK);
    assert.equal(info.kind, "bcrypt");
    if (info.kind === "bcrypt") {
      assert.equal(info.cost, 10);
      assert.equal(info.variant, "b");
      assert.equal(info.prefix, "$2b$10$");
    }
    assert.equal(inspectPasswordHash("testhash").kind, "placeholder");
    assert.equal(inspectPasswordHash(null).kind, "missing");
  });

  it("normalizes and masks emails", () => {
    assert.equal(normalizeMigrationEmail("  Foo@Example.COM "), "foo@example.com");
    assert.equal(normalizeMigrationEmail("bad"), null);
    assert.match(maskEmail("alice@example.com"), /^a\*\*\*e@example\.com$/);
  });
});

describe("auth-migration dry-run vs execute", () => {
  it("dry-run performs no Auth or DB writes", async () => {
    const u = user({ id: "dry1" });
    const { authAdmin, businessDb, calls } = mockPorts({ users: [u] });
    const result = await migrateOneUser({
      mode: "dry-run",
      user: u,
      emailCounts: new Map([["dry1@example.com", 1]]),
      authByEmail: new Map(),
      authAdmin,
      businessDb,
    });
    assert.equal(result.report.outcome, "READY");
    assert.equal(calls.createWithHash, 0);
    assert.equal(calls.createWithoutPassword, 0);
    assert.equal(calls.linkUser, 0);
    assert.equal(calls.deleteUser, 0);
    assert.equal(u.supabaseAuthUserId, null);
  });

  it("execute imports bcrypt and links idempotently", async () => {
    const u = user({ id: "ex1" });
    const ports = mockPorts({ users: [u] });
    const first = await migrateOneUser({
      mode: "execute",
      user: u,
      emailCounts: new Map([["ex1@example.com", 1]]),
      authByEmail: new Map(),
      authAdmin: ports.authAdmin,
      businessDb: ports.businessDb,
    });
    assert.equal(first.linked, true);
    assert.equal(first.report.authUserId, "auth-hash-1");
    assert.equal(ports.users.get("ex1")?.supabaseAuthUserId, "auth-hash-1");

    // Re-run: already linked → ALREADY_MIGRATED, no second create
    const linkedUser = ports.users.get("ex1")!;
    const second = await migrateOneUser({
      mode: "execute",
      user: linkedUser,
      emailCounts: new Map([["ex1@example.com", 1]]),
      authByEmail: new Map(),
      authAdmin: ports.authAdmin,
      businessDb: ports.businessDb,
    });
    assert.equal(second.report.outcome, "ALREADY_MIGRATED");
    assert.equal(ports.calls.createWithHash, 1);
  });

  it("execute placeholder path creates Auth without password", async () => {
    const u = user({ id: "ph1", passwordHash: "testhash" });
    const ports = mockPorts({ users: [u] });
    const result = await migrateOneUser({
      mode: "execute",
      user: u,
      emailCounts: new Map([["ph1@example.com", 1]]),
      authByEmail: new Map(),
      authAdmin: ports.authAdmin,
      businessDb: ports.businessDb,
    });
    assert.equal(ports.calls.createWithoutPassword, 1);
    assert.equal(ports.calls.createWithHash, 0);
    assert.equal(result.report.outcome, "RESET_REQUIRED");
  });

  it("execute inactive bcrypt links without inventing active state", async () => {
    const u = user({ id: "in1", isActive: false });
    const ports = mockPorts({ users: [u] });
    const result = await migrateOneUser({
      mode: "execute",
      user: u,
      emailCounts: new Map([["in1@example.com", 1]]),
      authByEmail: new Map(),
      authAdmin: ports.authAdmin,
      businessDb: ports.businessDb,
    });
    assert.equal(result.report.outcome, "INACTIVE");
    assert.equal(ports.users.get("in1")?.isActive, false);
    assert.ok(ports.users.get("in1")?.supabaseAuthUserId);
  });

  it("skips auth email conflicts without claiming", async () => {
    const u = user({ id: "cf1", email: "taken@example.com" });
    const ports = mockPorts({
      users: [u],
      authByEmail: new Map([
        ["taken@example.com", { id: "existing-auth", email: "taken@example.com" }],
      ]),
    });
    const result = await migrateOneUser({
      mode: "execute",
      user: u,
      emailCounts: new Map([["taken@example.com", 1]]),
      authByEmail: new Map([
        ["taken@example.com", { id: "existing-auth", email: "taken@example.com" }],
      ]),
      authAdmin: ports.authAdmin,
      businessDb: ports.businessDb,
    });
    assert.equal(result.report.outcome, "AUTH_CONFLICT");
    assert.equal(ports.calls.createWithHash, 0);
    assert.equal(ports.calls.linkUser, 0);
  });

  it("compensates by deleting Auth user when link fails", async () => {
    const u = user({ id: "roll1" });
    const ports = mockPorts({ users: [u] });
    const failingDb: BusinessDbPort = {
      ...ports.businessDb,
      linkUser: async () => {
        throw new Error("simulated link failure");
      },
    };
    const result = await migrateOneUser({
      mode: "execute",
      user: u,
      emailCounts: new Map([["roll1@example.com", 1]]),
      authByEmail: new Map(),
      authAdmin: ports.authAdmin,
      businessDb: failingDb,
    });
    assert.equal(result.report.outcome, "ROLLED_BACK");
    assert.equal(result.compensated, true);
    assert.equal(ports.calls.deleteUser, 1);
    assert.equal(ports.calls.createWithHash, 1);
  });

  it("selectExecutableCandidates respects user-id and limit deterministically", () => {
    const { classified } = classifyUsers({
      users: [
        user({ id: "z" }),
        user({ id: "a" }),
        user({ id: "m", passwordHash: "testhash" }),
        user({
          id: "skip",
          supabaseAuthUserId: "11111111-1111-1111-1111-111111111111",
        }),
      ],
      authUsers: [],
    });
    const limited = selectExecutableCandidates(classified, { limit: 2 });
    assert.equal(limited.length, 2);
    assert.equal(limited[0].userId, "a");
    assert.equal(limited[1].userId, "m");
    const one = selectExecutableCandidates(classified, { userId: "z" });
    assert.equal(one.length, 1);
    assert.equal(one[0].userId, "z");
  });

  it("refuses unsafe report payloads containing hashes", () => {
    assert.throws(
      () => assertSafeReportPayload({ passwordHash: BCRYPT_OK }),
      /passwordHash|bcrypt/
    );
    assert.doesNotThrow(() =>
      assertSafeReportPayload(
        buildClassificationReport({
          categoryCounts: {
            A_BCRYPT_ACTIVE: 1,
            B_BCRYPT_INACTIVE: 0,
            C_PLACEHOLDER_ACTIVE: 0,
            D_PLACEHOLDER_INACTIVE: 0,
            E_INVALID_EMAIL: 0,
            F_DUPLICATE_EMAIL: 0,
            G_ALREADY_LINKED: 0,
            H_AUTH_EMAIL_CONFLICT: 0,
            I_EXCEPTIONAL: 0,
          },
          classified: [],
          authUsersTotal: 1,
          businessUsersTotal: 1,
        })
      )
    );
  });
});
