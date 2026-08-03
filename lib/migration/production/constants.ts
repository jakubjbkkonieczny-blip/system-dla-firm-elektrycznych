/**
 * Stage 4G-B — production migration constants.
 * Staging project ref is never a valid production target.
 */

export const STAGING_PROJECT_REF = "yzezdhwffgamtmozmfse";

/** Deterministic alphabetical listing used for manifests / coverage checks. */
export const BUSINESS_TABLES = [
  "AttendanceSession",
  "AuditLog",
  "Company",
  "CompanyMember",
  "IdempotencyKey",
  "Job",
  "JobAssignment",
  "JobBudget",
  "JobBudgetItem",
  "JobBudgetLaborItem",
  "JobStage",
  "JobStageHistory",
  "JobStageNoteHistory",
  "JobStagePhoto",
  "JobStatusHistory",
  "Notification",
  "PushSubscription",
  "StripeWebhookEvent",
  "User",
  "VacationRequest",
  "VerificationToken",
] as const;

export type BusinessTable = (typeof BUSINESS_TABLES)[number];

/**
 * FK-safe import order (parents before children).
 * Matches Stage 4C coverage (all 21 public VectorWork business tables).
 */
export const IMPORT_TABLE_ORDER: readonly BusinessTable[] = [
  "User",
  "Company",
  "CompanyMember",
  "Job",
  "JobAssignment",
  "JobStage",
  "JobStageHistory",
  "JobStageNoteHistory",
  "JobStagePhoto",
  "JobStatusHistory",
  "AuditLog",
  "IdempotencyKey",
  "VerificationToken",
  "AttendanceSession",
  "VacationRequest",
  "JobBudget",
  "JobBudgetItem",
  "JobBudgetLaborItem",
  "StripeWebhookEvent",
  "Notification",
  "PushSubscription",
];

/** Critical identity / ownership columns for deterministic validation. */
export const IDENTITY_SPECS: Record<string, readonly string[]> = {
  User: [
    "id",
    "supabaseAuthUserId",
    "email",
    "stripeCustomerId",
    "stripeSubscriptionId",
    "googleAccessToken",
    "googleRefreshToken",
    "pushSubscription",
    "accountRole",
    "createdAt",
    "updatedAt",
    "deactivatedAt",
    "scheduledDeletionAt",
    "pendingDeletionAt",
  ],
  Company: [
    "id",
    "slug",
    "createdAt",
    "updatedAt",
    "deactivatedAt",
    "scheduledDeletionAt",
  ],
  CompanyMember: [
    "id",
    "companyId",
    "userId",
    "role",
    "scope",
    "isActive",
    "invitedById",
    "createdAt",
    "updatedAt",
  ],
  Job: [
    "id",
    "companyId",
    "createdByUserId",
    "jobNumber",
    "status",
    "deletedAt",
    "createdAt",
    "updatedAt",
  ],
  Notification: [
    "id",
    "userId",
    "companyId",
    "type",
    "createdAt",
    "readAt",
  ],
  AttendanceSession: [
    "id",
    "companyId",
    "userId",
    "sessionDate",
    "status",
    "createdAt",
    "updatedAt",
  ],
  VacationRequest: [
    "id",
    "companyId",
    "userId",
    "status",
    "decidedById",
    "createdAt",
    "updatedAt",
  ],
  JobBudget: [
    "id",
    "companyId",
    "jobId",
    "totalBudgetCents",
    "createdAt",
    "updatedAt",
  ],
  JobBudgetItem: [
    "id",
    "companyId",
    "jobId",
    "budgetId",
    "createdByUserId",
    "assignedUserId",
    "createdAt",
    "updatedAt",
  ],
  JobBudgetLaborItem: [
    "id",
    "companyId",
    "jobId",
    "budgetId",
    "userId",
    "createdByUserId",
    "createdAt",
    "updatedAt",
  ],
  PushSubscription: [
    "id",
    "userId",
    "endpoint",
    "p256dh",
    "auth",
    "createdAt",
    "updatedAt",
  ],
  VerificationToken: [
    "id",
    "userId",
    "purpose",
    "tokenHash",
    "expiresAt",
    "usedAt",
    "createdAt",
    "failedAttempts",
  ],
};

/** Tables useful for read-only freeze observation (no probe inserts). */
export const FREEZE_OBSERVATION_TABLES = [
  "AuditLog",
  "Job",
  "User",
  "Company",
  "StripeWebhookEvent",
  "Notification",
  "AttendanceSession",
  "IdempotencyKey",
] as const;

/** Default conservative Prisma pool params for operator / migration scripts. */
export const OPERATOR_POOL_DEFAULTS = {
  connectionLimit: 1,
  poolTimeout: 30,
} as const;
