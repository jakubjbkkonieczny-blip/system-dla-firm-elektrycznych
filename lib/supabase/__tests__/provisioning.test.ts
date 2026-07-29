import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ensureProvisionedUserAfterAuth,
  linkExistingUserToAuth,
  normalizeAuthEmail,
  provisionNewUserFromAuth,
  resolveLinkedUser,
  type ProvisioningClient,
  type ProvisionedUser,
  type VerifiedAuthIdentity,
} from "../provisioning";
import { SupabaseAuthError } from "../errors";

type Row = ProvisionedUser;

function createProvisioningMock(seed: Row[] = []): {
  db: ProvisioningClient;
  rows: Row[];
  creates: number;
} {
  const rows = [...seed];
  const state = { creates: 0 };

  const api = {
    user: {
      findUnique: async ({
        where,
      }: {
        where: { supabaseAuthUserId?: string; email?: string; id?: string };
      }) => {
        if (where.supabaseAuthUserId) {
          return rows.find((r) => r.supabaseAuthUserId === where.supabaseAuthUserId) ?? null;
        }
        if (where.email) {
          return rows.find((r) => r.email === where.email) ?? null;
        }
        if (where.id) {
          return rows.find((r) => r.id === where.id) ?? null;
        }
        return null;
      },
      create: async ({ data }: { data: Partial<Row> & { email: string } }) => {
        state.creates += 1;
        const row: Row = {
          id: `cuid_${state.creates}`,
          email: data.email,
          supabaseAuthUserId: data.supabaseAuthUserId ?? null,
          isActive: true,
          displayName: data.displayName ?? null,
          accountRole: null,
        };
        rows.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { supabaseAuthUserId: string };
      }) => {
        const idx = rows.findIndex((r) => r.id === where.id);
        if (idx < 0) throw new Error("not found");
        rows[idx] = { ...rows[idx], supabaseAuthUserId: data.supabaseAuthUserId };
        return rows[idx];
      },
    },
    $transaction: async <T>(fn: (tx: ProvisioningClient) => Promise<T>) =>
      fn(api as unknown as ProvisioningClient),
  };

  return {
    db: api as unknown as ProvisioningClient,
    rows,
    get creates() {
      return state.creates;
    },
  };
}

const identity = (
  overrides: Partial<VerifiedAuthIdentity> = {}
): VerifiedAuthIdentity => ({
  authUserId: "11111111-1111-1111-1111-111111111111",
  email: "user@example.com",
  emailConfirmed: true,
  displayName: "Ada",
  ...overrides,
});

describe("normalizeAuthEmail", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeAuthEmail("  Ada@Example.COM "), "ada@example.com");
  });
});

