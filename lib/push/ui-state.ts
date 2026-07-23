export type PushBrowserState =
  | "unsupported"
  | "permission_denied"
  | "not_enabled"
  | "enabled";

export type PushOperationState = "idle" | "enabling" | "disabling";

export const PUSH_UI_COPY = {
  deviceHint:
    "Powiadomienia możesz włączyć osobno na każdym telefonie, tablecie lub komputerze.",
  unsupported: "Ta przeglądarka lub urządzenie nie obsługuje powiadomień.",
  permissionDenied:
    "Powiadomienia są zablokowane w ustawieniach przeglądarki lub urządzenia.",
  permissionDeniedHint:
    "Aby je włączyć, zezwól VectorWork na wysyłanie powiadomień w ustawieniach przeglądarki lub urządzenia.",
  notEnabled: "Powiadomienia są wyłączone na tym urządzeniu.",
  enabled: "Powiadomienia są włączone na tym urządzeniu.",
  enabledBadge: "Włączone",
  enableButton: "Włącz powiadomienia",
  enablingButton: "Włączanie…",
  disableButton: "Wyłącz powiadomienia",
  disablingButton: "Wyłączanie…",
  subscribeSuccess: "Powiadomienia zostały włączone na tym urządzeniu.",
  unsubscribeSuccess: "Powiadomienia zostały wyłączone na tym urządzeniu.",
  subscribeError: "Nie udało się włączyć powiadomień. Spróbuj ponownie za chwilę.",
  unsubscribeError: "Nie udało się wyłączyć powiadomień. Spróbuj ponownie za chwilę.",
} as const;

export function resolvePushBrowserState(input: {
  supported: boolean;
  permission: NotificationPermission | null;
  hasSubscription: boolean;
}): PushBrowserState {
  if (!input.supported) return "unsupported";
  if (input.permission === "denied") return "permission_denied";
  if (input.hasSubscription) return "enabled";
  return "not_enabled";
}

export function mapPushSubscribeErrorToUserMessage(reason: string): string {
  if (reason === "NOT_SUPPORTED") return PUSH_UI_COPY.unsupported;
  if (reason === "PERMISSION_DENIED") return PUSH_UI_COPY.permissionDenied;
  return PUSH_UI_COPY.subscribeError;
}

export function mapPushUnsubscribeErrorToUserMessage(reason: string): string {
  if (reason === "NOT_SUPPORTED") return PUSH_UI_COPY.unsupported;
  return PUSH_UI_COPY.unsubscribeError;
}
