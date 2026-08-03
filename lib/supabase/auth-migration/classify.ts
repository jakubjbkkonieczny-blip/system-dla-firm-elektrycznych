/**
 * Read-only classification of VectorWork User rows for Auth migration.
 * Never logs or returns password hashes / secrets.
 */

import type {
  AuthUserRow,
  BusinessUserRow,
  CategoryCounts,
  ClassifiedUser,
  MigrationCategory,
  MigrationOutcome,
  PasswordHashInfo,
  ProposedAction,
} from "@/lib/supabase/auth-migration/types";

/** Official bcrypt modular crypt format used by node bcrypt ($2a$ / $2b$ / $2y$). */
const BCRYPT_RE = /^\$2([aby])\$(\d{2})\$[./A-Za-z0-9]{53}$/;

export function normalizeMigrationEmail(
  email: string | null | undefined
): string | null {
  if (email == null) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return null;
  const [local, domain] = normalized.split("@");
  if (!local || !domain || !domain.includes(".")) return null;
  return normalized;
}

export function maskEmail(email: string | null | undefined): string {
  const normalized = normalizeMigrationEmail(email);
  if (!normalized) return "(invalid-or-missing)";
  const [local, domain] = normalized.split("@");
  const localMask =
    local.length <= 1 ? "*" : `${local[0]}***${local[local.length - 1]}`;
  return `${localMask}@${domain}`;
}

export function inspectPasswordHash(
  passwordHash: string | null | undefined
): PasswordHashInfo {
  if (passwordHash == null || passwordHash === "") {
    return { kind: "missing", descriptor: "null_or_empty" };
  }

  const match = BCRYPT_RE.exec(passwordHash);
  if (match) {
    return {
      kind: "bcrypt",
      variant: match[1],
      cost: Number.parseInt(match[2], 10),
      prefix: `$2${match[1]}$${match[2]}$`,
    };
  }

  // Known non-importable placeholders observed in staging audit (never log raw values).
  const trimmed = passwordHash.trim();
  if (trimmed === "testhash" || trimmed === "hash") {
    return { kind: "placeholder", descriptor: trimmed === "hash" ? "hash" : "testhash" };
  }
  if (/^[a-zA-Z]+$/.test(trimmed) && trimmed.length < 40) {
    return { kind: "placeholder", descriptor: "alpha_placeholder" };
  }

  return { kind: "unexpected", descriptor: "non_bcrypt" };
}

export function emptyCategoryCounts(): CategoryCounts {
  return {
    A_BCRYPT_ACTIVE: 0,
    B_BCRYPT_INACTIVE: 0,
    C_PLACEHOLDER_ACTIVE: 0,
    D_PLACEHOLDER_INACTIVE: 0,
    E_INVALID_EMAIL: 0,
    F_DUPLICATE_EMAIL: 0,
    G_ALREADY_LINKED: 0,
    H_AUTH_EMAIL_CONFLICT: 0,
    I_EXCEPTIONAL: 0,
  };
}

function actionForCategory(category: MigrationCategory): {
  proposedAction: ProposedAction;
  outcome: MigrationOutcome;
  reason: string;
} {
  switch (category) {
    case "G_ALREADY_LINKED":
      return {
        proposedAction: "SKIP_ALREADY_LINKED",
        outcome: "ALREADY_MIGRATED",
        reason: "User.supabaseAuthUserId already set",
      };
    case "E_INVALID_EMAIL":
      return {
        proposedAction: "SKIP_INVALID_EMAIL",
        outcome: "BUSINESS_CONFLICT",
        reason: "Missing or malformed email",
      };
    case "F_DUPLICATE_EMAIL":
      return {
        proposedAction: "SKIP_CONFLICT",
        outcome: "BUSINESS_CONFLICT",
        reason: "Duplicate normalized email in business User table",
      };
    case "H_AUTH_EMAIL_CONFLICT":
      return {
        proposedAction: "SKIP_CONFLICT",
        outcome: "AUTH_CONFLICT",
        reason: "auth.users already contains this email and is not linked to this User",
      };
    case "A_BCRYPT_ACTIVE":
      return {
        proposedAction: "IMPORT_BCRYPT_AND_LINK",
        outcome: "READY",
        reason: "Importable bcrypt hash; active; will Admin createUser(password_hash) + link",
      };
    case "B_BCRYPT_INACTIVE":
      return {
        proposedAction: "IMPORT_INACTIVE_BCRYPT_AND_LINK",
        outcome: "INACTIVE",
        reason:
          "Importable bcrypt; inactive — create Auth (not banned); link; business isActive remains false",
      };
    case "C_PLACEHOLDER_ACTIVE":
      return {
        proposedAction: "IMPORT_RESET_REQUIRED_AND_LINK",
        outcome: "RESET_REQUIRED",
        reason:
          "Non-importable passwordHash — create Auth without password; require recovery before login",
      };
    case "D_PLACEHOLDER_INACTIVE":
      return {
        proposedAction: "IMPORT_INACTIVE_RESET_REQUIRED_AND_LINK",
        outcome: "INACTIVE",
        reason:
          "Non-importable passwordHash + inactive — create Auth without password; not banned; reset required",
      };
    case "I_EXCEPTIONAL":
    default:
      return {
        proposedAction: "SKIP_EXCEPTIONAL",
        outcome: "FAILED",
        reason: "Exceptional / unexpected password or state — manual review",
      };
  }
}

