export const AUTH_SESSION_REFRESH_MIN_INTERVAL_MS = 2000;

export function shouldRefreshSessionOnFocus(input: {
  visibilityState: DocumentVisibilityState;
  now: number;
  lastRefreshAt: number;
  minIntervalMs?: number;
}): boolean {
  if (input.visibilityState !== "visible") return false;
  const minInterval = input.minIntervalMs ?? AUTH_SESSION_REFRESH_MIN_INTERVAL_MS;
  return input.now - input.lastRefreshAt >= minInterval;
}
