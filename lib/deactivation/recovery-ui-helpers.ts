export type RecoveryOutcomeStatus = "recovered" | "already_recovered";

export type RecoveryResponse = {
  ok?: boolean;
  requiresLogin?: boolean;
  outcome?: {
    status?: RecoveryOutcomeStatus;
    userId?: string;
    companyId?: string;
    recoveredAt?: string;
  };
};

export type RecoverySubmitGuard = {
  inFlight: boolean;
};

export function buildRecoveryRequestBody(): undefined {
  return undefined;
}

export function recoveryRequestHasNoClientIdentifiers(body: unknown): boolean {
  if (body === undefined || body === null) {
    return true;
  }

  if (typeof body !== "object") {
    return false;
  }

  const record = body as Record<string, unknown>;
  return !("userId" in record) && !("companyId" in record) && !("ownerId" in record);
}

export function isRecoverySuccessOutcome(status: string | undefined): boolean {
  return status === "recovered" || status === "already_recovered";
}

export function shouldTreatRecoveryAsSuccess(response: RecoveryResponse): boolean {
  return response.ok === true && isRecoverySuccessOutcome(response.outcome?.status);
}

export function shouldRedirectToLoginAfterRecovery(response: RecoveryResponse): boolean {
  return shouldTreatRecoveryAsSuccess(response) && response.requiresLogin === true;
}

export function buildRecoveryLoginRedirectUrl(): string {
  return "/login?type=employer&recovered=1";
}

export function mapRecoveryError(error: string): string {
  switch (error) {
    case "MISSING_DEACTIVATED_ACCESS":
    case "Unauthorized":
      return "Brak uprawnień do odzyskania konta. Zaloguj się ponownie jako właściciel zdezaktywowanej firmy.";
    case "RECOVERY_WINDOW_EXPIRED":
      return "Okres odzyskiwania tego konta zakończył się. Konto nie może zostać odzyskane za pomocą tego procesu.";
    case "MULTIPLE_OWNED_COMPANIES":
      return "Posiadasz wiele firm. Skontaktuj się z pomocą techniczną, aby odzyskać konto.";
    case "FORBIDDEN":
    case "NOT_OWNER":
    case "NOT_DEACTIVATED":
      return "Nie masz uprawnień do odzyskania tego konta.";
    case "NETWORK_ERROR":
      return "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.";
    case "INTERNAL_ERROR":
      return "Nie udało się odzyskać konta. Spróbuj ponownie później.";
    default:
      if (error.startsWith("HTTP_")) {
        return "Nie udało się odzyskać konta. Spróbuj ponownie później.";
      }
      return "Nie udało się odzyskać konta. Spróbuj ponownie później.";
  }
}

export function createRecoverySubmitGuard(): RecoverySubmitGuard {
  return { inFlight: false };
}

export function canSubmitRecovery(guard: RecoverySubmitGuard): boolean {
  return !guard.inFlight;
}

export function beginRecoverySubmit(guard: RecoverySubmitGuard): RecoverySubmitGuard | null {
  if (guard.inFlight) {
    return null;
  }

  return { inFlight: true };
}

export function finishRecoverySubmit(guard: RecoverySubmitGuard): RecoverySubmitGuard {
  return { ...guard, inFlight: false };
}
