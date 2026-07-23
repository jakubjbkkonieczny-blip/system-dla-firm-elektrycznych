"use client";

import { resolvePushBrowserState, type PushBrowserState } from "./ui-state";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch("/api/push/vapid-public-key", { credentials: "same-origin" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || typeof json.publicKey !== "string") {
    throw new Error(json.error || "VAPID_NOT_CONFIGURED");
  }
  return json.publicKey;
}

function subscriptionToPayload(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("INVALID_BROWSER_SUBSCRIPTION");
  }
  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  };
}

export type PushSubscribeResult =
  | { ok: true; permission: NotificationPermission }
  | { ok: false; reason: string };

/**
 * User-gesture only: requests permission, subscribes device, persists on backend.
 */
export async function subscribeToPushNotifications(): Promise<PushSubscribeResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: "NOT_SUPPORTED" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "PERMISSION_DENIED" };
  }

  const registration = await getServiceWorkerRegistration();
  await navigator.serviceWorker.ready;

  const publicKey = await fetchVapidPublicKey();
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  const payload = subscriptionToPayload(subscription);

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, reason: json.error || `HTTP_${res.status}` };
  }

  return { ok: true, permission };
}

export async function unsubscribeFromPushNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) {
    return { ok: false, reason: "NOT_SUPPORTED" };
  }

  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = registration
    ? await registration.pushManager.getSubscription()
    : null;

  if (!subscription) {
    return { ok: true };
  }

  const payload = subscriptionToPayload(subscription);

  const res = await fetch("/api/push/unsubscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, reason: json.error || `HTTP_${res.status}` };
  }

  await subscription.unsubscribe().catch(() => undefined);
  return { ok: true };
}

export async function registerServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    // Non-blocking: PWA shell must keep working without SW.
  }
}

export async function detectPushNotificationState(): Promise<PushBrowserState> {
  if (!isPushSupported()) {
    return "unsupported";
  }

  const permission = Notification.permission;

  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = registration
      ? await registration.pushManager.getSubscription()
      : null;

    return resolvePushBrowserState({
      supported: true,
      permission,
      hasSubscription: Boolean(subscription),
    });
  } catch {
    return resolvePushBrowserState({
      supported: true,
      permission,
      hasSubscription: false,
    });
  }
}
