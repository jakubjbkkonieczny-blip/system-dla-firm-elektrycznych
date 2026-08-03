/**
 * Stage 4F-Auth — identity migration types.
 *
 * Architecture (immutable):
 *   auth.users.id → User.supabaseAuthUserId → User.id
 *
 * User.id must never change. Business authorization stays on User.id.
 */

/** Mutually exclusive classification buckets (Task 2). */
export type MigrationCategory =
  | "A_BCRYPT_ACTIVE"
  | "B_BCRYPT_INACTIVE"
  | "C_PLACEHOLDER_ACTIVE"
  | "D_PLACEHOLDER_INACTIVE"
  | "E_INVALID_EMAIL"
  | "F_DUPLICATE_EMAIL"
  | "G_ALREADY_LINKED"
  | "H_AUTH_EMAIL_CONFLICT"
  | "I_EXCEPTIONAL";

/** Per-row migration outcome (Task 10). */
export type MigrationOutcome =
  | "READY"
  | "ALREADY_MIGRATED"
  | "AUTH_CONFLICT"
  | "BUSINESS_CONFLICT"
  | "INVALID_PASSWORD_HASH"
  | "RESET_REQUIRED"
  | "INACTIVE"
  | "FAILED"
  | "ROLLED_BACK"
  | "SKIPPED";

export type ProposedAction =
  | "NONE"
  | "IMPORT_BCRYPT_AND_LINK"
  | "IMPORT_RESET_REQUIRED_AND_LINK"
  | "IMPORT_INACTIVE_BCRYPT_AND_LINK"
  | "IMPORT_INACTIVE_RESET_REQUIRED_AND_LINK"
  | "SKIP_ALREADY_LINKED"
  | "SKIP_CONFLICT"
  | "SKIP_INVALID_EMAIL"
  | "SKIP_EXCEPTIONAL";

export type PasswordHashKind =
  | "bcrypt"
  | "placeholder"
  | "missing"
  | "unexpected";

export type BcryptHashInfo = {
  kind: "bcrypt";
  /** e.g. 2b */
  variant: string;
  /** e.g. 10 */
  cost: number;
  /** Safe prefix only, never the full hash — e.g. $2b$10$ */
  prefix: string;
};

export type NonBcryptHashInfo = {
  kind: "placeholder" | "missing" | "unexpected";
  /** Non-secret descriptor only */
  descriptor: string;
};

export type PasswordHashInfo = BcryptHashInfo | NonBcryptHashInfo;

export type BusinessUserRow = {
  id: string;
  email: string | null;
  passwordHash: string | null;
  supabaseAuthUserId: string | null;
  isActive: boolean;
  deactivatedAt: Date | string | null;
};

export type AuthUserRow = {
  id: string;
  email: string | null;
};

export type ClassifiedUser = {
  userId: string;
  emailMasked: string;
  emailNormalized: string | null;
  category: MigrationCategory;
  password: PasswordHashInfo;
  isActive: boolean;
  alreadyLinkedAuthUserId: string | null;
  conflictAuthUserId: string | null;
  proposedAction: ProposedAction;
  outcome: MigrationOutcome;
  reason: string;
};

export type MigrationMode = "dry-run" | "execute";

export type ParsedMigrationArgs = {
  mode: MigrationMode;
  userId: string | null;
  limit: number | null;
  batchSize: number;
  /** Required together with --execute when migrating without --user-id and without a finite --limit. */
  confirmBulkMigrate: boolean;
  help: boolean;
  raw: string[];
};

export type MigrationReportRow = {
  timestamp: string;
  userId: string;
  emailMasked: string;
  category: MigrationCategory;
  proposedAction: ProposedAction;
  outcome: MigrationOutcome;
  authUserId: string | null;
  failureReason: string | null;
  compensated: boolean;
};

export type CategoryCounts = Record<MigrationCategory, number>;

export type MigrationRunSummary = {
  stage: "4F-auth";
  mode: MigrationMode;
  at: string;
  architecture: "auth.users.id → User.supabaseAuthUserId → User.id";
  writesEnabled: boolean;
  args: Omit<ParsedMigrationArgs, "raw" | "help">;
  categoryCounts: CategoryCounts;
  outcomeCounts: Partial<Record<MigrationOutcome, number>>;
  totalConsidered: number;
  rows: MigrationReportRow[];
  rollbackManifest: RollbackManifest;
  notes: string[];
};

export type RollbackManifest = {
  batchId: string;
  createdAuthUserIds: string[];
  linkedUserIds: Array<{
    userId: string;
    previousSupabaseAuthUserId: string | null;
    newSupabaseAuthUserId: string;
  }>;
  guidance: string[];
};

export type AuthAdminPort = {
  findAuthUserByEmail: (
    normalizedEmail: string
  ) => Promise<AuthUserRow | null>;
  createUserWithPasswordHash: (input: {
    email: string;
    passwordHash: string;
    emailConfirm: boolean;
    appMetadata?: Record<string, unknown>;
  }) => Promise<{ id: string }>;
  createUserWithoutPassword: (input: {
    email: string;
    emailConfirm: boolean;
    appMetadata?: Record<string, unknown>;
  }) => Promise<{ id: string }>;
  deleteUser: (authUserId: string) => Promise<void>;
};

export type BusinessDbPort = {
  findUserById: (userId: string) => Promise<BusinessUserRow | null>;
  findUserByAuthId: (authUserId: string) => Promise<BusinessUserRow | null>;
  linkUser: (userId: string, authUserId: string) => Promise<void>;
  unlinkUser: (userId: string) => Promise<void>;
};
