import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  reconcileBusinessEmailFromVerifiedAuth,
  resolveLinkedUserWithEmailReconciliation,
  type EmailReconciliationClient,
} from "../email-reconciliation";
import { resolveLinkedUser, type VerifiedAuthIdentity } from "../provisioning";
import { SupabaseAuthError } from "../errors";

const ROOT = join(process.cwd());

type Row = {
  id: string;
  email: string;
  supabaseAuthUserId: string | null;
  isActive: boolean;
  displayName: string | null;
  accountRole: string | null;
};

function createDb(seed: Row[]): EmailReconciliationClient & { rows: Row[] } {
  const rows = [...seed];
  const api = {
    rows,
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
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { email: string };
      }) => {
        const idx = rows.findIndex((r) => r.id === where.id);
        if (idx < 0) throw new Error("not found");
        if (rows.some((r) => r.email === data.email && r.id !== where.id)) {
          const err = Object.assign(new Error("unique"), { code: "P2002" });
          throw err;
        }
        rows[idx] = { ...rows[idx], email: data.email };
        return rows[idx];
      },
    },
  };
  return api as unknown as EmailReconciliationClient & { rows: Row[] };
}

function identity(overrides: Partial<VerifiedAuthIdentity> = {}): VerifiedAuthIdentity {
  return {
    authUserId: "auth-1",
    email: "new@example.com",
    emailConfirmed: true,
    displayName: "Owner",
    ...overrides,
  };
}

describe("email reconciliation policy", () => {
  it("updates User.email on normal verified Auth email change", async () => {
    const db = createDb([
      {
        id: "u1",
        email: "old@example.com",
        supabaseAuthUserId: "auth-1",
        isActive: true,
        displayName: "Owner",
        accountRole: "employer",
      },
    ]);
    const result = await reconcileBusinessEmailFromVerifiedAuth(db, identity());
    assert.ok(result.status === "updated");
    assert.equal(result.userId, "u1");
    assert.equal(result.email, "new@example.com");
    assert.equal(db.rows[0].email, "new@example.com");
    assert.equal(db.rows[0].id, "u1");
    assert.equal(db.rows[0].supabaseAuthUserId, "auth-1");
  });

  it("fails closed when destination email is owned by another User", async () => {
    const db = createDb([
      {
        id: "u1",
        email: "old@example.com",
        supabaseAuthUserId: "auth-1",
        isActive: true,
        displayName: null,
        accountRole: null,
      },
      {
        id: "u2",
        email: "new@example.com",
        supabaseAuthUserId: "auth-2",
        isActive: true,
        displayName: null,
        accountRole: null,
      },
    ]);
    const result = await reconcileBusinessEmailFromVerifiedAuth(db, identity());
    assert.ok(result.status === "conflict");
    assert.equal(result.reason, "DESTINATION_EMAIL_OWNED");
    assert.equal(db.rows[0].email, "old@example.com");
  });

  it("treats case-only changes as unchanged after normalization", async () => {
    const db = createDb([
      {
        id: "u1",
        email: "owner@example.com",
        supabaseAuthUserId: "auth-1",
        isActive: true,
        displayName: null,
        accountRole: null,
      },
    ]);
    const result = await reconcileBusinessEmailFromVerifiedAuth(
      db,
      identity({ email: "Owner@Example.com" })
    );
    assert.equal(result.status, "unchanged");
  });

  it("rejects unverified change", async () => {
    const db = createDb([
      {
        id: "u1",
        email: "old@example.com",
        supabaseAuthUserId: "auth-1",
        isActive: true,
        displayName: null,
        accountRole: null,
      },
    ]);
    const result = await reconcileBusinessEmailFromVerifiedAuth(
      db,
      identity({ emailConfirmed: false })
    );
    assert.ok(result.status === "conflict");
    assert.equal(result.reason, "UNVERIFIED");
  });

  it("rejects missing User mapping", async () => {
    const db = createDb([]);
    const result = await reconcileBusinessEmailFromVerifiedAuth(db, identity());
    assert.ok(result.status === "conflict");
    assert.equal(result.reason, "MISSING_USER_MAPPING");
  });

  it("rejects inactive user", async () => {
    const db = createDb([
      {
        id: "u1",
        email: "old@example.com",
        supabaseAuthUserId: "auth-1",
        isActive: false,
        displayName: null,
        accountRole: null,
      },
    ]);
    const result = await reconcileBusinessEmailFromVerifiedAuth(db, identity());
    assert.ok(result.status === "conflict");
    assert.equal(result.reason, "INACTIVE_USER");
  });

  it("login-style resolve reconciles then succeeds; memberships/User.id unchanged", async () => {
    const db = createDb([
      {
        id: "u1",
        email: "old@example.com",
        supabaseAuthUserId: "auth-1",
        isActive: true,
        displayName: "Owner",
        accountRole: "employer",
      },
    ]);
    const linked = await resolveLinkedUserWithEmailReconciliation(
      db,
      identity({ email: "new@example.com" }),
      resolveLinkedUser
    );
    assert.equal(linked.id, "u1");
    assert.equal(linked.email, "new@example.com");
    assert.equal(linked.supabaseAuthUserId, "auth-1");
  });

  it("stale/conflicting destination still fails after reconcile attempt", async () => {
    const db = createDb([
      {
        id: "u1",
        email: "old@example.com",
        supabaseAuthUserId: "auth-1",
        isActive: true,
        displayName: null,
        accountRole: null,
      },
      {
        id: "u2",
        email: "new@example.com",
        supabaseAuthUserId: null,
        isActive: true,
        displayName: null,
        accountRole: null,
      },
    ]);
    await assert.rejects(
      resolveLinkedUserWithEmailReconciliation(
        db,
        identity({ email: "new@example.com" }),
        resolveLinkedUser
      ),
      (err: unknown) => err instanceof SupabaseAuthError && err.category === "AUTH_EMAIL_CONFLICT"
    );
    assert.equal(db.rows[0].email, "old@example.com");
  });

  it("documents policy in repository", () => {
    const doc = readFileSync(
      join(ROOT, "docs/supabase-auth-email-reconciliation.md"),
      "utf8"
    );
    assert.match(doc, /source of truth/i);
    assert.match(doc, /supabaseAuthUserId/);
    assert.match(doc, /User\.email/);
    assert.match(doc, /fail closed/i);
    assert.match(doc, /auto-merge/i);
    assert.match(doc, /will not merge/i);
  });

  it("auth callback wires reconcile before resolve for linked users", () => {
    const src = readFileSync(join(ROOT, "lib/supabase/auth-actions.ts"), "utf8");
    assert.match(src, /reconcileBusinessEmailFromVerifiedAuth/);
    assert.match(src, /resolveLinkedUserWithEmailReconciliation/);
  });
});
