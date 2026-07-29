import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findUserBySupabaseAuthUserId,
  linkUserToSupabaseAuthUser,
  unlinkUserSupabaseAuthUserId,
  type AuthUserMappingClient,
  type LinkedAuthUser,
} from "../auth-user-mapping";

function createMockDb(seed?: LinkedAuthUser | null): {
  db: AuthUserMappingClient;
  updates: Array<{ userId: string; supabaseAuthUserId: string | null }>;
} {
  let row = seed ?? null;
  const updates: Array<{ userId: string; supabaseAuthUserId: string | null }> = [];

  const db = {
    user: {
      findUnique: async ({
        where,
      }: {
        where: { supabaseAuthUserId?: string; id?: string };
      }) => {
        if (!row) return null;
        if (where.supabaseAuthUserId !== undefined) {
          return row.supabaseAuthUserId === where.supabaseAuthUserId ? row : null;
        }
        if (where.id !== undefined) {
          return row.id === where.id ? row : null;
        }
        return null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { supabaseAuthUserId: string | null };
      }) => {
        updates.push({
          userId: where.id,
          supabaseAuthUserId: data.supabaseAuthUserId,
        });
        row = {
          id: where.id,
          email: row?.email ?? "user@example.com",
          supabaseAuthUserId: data.supabaseAuthUserId,
          isActive: row?.isActive ?? true,
        };
        return row;
      },
    },
  } as unknown as AuthUserMappingClient;

  return { db, updates };
}

describe("Supabase Auth user mapping", () => {
  it("finds a user by supabaseAuthUserId", async () => {
    const authId = "11111111-1111-1111-1111-111111111111";
    const { db } = createMockDb({
      id: "user_cuid",
      email: "a@example.com",
      supabaseAuthUserId: authId,
      isActive: true,
    });

    const found = await findUserBySupabaseAuthUserId(db, authId);
    assert.equal(found?.id, "user_cuid");
    assert.equal(await findUserBySupabaseAuthUserId(db, "missing"), null);
    assert.equal(await findUserBySupabaseAuthUserId(db, "  "), null);
  });

  it("links and unlinks without touching other auth fields", async () => {
    const { db, updates } = createMockDb({
      id: "user_cuid",
      email: "a@example.com",
      supabaseAuthUserId: null,
      isActive: true,
    });
    const authId = "22222222-2222-2222-2222-222222222222";

    const linked = await linkUserToSupabaseAuthUser(db, "user_cuid", authId);
    assert.equal(linked.supabaseAuthUserId, authId);
    assert.deepEqual(updates[0], {
      userId: "user_cuid",
      supabaseAuthUserId: authId,
    });

    const unlinked = await unlinkUserSupabaseAuthUserId(db, "user_cuid");
    assert.equal(unlinked.supabaseAuthUserId, null);
  });

  it("is idempotent when already linked to the same Auth UUID", async () => {
    const authId = "33333333-3333-3333-3333-333333333333";
    const { db, updates } = createMockDb({
      id: "user_cuid",
      email: "a@example.com",
      supabaseAuthUserId: authId,
      isActive: true,
    });
    const linked = await linkUserToSupabaseAuthUser(db, "user_cuid", authId);
    assert.equal(linked.supabaseAuthUserId, authId);
    assert.equal(updates.length, 0);
  });

  it("refuses to overwrite a different non-null Auth mapping", async () => {
    const { db } = createMockDb({
      id: "user_cuid",
      email: "a@example.com",
      supabaseAuthUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      isActive: true,
    });
    await assert.rejects(
      () =>
        linkUserToSupabaseAuthUser(
          db,
          "user_cuid",
          "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
        ),
      /refuses to overwrite/
    );
  });

  it("rejects empty link arguments", async () => {
    const { db } = createMockDb();
    await assert.rejects(
      () => linkUserToSupabaseAuthUser(db, "", "uuid"),
      /requires userId and supabaseAuthUserId/
    );
  });
});
