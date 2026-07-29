/**
 * Idempotent Supabase Auth → VectorWork User linking / provisioning.
 *
 * Email policy:
 * - Supabase Auth owns the authentication email.
 * - User.email is a business/contact field and lookup aid (normalized lowercase).
 * - Conflicting linked UUIDs are never silently replaced (fail closed).
 * - Email changes that would transfer memberships/billing are NOT auto-reconciled
 *   in Stage 2A — see docs/supabase-migration-stage-2a.md.
 *
 * Case 1 — New registration: create User with supabaseAuthUserId, passwordHash null.
 * Case 2 — Explicit link of an existing unlinked User (migration-safe rule only):
 *   same normalized email + supabaseAuthUserId is null + active account.
 *   Never claim by email alone from client input without verified Auth identity.
 */

import type { Prisma, PrismaClient, User } from "@prisma/client";

import {
  findUserBySupabaseAuthUserId,
  type LinkedAuthUser,
} from "@/lib/supabase/auth-user-mapping";
import {
  logAuthDiagnostic,
  SupabaseAuthError,
} from "@/lib/supabase/errors";

export type ProvisioningClient = Pick<PrismaClient, "user" | "$transaction">;

export type VerifiedAuthIdentity = {
  /** Supabase auth.users.id — never trust client-supplied values. */
  authUserId: string;
  /** Normalized authentication email from verified Supabase session. */
  email: string;
  emailConfirmed: boolean;
  displayName?: string | null;
};

export type ProvisionedUser = Pick<
  User,
  "id" | "email" | "supabaseAuthUserId" | "isActive" | "displayName" | "accountRole"
>;

const PROVISION_SELECT = {
  id: true,
  email: true,
  supabaseAuthUserId: true,
  isActive: true,
  displayName: true,
  accountRole: true,
} as const;

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertVerifiedIdentity(identity: VerifiedAuthIdentity): {
  authUserId: string;
  email: string;
} {
  const authUserId = identity.authUserId?.trim() ?? "";
  const email = normalizeAuthEmail(identity.email ?? "");
  if (!authUserId || !email || !email.includes("@")) {
    throw new SupabaseAuthError("AUTH_PROVISIONING_FAILED", {
      publicCode: "AUTH_PROVISIONING_FAILED",
      message: "Verified Auth identity incomplete",
    });
  }
  if (!identity.emailConfirmed) {
    throw new SupabaseAuthError("AUTH_UNAUTHENTICATED", {
      publicCode: "EMAIL_NOT_CONFIRMED",
      httpStatus: 403,
      message: "Email not confirmed",
    });
  }
  return { authUserId, email };
}

/**
 * Resolve an already-linked active VectorWork user for a verified Auth identity.
 * Does not create or link.
 */
export async function resolveLinkedUser(
  db: Pick<PrismaClient, "user">,
  identity: VerifiedAuthIdentity
): Promise<ProvisionedUser> {
  const { authUserId, email } = assertVerifiedIdentity(identity);

  const linked = await db.user.findUnique({
    where: { supabaseAuthUserId: authUserId },
    select: PROVISION_SELECT,
  });

  if (!linked) {
    logAuthDiagnostic("AUTH_USER_UNLINKED", { hasMapping: false });
    throw new SupabaseAuthError("AUTH_USER_UNLINKED");
  }

  if (!linked.isActive) {
    logAuthDiagnostic("AUTH_USER_INACTIVE", { hasUser: true });
    throw new SupabaseAuthError("AUTH_USER_INACTIVE", {
      publicCode: "ACCOUNT_DISABLED",
    });
  }

  if (normalizeAuthEmail(linked.email) !== email) {
    logAuthDiagnostic("AUTH_EMAIL_CONFLICT", {
      emailMismatch: true,
    });
    throw new SupabaseAuthError("AUTH_EMAIL_CONFLICT");
  }

  return linked;
}

/**
 * CASE 1 — Provision a new VectorWork User after confirmed Supabase signup.
 * Idempotent: if already linked to this Auth UUID, returns existing row.
 * Fail-closed on email / UUID conflicts.
 * Does not create CompanyMember. Does not accept roles from Auth metadata.
 * Does not write a password or password hash of the user credential.
 */