/**
 * Classify one business user into a mutually exclusive category.
 * Priority: already-linked → invalid email → duplicate email → auth email conflict → hash/active cohorts → exceptional.
 */
export function classifyUser(input: {
  user: BusinessUserRow;
  /** Normalized-email → count of business users (for duplicate detection). */
  emailCounts: Map<string, number>;
  /** Normalized-email → existing auth.users row (if any). */
  authByEmail: Map<string, AuthUserRow>;
}): ClassifiedUser {
  const { user, emailCounts, authByEmail } = input;
  const emailNormalized = normalizeMigrationEmail(user.email);
  const emailMasked = maskEmail(user.email);
  const password = inspectPasswordHash(user.passwordHash);
  const alreadyLinkedAuthUserId = user.supabaseAuthUserId?.trim() || null;

  let category: MigrationCategory;

  if (alreadyLinkedAuthUserId) {
    category = "G_ALREADY_LINKED";
  } else if (!emailNormalized) {
    category = "E_INVALID_EMAIL";
  } else if ((emailCounts.get(emailNormalized) ?? 0) > 1) {
    category = "F_DUPLICATE_EMAIL";
  } else {
    const authConflict = authByEmail.get(emailNormalized) ?? null;
    if (authConflict) {
      category = "H_AUTH_EMAIL_CONFLICT";
    } else if (password.kind === "bcrypt") {
      category = user.isActive ? "A_BCRYPT_ACTIVE" : "B_BCRYPT_INACTIVE";
    } else if (password.kind === "placeholder") {
      category = user.isActive ? "C_PLACEHOLDER_ACTIVE" : "D_PLACEHOLDER_INACTIVE";
    } else {
      category = "I_EXCEPTIONAL";
    }
  }

  const { proposedAction, outcome, reason } = actionForCategory(category);
  const conflictAuthUserId =
    category === "H_AUTH_EMAIL_CONFLICT" && emailNormalized
      ? authByEmail.get(emailNormalized)?.id ?? null
      : null;

  // Refine outcome for placeholder active (RESET_REQUIRED already set).
  // Keep INVALID_PASSWORD_HASH available for unexpected non-bcrypt that is not a known placeholder.
  let finalOutcome = outcome;
  if (category === "I_EXCEPTIONAL" && password.kind === "unexpected") {
    finalOutcome = "INVALID_PASSWORD_HASH";
  }

  return {
    userId: user.id,
    emailMasked,
    emailNormalized,
    category,
    password,
    isActive: user.isActive,
    alreadyLinkedAuthUserId,
    conflictAuthUserId,
    proposedAction,
    outcome: finalOutcome,
    reason,
  };
}

export function classifyUsers(input: {
  users: BusinessUserRow[];
  authUsers: AuthUserRow[];
}): { classified: ClassifiedUser[]; categoryCounts: CategoryCounts } {
  const emailCounts = new Map<string, number>();
  for (const user of input.users) {
    const email = normalizeMigrationEmail(user.email);
    if (!email) continue;
    emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
  }

  const authByEmail = new Map<string, AuthUserRow>();
  for (const auth of input.authUsers) {
    const email = normalizeMigrationEmail(auth.email);
    if (!email) continue;
    // First wins; duplicates in auth.users are themselves exceptional and surface as conflict.
    if (!authByEmail.has(email)) {
      authByEmail.set(email, auth);
    }
  }

  const categoryCounts = emptyCategoryCounts();
  const classified: ClassifiedUser[] = [];

  for (const user of input.users) {
    const row = classifyUser({ user, emailCounts, authByEmail });
    categoryCounts[row.category] += 1;
    classified.push(row);
  }

  return { classified, categoryCounts };
}

/** Categories that may proceed to Auth create + link under reviewed execute. */
export function isExecutableCategory(category: MigrationCategory): boolean {
  return (
    category === "A_BCRYPT_ACTIVE" ||
    category === "B_BCRYPT_INACTIVE" ||
    category === "C_PLACEHOLDER_ACTIVE" ||
    category === "D_PLACEHOLDER_INACTIVE"
  );
}
