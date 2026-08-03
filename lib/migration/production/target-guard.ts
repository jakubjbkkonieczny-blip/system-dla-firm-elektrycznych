/**
 * Production target safety guard.
 *
 * Write tooling must pass an explicit --confirm-production-project-ref <ref>.
 * Staging ref is always refused. Neon is refused as a Supabase production target.
 */

import { STAGING_PROJECT_REF } from "@/lib/migration/production/constants";
import {
  extractProjectRefFromApiUrl,
  extractProjectRefFromDbUrl,
  inspectApiUrl,
  inspectDbUrl,
  maskProjectRef,
  type MaskedApiIdentity,
  type MaskedDbIdentity,
} from "@/lib/migration/production/identity";

export class ProductionTargetGuardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProductionTargetGuardError";
    this.code = code;
  }
}

export type ProductionTargetInput = {
  /** Explicit operator confirmation (CLI --confirm-production-project-ref). */
  confirmProductionProjectRef?: string | null;
  /** Expected production project ref from operator config (optional cross-check). */
  expectedProductionProjectRef?: string | null;
  databaseUrl?: string | null;
  directUrl?: string | null;
  nextPublicSupabaseUrl?: string | null;
  /** When true, require confirmProductionProjectRef for write-capable paths. */
  requireWriteConfirmation?: boolean;
  /** Allow read-only identity inspection without confirmation. */
  allowUnconfirmedRead?: boolean;
};

export type ProductionTargetAssessment = {
  ok: boolean;
  writesAllowed: boolean;
  projectRef: string | null;
  projectRefMasked: string | null;
  database: MaskedDbIdentity;
  direct: MaskedDbIdentity;
  api: MaskedApiIdentity;
  reasons: string[];
  status:
    | "PRODUCTION_TARGET_OK"
    | "PRODUCTION_TARGET_IDENTITY_UNCONFIRMED"
    | "PRODUCTION_TARGET_REFUSED";
};

function refuse(code: string, message: string): never {
  throw new ProductionTargetGuardError(code, message);
}

function normalizeRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

/**
 * Assess / assert a candidate production Supabase target.
 * Never prints credentials.
 */
export function assessProductionTarget(
  input: ProductionTargetInput
): ProductionTargetAssessment {
  const reasons: string[] = [];
  const confirm = normalizeRef(input.confirmProductionProjectRef);
  const expected = normalizeRef(input.expectedProductionProjectRef);
  const database = inspectDbUrl(input.databaseUrl);
  const direct = inspectDbUrl(input.directUrl);
  const api = inspectApiUrl(input.nextPublicSupabaseUrl);

  const refs = [
    confirm,
    expected,
    database.projectRef,
    direct.projectRef,
    api.projectRef,
    database.usernameSuffixRef,
    direct.usernameSuffixRef,
  ].filter((r): r is string => Boolean(r));

  if (refs.some((r) => r === STAGING_PROJECT_REF)) {
    reasons.push(
      `Staging project ref ${STAGING_PROJECT_REF} must never be used as production target`
    );
  }

  if (database.present && database.isNeon) {
    reasons.push("DATABASE_URL points at Neon; production Supabase target required");
  }
  if (direct.present && direct.isNeon) {
    reasons.push("DIRECT_URL points at Neon; production Supabase target required");
  }
  if (database.present && !database.isSupabase && !database.isNeon) {
    reasons.push("DATABASE_URL is neither Neon nor Supabase");
  }
  if (database.present && database.hostFamily === "invalid") {
    reasons.push("DATABASE_URL could not be parsed");
  }

  const distinct = new Set(refs.filter((r) => r !== STAGING_PROJECT_REF));
  if (distinct.size > 1) {
    reasons.push(
      `Disagreeing project refs: ${[...distinct].map((r) => maskProjectRef(r)).join(", ")}`
    );
  }

  const projectRef = confirm ?? expected ?? database.projectRef ?? api.projectRef ?? null;
  const requireWrite = Boolean(input.requireWriteConfirmation);
  const allowUnconfirmedRead = input.allowUnconfirmedRead !== false;

  if (requireWrite && !confirm) {
    reasons.push(
      "Missing --confirm-production-project-ref <ref>; writes refused (not inferred from env)"
    );
  }

  if (requireWrite && confirm && confirm === STAGING_PROJECT_REF) {
    reasons.push("Confirmed ref is staging; writes refused");
  }

  if (
    requireWrite &&
    confirm &&
    database.projectRef &&
    database.projectRef !== confirm
  ) {
    reasons.push(
      `Confirmed ref ${maskProjectRef(confirm)} disagrees with DATABASE_URL ref ${maskProjectRef(database.projectRef)}`
    );
  }

  if (
    requireWrite &&
    confirm &&
    api.projectRef &&
    api.projectRef !== confirm
  ) {
    reasons.push(
      `Confirmed ref ${maskProjectRef(confirm)} disagrees with NEXT_PUBLIC_SUPABASE_URL ref ${maskProjectRef(api.projectRef)}`
    );
  }

  if (
    requireWrite &&
    confirm &&
    database.usernameSuffixRef &&
    database.usernameSuffixRef !== confirm
  ) {
    reasons.push(
      `Confirmed ref ${maskProjectRef(confirm)} disagrees with pooler username suffix ${maskProjectRef(database.usernameSuffixRef)}`
    );
  }

  if (
    requireWrite &&
    expected &&
    confirm &&
    expected !== confirm
  ) {
    reasons.push(
      `Confirmed ref ${maskProjectRef(confirm)} disagrees with expected production ref ${maskProjectRef(expected)}`
    );
  }

  if (!projectRef && !database.isSupabase) {
    reasons.push("PRODUCTION_TARGET_IDENTITY_UNCONFIRMED");
  }

  const refused = reasons.length > 0;
  const unconfirmed =
    !refused &&
    !confirm &&
    (!projectRef || projectRef === STAGING_PROJECT_REF);

  if (refused) {
    return {
      ok: false,
      writesAllowed: false,
      projectRef: projectRef === STAGING_PROJECT_REF ? null : projectRef,
      projectRefMasked: maskProjectRef(
        projectRef === STAGING_PROJECT_REF ? null : projectRef
      ),
      database,
      direct,
      api,
      reasons,
      status: "PRODUCTION_TARGET_REFUSED",
    };
  }

  if (unconfirmed) {
    return {
      ok: allowUnconfirmedRead,
      writesAllowed: false,
      projectRef: null,
      projectRefMasked: null,
      database,
      direct,
      api,
      reasons: ["PRODUCTION_TARGET_IDENTITY_UNCONFIRMED"],
      status: "PRODUCTION_TARGET_IDENTITY_UNCONFIRMED",
    };
  }

  return {
    ok: true,
    writesAllowed: Boolean(confirm) && requireWrite,
    projectRef,
    projectRefMasked: maskProjectRef(projectRef),
    database,
    direct,
    api,
    reasons: [],
    status: "PRODUCTION_TARGET_OK",
  };
}