export async function provisionNewUserFromAuth(
  db: ProvisioningClient,
  identity: VerifiedAuthIdentity
): Promise<ProvisionedUser> {
  const { authUserId, email } = assertVerifiedIdentity(identity);
  const displayName =
    typeof identity.displayName === "string" && identity.displayName.trim()
      ? identity.displayName.trim()
      : null;

  try {
    return await db.$transaction(async (tx) => {
      const byAuth = await tx.user.findUnique({
        where: { supabaseAuthUserId: authUserId },
        select: PROVISION_SELECT,
      });
      if (byAuth) {
        if (normalizeAuthEmail(byAuth.email) !== email) {
          logAuthDiagnostic("AUTH_EMAIL_CONFLICT", { existingByAuth: true });
          throw new SupabaseAuthError("AUTH_EMAIL_CONFLICT");
        }
        return byAuth;
      }

      const byEmail = await tx.user.findUnique({
        where: { email },
        select: PROVISION_SELECT,
      });

      if (byEmail) {
        if (
          byEmail.supabaseAuthUserId &&
          byEmail.supabaseAuthUserId !== authUserId
        ) {
          logAuthDiagnostic("AUTH_USER_CONFLICT", { emailOwnedByOtherAuth: true });
          throw new SupabaseAuthError("AUTH_USER_CONFLICT");
        }
        // Existing unlinked row with same email — not auto-claimed here.
        // Deliberate migration link must use linkExistingUserToAuth.
        logAuthDiagnostic("AUTH_USER_CONFLICT", { emailExistsUnlinked: true });
        throw new SupabaseAuthError("AUTH_USER_CONFLICT", {
          publicCode: "USER_EXISTS",
          httpStatus: 409,
        });
      }

      return tx.user.create({
        data: {
          email,
          displayName,
          supabaseAuthUserId: authUserId,
          // passwordHash intentionally null — Supabase owns credentials.
          passwordHash: null,
        },
        select: PROVISION_SELECT,
      });
    });
  } catch (error) {
    if (error instanceof SupabaseAuthError) throw error;
    // Unique race
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const retry = await db.user.findUnique({
        where: { supabaseAuthUserId: authUserId },
        select: PROVISION_SELECT,
      });
      if (retry && normalizeAuthEmail(retry.email) === email) {
        return retry;
      }
      logAuthDiagnostic("AUTH_USER_CONFLICT", { uniqueRace: true });
      throw new SupabaseAuthError("AUTH_USER_CONFLICT");
    }
    logAuthDiagnostic("AUTH_PROVISIONING_FAILED", { failed: true });
    throw new SupabaseAuthError("AUTH_PROVISIONING_FAILED", { cause: error });
  }
}

/**
 * CASE 2 — Explicit migration-safe link for an existing VectorWork user.
 *
 * Safe rule (all required):
 * - caller supplies VectorWork userId from a trusted server context (not client body)
 * - Auth identity is verified server-side
 * - emails match after normalization
 * - target user.supabaseAuthUserId is null OR already equals authUserId (idempotent)
 * - target user is active
 * - no other user owns this auth UUID
 *
 * Never overwrites a different non-null supabaseAuthUserId.
 */
export async function linkExistingUserToAuth(
  db: ProvisioningClient,
  userId: string,
  identity: VerifiedAuthIdentity
): Promise<ProvisionedUser> {
  const { authUserId, email } = assertVerifiedIdentity(identity);
  const id = userId.trim();
  if (!id) {
    throw new SupabaseAuthError("AUTH_USER_CONFLICT", {
      message: "Missing trusted userId",
    });
  }

  try {
    return await db.$transaction(async (tx) => {
      const existingByAuth = await tx.user.findUnique({
        where: { supabaseAuthUserId: authUserId },
        select: PROVISION_SELECT,
      });
      if (existingByAuth && existingByAuth.id !== id) {
        logAuthDiagnostic("AUTH_USER_CONFLICT", { authOwnedByOtherUser: true });
        throw new SupabaseAuthError("AUTH_USER_CONFLICT");
      }

      const target = await tx.user.findUnique({
        where: { id },
        select: PROVISION_SELECT,
      });
      if (!target) {
        throw new SupabaseAuthError("AUTH_PROVISIONING_FAILED", {
          publicCode: "USER_NOT_FOUND",
          httpStatus: 404,
        });
      }
      if (!target.isActive) {
        throw new SupabaseAuthError("AUTH_USER_INACTIVE", {
          publicCode: "ACCOUNT_DISABLED",
        });
      }
      if (normalizeAuthEmail(target.email) !== email) {
        logAuthDiagnostic("AUTH_EMAIL_CONFLICT", { linkEmailMismatch: true });
        throw new SupabaseAuthError("AUTH_EMAIL_CONFLICT");
      }
      if (
        target.supabaseAuthUserId &&
        target.supabaseAuthUserId !== authUserId
      ) {
        logAuthDiagnostic("AUTH_USER_CONFLICT", { existingDifferentAuth: true });
        throw new SupabaseAuthError("AUTH_USER_CONFLICT");
      }
      if (target.supabaseAuthUserId === authUserId) {
        return target;
      }

      return tx.user.update({
        where: { id },
        data: { supabaseAuthUserId: authUserId },
        select: PROVISION_SELECT,
      });
    });
  } catch (error) {
    if (error instanceof SupabaseAuthError) throw error;
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      logAuthDiagnostic("AUTH_USER_CONFLICT", { linkUniqueRace: true });
      throw new SupabaseAuthError("AUTH_USER_CONFLICT");
    }
    throw new SupabaseAuthError("AUTH_PROVISIONING_FAILED", { cause: error });
  }
}

/**
 * After Auth callback: ensure a VectorWork user exists for a confirmed signup.
 * Prefer idempotent provision; do not auto-link ambiguous existing emails.
 */
export async function ensureProvisionedUserAfterAuth(
  db: ProvisioningClient,
  identity: VerifiedAuthIdentity
): Promise<ProvisionedUser> {
  const { authUserId } = assertVerifiedIdentity(identity);
  const existing = await findUserBySupabaseAuthUserId(db, authUserId);
  if (existing) {
    return resolveLinkedUser(db, identity);
  }
  return provisionNewUserFromAuth(db, identity);
}

export type { LinkedAuthUser, Prisma };
