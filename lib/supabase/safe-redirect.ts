/**
 * Single reusable open-redirect guard for Auth callbacks and recovery flows.
 * Only application-internal paths are allowed.
 */

export const DEFAULT_SAFE_REDIRECT_PATH = "/login";

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * Returns a safe internal path, or the allowlisted default.
 * Rejects absolute URLs, protocol-relative, encoded bypasses, backslashes,
 * javascript/data schemes, and malformed values.
 */
export function safeRedirectPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_SAFE_REDIRECT_PATH
): string {
  if (typeof raw !== "string") return fallback;

  let value = raw.trim();
  if (!value) return fallback;

  // Reject control characters early.
  if (CONTROL_CHARS.test(value)) return fallback;

  // Decode repeatedly to catch double-encoding bypasses (cap iterations).
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
      if (CONTROL_CHARS.test(value)) return fallback;
    } catch {
      return fallback;
    }
  }

  value = value.trim();
  if (!value) return fallback;

  const lower = value.toLowerCase();

  // Scheme-based and protocol-relative rejection.
  if (
    lower.startsWith("http:") ||
    lower.startsWith("https:") ||
    lower.startsWith("//") ||
    lower.startsWith("\\\\") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("blob:")
  ) {
    return fallback;
  }

  // Backslash tricks (browsers may treat \ as /).
  if (value.includes("\\")) return fallback;

  // Must be a single absolute path (allow query + hash on same path).
  if (!value.startsWith("/")) return fallback;

  // Reject protocol-relative after slash normalization attempts: "/\\evil.com", "//evil"
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;

  // Reject embedded credentials / host-looking paths: "/@evil", "/user@host"
  // Keep simple path allowlist: path segments only.
  try {
    const probe = new URL(value, "https://vectorwork.invalid");
    if (probe.origin !== "https://vectorwork.invalid") return fallback;
    if (probe.username || probe.password) return fallback;
    // Path must still start with /
    if (!probe.pathname.startsWith("/")) return fallback;
    // Disallow path that looks like a scheme after decode: "/http://..."
    const pathLower = probe.pathname.toLowerCase();
    if (
      pathLower.includes("://") ||
      pathLower.startsWith("/http:") ||
      pathLower.startsWith("/https:")
    ) {
      return fallback;
    }
    const safePath = `${probe.pathname}${probe.search}${probe.hash}`;
    if (!safePath.startsWith("/") || safePath.startsWith("//")) return fallback;
    return safePath;
  } catch {
    return fallback;
  }
}

export function isSafeRedirectPath(raw: string | null | undefined): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  const resolved = safeRedirectPath(raw, "__REJECT__");
  return resolved !== "__REJECT__";
}
