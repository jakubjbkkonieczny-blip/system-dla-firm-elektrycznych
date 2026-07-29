/**
 * Structured Auth error categories for Supabase mode (staging observation).
 * Never include passwords, tokens, cookies, or admin keys in diagnostics.
 */

export const AUTH_ERROR_CATEGORIES = [
  "AUTH_CONFIGURATION_ERROR",
  "AUTH_UNAUTHENTICATED",
  "AUTH_CALLBACK_INVALID",
  "AUTH_CALLBACK_EXPIRED",
  "AUTH_USER_UNLINKED",
  "AUTH_USER_CONFLICT",
  "AUTH_USER_INACTIVE",
  "AUTH_EMAIL_CONFLICT",
  "AUTH_PROVIDER_UNAVAILABLE",
  "AUTH_PROVISIONING_FAILED",
  "AUTH_PASSWORD_RECOVERY_INVALID",
  "AUTH_PASSWORD_REAUTH_REQUIRED",
  "AUTH_MODE_MISMATCH",
] as const;

export type AuthErrorCategory = (typeof AUTH_ERROR_CATEGORIES)[number];

export class SupabaseAuthError extends Error {
  readonly category: AuthErrorCategory;
  readonly publicCode: string;
  readonly httpStatus: number;

  constructor(
    category: AuthErrorCategory,
    options?: {
      publicCode?: string;
      httpStatus?: number;
      message?: string;
      cause?: unknown;
    }
  ) {
    super(options?.message ?? category);
    this.name = "SupabaseAuthError";
    this.category = category;
    this.publicCode = options?.publicCode ?? category;
    this.httpStatus = options?.httpStatus ?? defaultStatus(category);
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function defaultStatus(category: AuthErrorCategory): number {
  switch (category) {
    case "AUTH_CONFIGURATION_ERROR":
      return 503;
    case "AUTH_UNAUTHENTICATED":
      return 401;
    case "AUTH_CALLBACK_INVALID":
    case "AUTH_CALLBACK_EXPIRED":
    case "AUTH_PASSWORD_RECOVERY_INVALID":
      return 400;
    case "AUTH_USER_UNLINKED":
    case "AUTH_USER_CONFLICT":
    case "AUTH_EMAIL_CONFLICT":
      return 403;
    case "AUTH_USER_INACTIVE":
      return 403;
    case "AUTH_PROVIDER_UNAVAILABLE":
    case "AUTH_PROVISIONING_FAILED":
      return 503;
    case "AUTH_PASSWORD_REAUTH_REQUIRED":
      return 401;
    case "AUTH_MODE_MISMATCH":
      return 409;
    default:
      return 500;
  }
}

/** Safe user-facing Polish messages — no provider internals. */
export function publicMessageForAuthError(category: AuthErrorCategory): string {
  switch (category) {
    case "AUTH_CONFIGURATION_ERROR":
      return "Uwierzytelnianie jest tymczasowo niedostępne.";
    case "AUTH_UNAUTHENTICATED":
      return "Sesja wygasła. Zaloguj się ponownie.";
    case "AUTH_CALLBACK_INVALID":
    case "AUTH_CALLBACK_EXPIRED":
      return "Link potwierdzający jest nieprawidłowy lub wygasł.";
    case "AUTH_USER_UNLINKED":
      return "Konto nie jest jeszcze gotowe. Skontaktuj się z pomocą techniczną.";
    case "AUTH_USER_CONFLICT":
    case "AUTH_EMAIL_CONFLICT":
      return "Nie można dokończyć logowania. Skontaktuj się z pomocą techniczną.";
    case "AUTH_USER_INACTIVE":
      return "To konto jest wyłączone.";
    case "AUTH_PROVIDER_UNAVAILABLE":
      return "Uwierzytelnianie jest tymczasowo niedostępne. Spróbuj ponownie później.";
    case "AUTH_PROVISIONING_FAILED":
      return "Nie udało się dokończyć rejestracji. Spróbuj ponownie.";
    case "AUTH_PASSWORD_RECOVERY_INVALID":
      return "Link do resetu hasła jest nieprawidłowy lub wygasł.";
    case "AUTH_PASSWORD_REAUTH_REQUIRED":
      return "Aby zmienić hasło, potwierdź tożsamość ponownie.";
    case "AUTH_MODE_MISMATCH":
      return "Tryb uwierzytelniania jest niedostępny.";
    default:
      return "Wystąpił błąd uwierzytelniania.";
  }
}

/** Sanitize provider errors — never forward raw Auth messages to clients. */
export function classifyProviderAuthError(
  error: { message?: string; status?: number; code?: string } | null | undefined
): AuthErrorCategory {
  if (!error) return "AUTH_PROVIDER_UNAVAILABLE";
  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  if (
    code.includes("expired") ||
    message.includes("expired") ||
    message.includes("otp_expired")
  ) {
    return "AUTH_CALLBACK_EXPIRED";
  }
  if (
    code.includes("invalid") ||
    message.includes("invalid") ||
    message.includes("token") ||
    error.status === 400
  ) {
    return "AUTH_CALLBACK_INVALID";
  }
  if (error.status === 429 || message.includes("rate")) {
    return "AUTH_PROVIDER_UNAVAILABLE";
  }
  return "AUTH_PROVIDER_UNAVAILABLE";
}

export function logAuthDiagnostic(
  category: AuthErrorCategory,
  detail?: Record<string, string | number | boolean | null | undefined>
): void {
  const safe: Record<string, string | number | boolean | null> = { category };
  if (detail) {
    for (const [key, value] of Object.entries(detail)) {
      if (value === undefined) continue;
      // Never log emails, tokens, or secrets — only opaque ids / booleans.
      if (/email|password|token|cookie|secret|key|hash/i.test(key)) continue;
      safe[key] = value;
    }
  }
  console.error("[supabase-auth]", safe);
}
