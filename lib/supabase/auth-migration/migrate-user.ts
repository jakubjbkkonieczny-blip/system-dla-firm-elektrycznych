/**
 * Deterministic per-user Auth migration with compensation.
 *
 * Write sequence (execute only):
 * 1. preflight business User
 * 2. preflight Supabase Auth conflicts
 * 3. create/import Auth user
 * 4. update User.supabaseAuthUserId
 * 5. verify mapping
 * 6. on business update failure → delete newly created Auth identity
 *
 * Dry-run never calls Auth create/delete or business link/unlink.
 */

import {
  classifyUser,
  inspectPasswordHash,
  isExecutableCategory,
  normalizeMigrationEmail,
} from "@/lib/supabase/auth-migration/classify";
import type {
  AuthAdminPort,
  BusinessDbPort,
  BusinessUserRow,
  ClassifiedUser,
  MigrationMode,
  MigrationOutcome,
  MigrationReportRow,
  ProposedAction,
} from "@/lib/supabase/auth-migration/types";

export type MigrateOneResult = {
  classified: ClassifiedUser;
  report: MigrationReportRow;
  createdAuthUserId: string | null;
  linked: boolean;
  compensated: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function reportFrom(
  classified: ClassifiedUser,
  overrides: Partial<MigrationReportRow> & {
    outcome: MigrationOutcome;
  }
): MigrationReportRow {
  return {
    timestamp: nowIso(),
    userId: classified.userId,
    emailMasked: classified.emailMasked,
    category: classified.category,
    proposedAction: classified.proposedAction,
    outcome: overrides.outcome,
    authUserId: overrides.authUserId ?? null,
    failureReason: overrides.failureReason ?? null,
    compensated: overrides.compensated ?? false,
  };
}

function appMetadataFor(userId: string): Record<string, unknown> {
  return {
    vectorwork_migration: "4F-auth",
    vectorwork_user_id: userId,
    // Diagnostic only — authorization never reads Auth metadata for roles.
  };
}

/**
 * Build classification context maps for a single-user path.
 */
export function buildSingleUserMaps(input: {
  user: BusinessUserRow;
  authByEmail: Map<string, { id: string; email: string | null }>;
  duplicateEmails?: Set<string>;
}): {
  emailCounts: Map<string, number>;
  authByEmail: Map<string, { id: string; email: string | null }>;
} {
  const emailCounts = new Map<string, number>();
  const email = normalizeMigrationEmail(input.user.email);
  if (email) {
    emailCounts.set(email, input.duplicateEmails?.has(email) ? 2 : 1);
  }
  return { emailCounts, authByEmail: input.authByEmail };
}

export async function migrateOneUser(input: {
  mode: MigrationMode;
  user: BusinessUserRow;
  emailCounts: Map<string, number>;
  authByEmail: Map<string, { id: string; email: string | null }>;
  authAdmin: AuthAdminPort;
  businessDb: BusinessDbPort;
  /** When true, passwordHash is required in-memory for bcrypt import but never logged. */
  passwordHashForImport?: string | null;
}): Promise<MigrateOneResult> {
  const classified = classifyUser({
    user: input.user,
    emailCounts: input.emailCounts,
    authByEmail: input.authByEmail,
  });

  if (!isExecutableCategory(classified.category)) {
    return {
      classified,
      report: reportFrom(classified, {
        outcome: classified.outcome,
        authUserId: classified.alreadyLinkedAuthUserId,
        failureReason:
          classified.outcome === "ALREADY_MIGRATED" ? null : classified.reason,
      }),
      createdAuthUserId: null,
      linked: Boolean(classified.alreadyLinkedAuthUserId),
      compensated: false,
    };
  }

  // Dry-run: propose only.
  if (input.mode === "dry-run") {
    return {
      classified,
      report: reportFrom(classified, {
        outcome: classified.outcome,
        failureReason: null,
      }),
      createdAuthUserId: null,
      linked: false,
      compensated: false,
    };
  }

  // --- execute path ---
  const email = classified.emailNormalized;
  if (!email) {
    return {
      classified,
      report: reportFrom(classified, {
        outcome: "BUSINESS_CONFLICT",
        failureReason: "Missing normalized email at execute time",
      }),
      createdAuthUserId: null,
      linked: false,
      compensated: false,
    };
  }

  // Re-check Auth conflict live.
  const liveAuth = await input.authAdmin.findAuthUserByEmail(email);
  if (liveAuth) {
    const owner = await input.businessDb.findUserByAuthId(liveAuth.id);
    if (owner && owner.id === input.user.id) {
      return {
        classified: {
          ...classified,
          category: "G_ALREADY_LINKED",
          proposedAction: "SKIP_ALREADY_LINKED",
          outcome: "ALREADY_MIGRATED",
          alreadyLinkedAuthUserId: liveAuth.id,
        },
        report: reportFrom(classified, {
          outcome: "ALREADY_MIGRATED",
          authUserId: liveAuth.id,
        }),
        createdAuthUserId: null,
        linked: true,
        compensated: false,
      };
    }
    return {
      classified: {
        ...classified,
        category: "H_AUTH_EMAIL_CONFLICT",
        proposedAction: "SKIP_CONFLICT",
        outcome: "AUTH_CONFLICT",
        conflictAuthUserId: liveAuth.id,
      },
      report: reportFrom(classified, {
        outcome: "AUTH_CONFLICT",
        authUserId: liveAuth.id,
        failureReason: "Live auth.users email conflict",
      }),
      createdAuthUserId: null,
      linked: false,
      compensated: false,
    };
  }

  // Business link conflict: Auth UUID already claimed (should be rare for new creates).
  if (input.user.supabaseAuthUserId) {
    return {
      classified,
      report: reportFrom(classified, {
        outcome: "ALREADY_MIGRATED",
        authUserId: input.user.supabaseAuthUserId,
      }),
      createdAuthUserId: null,
      linked: true,
      compensated: false,
    };
  }

  const passwordInfo = inspectPasswordHash(
    input.passwordHashForImport ?? input.user.passwordHash
  );
  const metadata = appMetadataFor(input.user.id);

  let createdAuthUserId: string | null = null;
  try {
    if (passwordInfo.kind === "bcrypt") {
      const hash = input.passwordHashForImport ?? input.user.passwordHash;
      if (!hash) {
        throw new Error("Missing bcrypt hash for import");
      }
      const created = await input.authAdmin.createUserWithPasswordHash({
        email,
        passwordHash: hash,
        emailConfirm: true,
        appMetadata: metadata,
      });
      createdAuthUserId = created.id;
    } else if (passwordInfo.kind === "placeholder") {
      const created = await input.authAdmin.createUserWithoutPassword({
        email,
        emailConfirm: true,
        appMetadata: {
          ...metadata,
          password_reset_required: true,
        },
      });
      createdAuthUserId = created.id;
    } else {
      return {
        classified,
        report: reportFrom(classified, {
          outcome: "INVALID_PASSWORD_HASH",
          failureReason: `Unsupported password kind: ${passwordInfo.kind}`,
        }),
        createdAuthUserId: null,
        linked: false,
        compensated: false,
      };
    }

    // Link business User — refuses overwrite via port implementation.
    await input.businessDb.linkUser(input.user.id, createdAuthUserId);

    const verified = await input.businessDb.findUserByAuthId(createdAuthUserId);
    if (!verified || verified.id !== input.user.id) {
      throw new Error("Post-link verification failed");
    }

    const executeOutcome: MigrationOutcome =
      passwordInfo.kind === "placeholder"
        ? "RESET_REQUIRED"
        : input.user.isActive
          ? "READY"
          : "INACTIVE";

    // READY after successful execute means "migrated successfully" for active bcrypt.
    // For reporting clarity, map successful active bcrypt to a stable success via READY
    // (tooling treats post-execute READY as migrated in execute mode).
    const successOutcome: MigrationOutcome =
      executeOutcome === "READY" ? "READY" : executeOutcome;

    return {
      classified,
      report: reportFrom(classified, {
        outcome: successOutcome,
        authUserId: createdAuthUserId,
      }),
      createdAuthUserId,
      linked: true,
      compensated: false,
    };
  } catch (error) {
    let compensated = false;
    if (createdAuthUserId) {
      try {
        // Best-effort: clear partial business link if any, then remove Auth identity.
        try {
          const partial = await input.businessDb.findUserById(input.user.id);
          if (partial?.supabaseAuthUserId === createdAuthUserId) {
            await input.businessDb.unlinkUser(input.user.id);
          }
        } catch {
          // continue to Auth delete
        }
        await input.authAdmin.deleteUser(createdAuthUserId);
        compensated = true;
      } catch {
        compensated = false;
      }
    }

    return {
      classified,
      report: reportFrom(classified, {
        outcome: compensated ? "ROLLED_BACK" : "FAILED",
        authUserId: createdAuthUserId,
        failureReason:
          error instanceof Error ? error.message : "Unknown migration failure",
        compensated,
      }),
      createdAuthUserId: compensated ? null : createdAuthUserId,
      linked: false,
      compensated,
    };
  }
}

/**
 * Select executable candidates for limited/batch runs.
 * Order is stable by userId for determinism.
 */
export function selectExecutableCandidates(
  classified: ClassifiedUser[],
  opts: { userId?: string | null; limit?: number | null }
): ClassifiedUser[] {
  let rows = classified.filter((row) => isExecutableCategory(row.category));
  rows = [...rows].sort((a, b) => a.userId.localeCompare(b.userId));
  if (opts.userId) {
    rows = rows.filter((row) => row.userId === opts.userId);
  }
  if (opts.limit != null) {
    rows = rows.slice(0, opts.limit);
  }
  return rows;
}

export function outcomeAfterSuccessfulExecute(
  proposedAction: ProposedAction,
  isActive: boolean
): MigrationOutcome {
  if (
    proposedAction === "IMPORT_RESET_REQUIRED_AND_LINK" ||
    proposedAction === "IMPORT_INACTIVE_RESET_REQUIRED_AND_LINK"
  ) {
    return isActive ? "RESET_REQUIRED" : "INACTIVE";
  }
  if (
    proposedAction === "IMPORT_INACTIVE_BCRYPT_AND_LINK" ||
    !isActive
  ) {
    return "INACTIVE";
  }
  return "READY";
}
