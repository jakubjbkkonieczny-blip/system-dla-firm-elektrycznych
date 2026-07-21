import {
  DEACTIVATION_CONFIRMATIONS,
  type DeactivationConfirmationId,
} from "./deactivation-ui-copy";

export type DeactivationFlowStep =
  | "warning"
  | "emailVerification"
  | "consequences"
  | "confirmations"
  | "password"
  | "finalConfirmation";

export type DeactivationConfirmationState = Record<DeactivationConfirmationId, boolean>;

export function createEmptyConfirmationState(): DeactivationConfirmationState {
  return DEACTIVATION_CONFIRMATIONS.reduce(
    (acc, item) => {
      acc[item.id] = false;
      return acc;
    },
    {} as DeactivationConfirmationState
  );
}

export function allConfirmationsChecked(state: DeactivationConfirmationState): boolean {
  return DEACTIVATION_CONFIRMATIONS.every((item) => state[item.id]);
}

export function isPasswordStepValid(password: string): boolean {
  return password.trim().length > 0;
}

export function isVerificationCodeValid(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export function buildDeactivationFinalRequestBody(currentPassword: string): {
  currentPassword: string;
} {
  return { currentPassword };
}

export function mapVerificationStartError(error: string): string {
  switch (error) {
    case "TOO_MANY_REQUESTS":
      return "Kod można wysłać ponownie dopiero po krótkiej przerwie. Spróbuj za chwilę.";
    case "FORBIDDEN":
    case "NOT_OWNER":
      return "Nie masz uprawnień do dezaktywacji tego konta.";
    case "Unauthorized":
      return "Sesja wygasła. Odśwież stronę i zaloguj się ponownie.";
    default:
      return "Nie udało się wysłać kodu weryfikacyjnego. Spróbuj ponownie.";
  }
}

export function mapVerificationConfirmError(error: string): string {
  switch (error) {
    case "INVALID_CODE":
      return "Nieprawidłowy lub wygasły kod. Sprawdź kod albo wyślij nowy.";
    case "MISSING_CODE":
      return "Wpisz 6-cyfrowy kod weryfikacyjny.";
    case "Unauthorized":
      return "Sesja wygasła. Odśwież stronę i zaloguj się ponownie.";
    default:
      return "Nie udało się potwierdzić kodu. Spróbuj ponownie.";
  }
}

export function mapDeactivationFinalError(error: string): string {
  switch (error) {
    case "INVALID_PASSWORD":
      return "Nieprawidłowe hasło.";
    case "EMAIL_VERIFICATION_REQUIRED":
      return "Wymagana jest ponowna weryfikacja e-mail. Wróć do poprzedniego kroku.";
    case "FORBIDDEN":
    case "NOT_OWNER":
      return "Nie masz uprawnień do dezaktywacji tego konta.";
    case "MULTIPLE_OWNED_COMPANIES":
      return "Posiadasz wiele firm. Skontaktuj się z pomocą techniczną.";
    case "MISSING_CURRENT_PASSWORD":
      return "Podaj aktualne hasło.";
    case "Unauthorized":
      return "Sesja wygasła. Odśwież stronę i zaloguj się ponownie.";
    default:
      return "Nie udało się dezaktywować konta. Spróbuj ponownie.";
  }
}

export type DeactivationFinalResponse = {
  ok?: boolean;
  warning?: string;
  outcome?: {
    stripe?: string;
  };
};

export function hasStripeCancellationWarning(response: DeactivationFinalResponse): boolean {
  return (
    response.warning === "STRIPE_CANCELLATION_FAILED" ||
    response.outcome?.stripe === "cancellation_failed"
  );
}