describe("provisioning / linking", () => {
  it("provisions a new user without passwordHash and without CompanyMember side effects", async () => {
    const mock = createProvisioningMock();
    const user = await provisionNewUserFromAuth(mock.db, identity());
    assert.equal(user.email, "user@example.com");
    assert.equal(user.supabaseAuthUserId, identity().authUserId);
    assert.equal(user.accountRole, null);
    assert.equal(mock.creates, 1);
  });

  it("is idempotent on repeated provision for the same Auth UUID", async () => {
    const mock = createProvisioningMock();
    const first = await provisionNewUserFromAuth(mock.db, identity());
    const second = await ensureProvisionedUserAfterAuth(mock.db, identity());
    assert.equal(first.id, second.id);
    assert.equal(mock.creates, 1);
  });

  it("fails closed when email already has a different Auth UUID", async () => {
    const mock = createProvisioningMock([
      {
        id: "existing",
        email: "user@example.com",
        supabaseAuthUserId: "99999999-9999-9999-9999-999999999999",
        isActive: true,
        displayName: null,
        accountRole: null,
      },
    ]);
    await assert.rejects(
      () => provisionNewUserFromAuth(mock.db, identity()),
      (err: unknown) =>
        err instanceof SupabaseAuthError && err.category === "AUTH_USER_CONFLICT"
    );
    assert.equal(mock.creates, 0);
  });

  it("does not auto-claim an existing unlinked email during new provision", async () => {
    const mock = createProvisioningMock([
      {
        id: "existing",
        email: "user@example.com",
        supabaseAuthUserId: null,
        isActive: true,
        displayName: null,
        accountRole: "employer",
      },
    ]);
    await assert.rejects(
      () => provisionNewUserFromAuth(mock.db, identity()),
      (err: unknown) =>
        err instanceof SupabaseAuthError && err.category === "AUTH_USER_CONFLICT"
    );
  });

  it("links an existing user when emails match and mapping is null", async () => {
    const mock = createProvisioningMock([
      {
        id: "existing",
        email: "user@example.com",
        supabaseAuthUserId: null,
        isActive: true,
        displayName: null,
        accountRole: "worker",
      },
    ]);
    const linked = await linkExistingUserToAuth(mock.db, "existing", identity());
    assert.equal(linked.supabaseAuthUserId, identity().authUserId);
    assert.equal(mock.creates, 0);
  });

  it("refuses link when emails mismatch", async () => {
    const mock = createProvisioningMock([
      {
        id: "existing",
        email: "other@example.com",
        supabaseAuthUserId: null,
        isActive: true,
        displayName: null,
        accountRole: null,
      },
    ]);
    await assert.rejects(
      () => linkExistingUserToAuth(mock.db, "existing", identity()),
      (err: unknown) =>
        err instanceof SupabaseAuthError && err.category === "AUTH_EMAIL_CONFLICT"
    );
  });

  it("refuses to overwrite a conflicting mapping on link", async () => {
    const mock = createProvisioningMock([
      {
        id: "existing",
        email: "user@example.com",
        supabaseAuthUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        isActive: true,
        displayName: null,
        accountRole: null,
      },
    ]);
    await assert.rejects(
      () => linkExistingUserToAuth(mock.db, "existing", identity()),
      (err: unknown) =>
        err instanceof SupabaseAuthError && err.category === "AUTH_USER_CONFLICT"
    );
  });

  it("resolveLinkedUser rejects unmapped, inactive, and email mismatch", async () => {
    const mock = createProvisioningMock();
    await assert.rejects(
      () => resolveLinkedUser(mock.db, identity()),
      (err: unknown) =>
        err instanceof SupabaseAuthError && err.category === "AUTH_USER_UNLINKED"
    );

    mock.rows.push({
      id: "u1",
      email: "user@example.com",
      supabaseAuthUserId: identity().authUserId,
      isActive: false,
      displayName: null,
      accountRole: null,
    });
    await assert.rejects(
      () => resolveLinkedUser(mock.db, identity()),
      (err: unknown) =>
        err instanceof SupabaseAuthError && err.category === "AUTH_USER_INACTIVE"
    );

    mock.rows[0].isActive = true;
    mock.rows[0].email = "other@example.com";
    await assert.rejects(
      () => resolveLinkedUser(mock.db, identity()),
      (err: unknown) =>
        err instanceof SupabaseAuthError && err.category === "AUTH_EMAIL_CONFLICT"
    );
  });

  it("rejects unconfirmed email identities", async () => {
    const mock = createProvisioningMock();
    await assert.rejects(
      () =>
        provisionNewUserFromAuth(
          mock.db,
          identity({ emailConfirmed: false })
        ),
      (err: unknown) =>
        err instanceof SupabaseAuthError && err.category === "AUTH_UNAUTHENTICATED"
    );
  });

  it("ignores authorization fields that are not part of VerifiedAuthIdentity", async () => {
    const mock = createProvisioningMock();
    // Client-supplied role/company must never be accepted — identity type has no such fields.
    const user = await provisionNewUserFromAuth(mock.db, identity({ displayName: "Only Name" }));
    assert.equal(user.accountRole, null);
    assert.equal(user.displayName, "Only Name");
  });
});
