/**
 * Masked database / Supabase identity parsing.
 * Never returns passwords, keys, or full connection strings.
 */

import { STAGING_PROJECT_REF } from "@/lib/migration/production/constants";

export type HostFamily =
  | "neon"
  | "supabase-pooler"
  | "supabase-direct"
  | "supabase-api"
  | "other"
  | "invalid";

export type MaskedDbIdentity = {
  present: boolean;
  hostFamily: HostFamily;
  hostMasked: string | null;
  port: string | null;
  database: string | null;
  poolerModeHint: "session-likely" | "transaction-likely" | "unknown" | null;
  projectRef: string | null;
  projectRefMasked: string | null;
  isStagingRef: boolean;
  isNeon: boolean;
  isSupabase: boolean;
  usernameSuffixRef: string | null;
};

export type MaskedApiIdentity = {
  present: boolean;
  hostMasked: string | null;
  projectRef: string | null;
  projectRefMasked: string | null;
  isStagingRef: boolean;
};

export function maskProjectRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (ref === STAGING_PROJECT_REF) return STAGING_PROJECT_REF;
  if (ref.length < 8) return `${ref.slice(0, 2)}…`;
  return `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

export function extractProjectRefFromDbUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const user = decodeURIComponent(u.username || "");
    if (user.startsWith("postgres.")) {
      const suffix = user.slice("postgres.".length).trim();
      if (suffix) return suffix;
    }
    const direct = u.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/i);
    if (direct) return direct[1];
    const apiLike = u.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    if (apiLike) return apiLike[1];
    return null;
  } catch {
    return null;
  }
}

export function extractProjectRefFromApiUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const m = u.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function maskHost(hostname: string, projectRef: string | null): string {
  if (/neon\.tech$/i.test(hostname)) {
    const first = hostname.split(".")[0] ?? "neon";
    return `neon(${first}.***)`;
  }
  if (/supabase/i.test(hostname)) {
    return `supabase(${maskProjectRef(projectRef) ?? "unknown"})`;
  }
  return `other(${hostname.slice(0, 12)}…)`;
}

export function inspectDbUrl(raw: string | null | undefined): MaskedDbIdentity {
  if (!raw) {
    return {
      present: false,
      hostFamily: "invalid",
      hostMasked: null,
      port: null,
      database: null,
      poolerModeHint: null,
      projectRef: null,
      projectRefMasked: null,
      isStagingRef: false,
      isNeon: false,
      isSupabase: false,
      usernameSuffixRef: null,
    };
  }

  try {
    const u = new URL(raw);
    const host = u.hostname;
    const isNeon = /\.neon\.tech$/i.test(host);
    const isPooler = /pooler\.supabase\.com$/i.test(host);
    const isDirect = /^db\.[a-z0-9]+\.supabase\.co$/i.test(host);
    const isSupabase = isPooler || isDirect || /supabase\.(com|co)/i.test(host);
    const projectRef = extractProjectRefFromDbUrl(raw);
    const user = decodeURIComponent(u.username || "");
    const usernameSuffixRef = user.startsWith("postgres.")
      ? user.slice("postgres.".length)
      : null;

    let hostFamily: HostFamily = "other";
    if (isNeon) hostFamily = "neon";
    else if (isPooler) hostFamily = "supabase-pooler";
    else if (isDirect) hostFamily = "supabase-direct";
    else if (isSupabase) hostFamily = "supabase-api";

    const port = u.port || "5432";
    let poolerModeHint: MaskedDbIdentity["poolerModeHint"] = null;
    if (isPooler) {
      poolerModeHint =
        port === "6543"
          ? "transaction-likely"
          : port === "5432"
            ? "session-likely"
            : "unknown";
    }

    return {
      present: true,
      hostFamily,
      hostMasked: maskHost(host, projectRef),
      port,
      database: (u.pathname || "/").replace(/^\//, "") || null,
      poolerModeHint,
      projectRef,
      projectRefMasked: maskProjectRef(projectRef),
      isStagingRef: projectRef === STAGING_PROJECT_REF,
      isNeon,
      isSupabase,
      usernameSuffixRef,
    };
  } catch {
    return {
      present: true,
      hostFamily: "invalid",
      hostMasked: null,
      port: null,
      database: null,
      poolerModeHint: null,
      projectRef: null,
      projectRefMasked: null,
      isStagingRef: false,
      isNeon: false,
      isSupabase: false,
      usernameSuffixRef: null,
    };
  }
}

export function inspectApiUrl(raw: string | null | undefined): MaskedApiIdentity {
  if (!raw) {
    return {
      present: false,
      hostMasked: null,
      projectRef: null,
      projectRefMasked: null,
      isStagingRef: false,
    };
  }
  try {
    const u = new URL(raw);
    const projectRef = extractProjectRefFromApiUrl(raw);
    return {
      present: true,
      hostMasked: maskHost(u.hostname, projectRef),
      projectRef,
      projectRefMasked: maskProjectRef(projectRef),
      isStagingRef: projectRef === STAGING_PROJECT_REF,
    };
  } catch {
    return {
      present: true,
      hostMasked: null,
      projectRef: null,
      projectRefMasked: null,
      isStagingRef: false,
    };
  }
}

/** Stable fingerprint of an identity for same-DB detection (no secrets). */
export function identityFingerprint(identity: MaskedDbIdentity): string | null {
  if (!identity.present) return null;
  return [
    identity.hostFamily,
    identity.hostMasked ?? "",
    identity.port ?? "",
    identity.database ?? "",
    identity.projectRefMasked ?? "",
  ].join("|");
}
