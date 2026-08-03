/**
 * Manual exception reporting for production Auth dry-run.
 * Counts are always live — never hardcoded from staging.
 */

import type {
  ClassifiedUser,
  MigrationCategory,
} from "@/lib/supabase/auth-migration/types";

export type ManualDisposition =
  | "leave_unlinked"
  | "correct_email_before_migration_after_human_verification"
  | "disable_or_defer_account";

export type AuthExceptionRow = {
  userId: string;
  emailMasked: string;
  emailFingerprint: string | null;
  category: MigrationCategory;
  reason: string;
  recommendedDisposition: ManualDisposition;
};

const EXCEPTION_CATEGORIES: ReadonlySet<MigrationCategory> = new Set([
  "E_INVALID_EMAIL",
  "F_DUPLICATE_EMAIL",
  "H_AUTH_EMAIL_CONFLICT",
  "I_EXCEPTIONAL",
]);

export function dispositionFor(category: MigrationCategory): ManualDisposition {
  switch (category) {
    case "E_INVALID_EMAIL":
      return "correct_email_before_migration_after_human_verification";
    case "F_DUPLICATE_EMAIL":
      return "disable_or_defer_account";
    case "H_AUTH_EMAIL_CONFLICT":
      return "leave_unlinked";
    case "I_EXCEPTIONAL":
    default:
      return "leave_unlinked";
  }
}

export function buildExceptionList(
  classified: ClassifiedUser[],
  emailFingerprint: (normalizedEmail: string | null) => string | null
): AuthExceptionRow[] {
  return classified
    .filter((row) => EXCEPTION_CATEGORIES.has(row.category))
    .map((row) => ({
      userId: row.userId,
      emailMasked: row.emailMasked,
      emailFingerprint: emailFingerprint(row.emailNormalized),
      category: row.category,
      reason: row.reason,
      recommendedDisposition: dispositionFor(row.category),
    }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
}
