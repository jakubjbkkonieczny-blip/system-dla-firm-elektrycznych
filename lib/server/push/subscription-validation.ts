import type { ParsedPushSubscription } from "./types";

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`INVALID_SUBSCRIPTION:${field}`);
  }
  return value.trim();
}

/**
 * Validates browser PushSubscription JSON (endpoint + keys.p256dh + keys.auth).
 */
export function parsePushSubscriptionBody(body: unknown): ParsedPushSubscription {
  if (!body || typeof body !== "object") {
    throw new Error("INVALID_SUBSCRIPTION");
  }

  const record = body as Record<string, unknown>;
  const endpoint = readString(record.endpoint, "endpoint");

  const keys =
    record.keys && typeof record.keys === "object"
      ? (record.keys as Record<string, unknown>)
      : record;

  const p256dh = readString(keys.p256dh, "p256dh");
  const auth = readString(keys.auth, "auth");

  return { endpoint, p256dh, auth };
}
