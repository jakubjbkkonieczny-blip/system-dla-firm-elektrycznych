/**
 * Identity mapping helpers — Phase 1 skeleton (unused by production auth).
 *
 * Approved model:
 *   Supabase Auth UUID  →  User.supabaseAuthUserId
 *   User.id (cuid)      →  permanent business primary key
 *
 * Do not call from login/register/middleware until a later cutover phase.
 */

import type { PrismaClient, User } from "@prisma/client";

export type AuthUserMappingClient = Pick<PrismaClient, "user">;

export type LinkedAuthUser = Pick<
  User,
  "id" | "email" | "supabaseAuthUserId" | "isActive"
>;

const LINKED_USER_SELECT = {
  id: true,
  email: true,
  supabaseAuthUserId: true,
  isActive: true,
} as const;

/** Lookup VectorWork user by Supabase Auth UUID. */
export async function findUserBySupabaseAuthUserId(
  db: AuthUserMappingClient,
  supabaseAuthUserId: string
): Promise<LinkedAuthUser | null> {
  const id = supabaseAuthUserId.trim();
  if (!id) return null;

  return db.user.findUnique({
    where: { supabaseAuthUserId: id },
    select: LINKED_USER_SELECT,
  });
}

/**
 * Persist Auth UUID ↔ User.id link.
 * Fails if another user already owns the Auth UUID (unique constraint).
 * Does not change passwordHash, sessionVersion, or roles.
 */
export async function linkUserToSupabaseAuthUser(
  db: AuthUserMappingClient,
  userId: string,
  supabaseAuthUserId: string
): Promise<LinkedAuthUser> {
  const authId = supabaseAuthUserId.trim();
  if (!userId.trim() || !authId) {
    throw new Error("linkUserToSupabaseAuthUser requires userId and supabaseAuthUserId");
  }

  return db.user.update({
    where: { id: userId },
    data: { supabaseAuthUserId: authId },
    select: LINKED_USER_SELECT,
  });
}

/** Clear the mapping (rollback / unlink helper for later phases). */
export async function unlinkUserSupabaseAuthUserId(
  db: AuthUserMappingClient,
  userId: string
): Promise<LinkedAuthUser> {
  return db.user.update({
    where: { id: userId },
    data: { supabaseAuthUserId: null },
    select: LINKED_USER_SELECT,
  });
}
