/**
 * Auth email ↔ business email reconciliation (Stage 3B).
 *
 * Policy summary (see docs/supabase-auth-email-reconciliation.md):
 * - Supabase Auth email is the source of truth for authentication identity.
 * - User.email is the source of truth for business/contact email (invites, mail, Stripe bootstrap).
 * - Identity mapping is always via supabaseAuthUserId → User.id (never email alone).
 * - Verified Auth email changes may update User.email only when the destination is free.
 * - Never auto-merge users, never rewrite memberships/billing/ownership identifiers.
 * - Fail closed on conflicting mappings or when another User owns the destination email.
 */

import type { PrismaClient, User } from "@prisma/client";

import {
  logAuthDiagnostic,
  SupabaseAuthError,
} from "@/lib/supabase/errors";
import { normalizeAuthEmail, type VerifiedAuthIdentity } from "@/lib/supabase/provisioning";

export type EmailReconciliationClient = Pick<PrismaClient, "user">;

export type EmailReconciliationResult =
  | {
      status: "unchanged" | "updated" | "case_normalized";
      userId: string;
      previousEmail: string;
      email: string;
    }
  | {
      status: "conflict";
      reason:
        | "DESTINATION_EMAIL_OWNED"
        | "MISSING_USER_MAPPING"
        | "CONFLICTING_AUTH_MAPPING"
        | "UNVERIFIED"
        | "INACTIVE_USER";
    };

export type ReconciledUser = Pick<
  User,
  "id" | "email" | "supabaseAuthUserId" | "isActive" | "displayName" | "accountRole"
>;

const SELECT = {
  id: true,
  email: true,
  supabaseAuthUserId: true,
  isActive: true,
  displayName: true,
  accountRole: true,
} as const;

/**
 * After a verified Auth email change, sync User.email when safe.
 * Does not create users. Does not change User.id / memberships / Stripe ids.
 */
export async function reconcileBusinessEmailFromVerifiedAuth(
  db: EmailReconciliationClient,
  identity: VerifiedAuthIdentity
): Promise<EmailReconciliationResult> {
  const authUserId = identity.authUserId?.trim() ?? "";
  const authEmail = normalizeAuthEmail(identity.email ?? "");

  if (!authUserId || !authEmail || !authEmail.includes("@")) {
    logAuthDiagnostic("AUTH_PROVISIONING_FAILED", { emailReconcileIncomplete: true });
    throw new SupabaseAuthError("AUTH_PROVISIONING_FAILED");
  }

  if (!identity.emailConfirmed) {
    logAuthDiagnostic("AUTH_UNAUTHENTICATED", { emailReconcileUnverified: true });
    return { status: "conflict", reason: "UNVERIFIED" };
  }

  const linked = await db.user.findUnique({
    where: { supabaseAuthUserId: authUserId },
    select: SELECT,
  });

  if (!linked) {
    logAuthDiagnostic("AUTH_USER_UNLINKED", { emailReconcileMissing: true });
    return { status: "conflict", reason: "MISSING_USER_MAPPING" };
  }

  if (!linked.isActive) {
    logAuthDiagnostic("AUTH_USER_INACTIVE", { emailReconcileInactive: true });
    return { status: "conflict", reason: "INACTIVE_USER" };
  }

  if (linked.supabaseAuthUserId !== authUserId) {
    logAuthDiagnostic("AUTH_USER_CONFLICT", { emailReconcileMapping: true });
    return { status: "conflict", reason: "CONFLICTING_AUTH_MAPPING" };
  }

  const previousEmail = normalizeAuthEmail(linked.email);
  if (previousEmail === authEmail) {
    return {
      status: "unchanged",
      userId: linked.id,
      previousEmail,
      email: previousEmail,
    };
  }

  const ownerOfDestination = await db.user.findUnique({
    where: { email: authEmail },
    select: { id: true, supabaseAuthUserId: true },
  });

  if (ownerOfDestination && ownerOfDestination.id !== linked.id) {
    // Never attach this Auth identity's new email onto another business user,
    // and never steal the destination address.
    logAuthDiagnostic("AUTH_EMAIL_CONFLICT", {
      emailReconcileDestinationOwned: true,
    });
    return { status: "conflict", reason: "DESTINATION_EMAIL_OWNED" };
  }

  try {
    const updated = await db.user.update({
      where: { id: linked.id },
      data: { email: authEmail },
      select: SELECT,
    });

    return {
      status: previousEmail.toLowerCase() === authEmail ? "case_normalized" : "updated",
      userId: updated.id,
      previousEmail,
      email: normalizeAuthEmail(updated.email),
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      logAuthDiagnostic("AUTH_EMAIL_CONFLICT", { emailReconcileUniqueRace: true });
      return { status: "conflict", reason: "DESTINATION_EMAIL_OWNED" };
    }
    throw error;
  }
}

/**
 * Resolve linked user; if Auth email drifted, attempt a safe one-shot reconciliation
 * then re-resolve. Still fail closed when destination is owned or mapping conflicts.
 */
export async function resolveLinkedUserWithEmailReconciliation(
  db: EmailReconciliationClient,
  identity: VerifiedAuthIdentity,
  resolveLinkedUser: (
    db: EmailReconciliationClient,
    identity: VerifiedAuthIdentity
  ) => Promise<ReconciledUser>
): Promise<ReconciledUser> {
  try {
    return await resolveLinkedUser(db, identity);
  } catch (error) {
    if (!(error instanceof SupabaseAuthError) || error.category !== "AUTH_EMAIL_CONFLICT") {
      throw error;
    }

    const result = await reconcileBusinessEmailFromVerifiedAuth(db, identity);
    if (result.status === "conflict") {
      throw new SupabaseAuthError("AUTH_EMAIL_CONFLICT", {
        message: result.reason,
      });
    }

    return resolveLinkedUser(db, identity);
  }
}