/** Assert production Supabase target for write tooling. Throws on refusal. */
export function assertProductionWriteTarget(input: ProductionTargetInput): {
  projectRef: string;
  assessment: ProductionTargetAssessment;
} {
  const assessment = assessProductionTarget({
    ...input,
    requireWriteConfirmation: true,
    allowUnconfirmedRead: false,
  });
  if (!assessment.ok || assessment.status !== "PRODUCTION_TARGET_OK") {
    refuse(
      assessment.status,
      assessment.reasons.join("; ") || "Production target refused"
    );
  }
  if (!assessment.projectRef) {
    refuse(
      "PRODUCTION_TARGET_IDENTITY_UNCONFIRMED",
      "Production project ref could not be determined"
    );
  }
  if (!assessment.writesAllowed) {
    refuse(
      "PRODUCTION_WRITES_REFUSED",
      "Production writes require --confirm-production-project-ref"
    );
  }
  return { projectRef: assessment.projectRef, assessment };
}

/** Assert Neon read-only source for business export. */
export function assertNeonSource(databaseUrl: string | null | undefined): MaskedDbIdentity {
  const identity = inspectDbUrl(databaseUrl);
  if (!identity.present) {
    refuse("NEON_SOURCE_MISSING", "Source DATABASE_URL missing");
  }
  if (!identity.isNeon) {
    refuse(
      "NEON_SOURCE_REQUIRED",
      `Source must be Neon; got ${identity.hostFamily} (${identity.hostMasked ?? "unknown"})`
    );
  }
  if (identity.isStagingRef) {
    refuse("STAGING_REFUSED", "Staging Supabase ref is not a valid Neon source");
  }
  return identity;
}

/** Assert destination is Supabase and not staging (read-only preflight). */
export function assertSupabaseDestination(
  databaseUrl: string | null | undefined,
  opts?: { allowUnconfirmed?: boolean; confirmRef?: string | null }
): MaskedDbIdentity {
  const identity = inspectDbUrl(databaseUrl);
  if (!identity.present) {
    refuse("SUPABASE_DEST_MISSING", "Destination DATABASE_URL missing");
  }
  if (identity.isNeon) {
    refuse("SUPABASE_DEST_IS_NEON", "Destination must be Supabase, not Neon");
  }
  if (!identity.isSupabase) {
    refuse(
      "SUPABASE_DEST_REQUIRED",
      `Destination must be Supabase; got ${identity.hostFamily}`
    );
  }
  if (identity.isStagingRef || identity.projectRef === STAGING_PROJECT_REF) {
    refuse(
      "STAGING_REFUSED",
      `Destination staging ref ${STAGING_PROJECT_REF} refused`
    );
  }
  if (!opts?.allowUnconfirmed) {
    const confirm = normalizeRef(opts?.confirmRef);
    if (!confirm) {
      refuse(
        "PRODUCTION_TARGET_IDENTITY_UNCONFIRMED",
        "Destination requires --confirm-production-project-ref"
      );
    }
    if (identity.projectRef && identity.projectRef !== confirm) {
      refuse(
        "PROJECT_REF_MISMATCH",
        `Confirmed ref ${maskProjectRef(confirm)} disagrees with destination ${maskProjectRef(identity.projectRef)}`
      );
    }
  }
  return identity;
}

export function parseConfirmProductionProjectRef(
  argv: string[]
): string | null {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--confirm-production-project-ref") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        refuse(
          "CONFIRM_REF_MISSING_VALUE",
          "--confirm-production-project-ref requires a value"
        );
      }
      return value.trim().toLowerCase();
    }
  }
  return null;
}

export function refsFromEnv(env: {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
}): {
  databaseRef: string | null;
  directRef: string | null;
  apiRef: string | null;
} {
  return {
    databaseRef: env.DATABASE_URL
      ? extractProjectRefFromDbUrl(env.DATABASE_URL)
      : null,
    directRef: env.DIRECT_URL
      ? extractProjectRefFromDbUrl(env.DIRECT_URL)
      : null,
    apiRef: env.NEXT_PUBLIC_SUPABASE_URL
      ? extractProjectRefFromApiUrl(env.NEXT_PUBLIC_SUPABASE_URL)
      : null,
  };
}
