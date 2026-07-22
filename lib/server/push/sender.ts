import webpush from "web-push";
import { prisma } from "@/lib/db/prisma";
import { ensureVapidConfigured } from "./vapid";
import type { PushPayload, SendPushResult } from "./types";

function isStalePushError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const statusCode = (err as { statusCode?: number }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<SendPushResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return { sent: 0, failed: 0, removedStale: 0, skippedInactiveUser: true };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, removedStale: 0, skippedInactiveUser: false };
  }

  try {
    ensureVapidConfigured();
  } catch {
    return { sent: 0, failed: subscriptions.length, removedStale: 0, skippedInactiveUser: false };
  }

  let sent = 0;
  let failed = 0;
  let removedStale = 0;

  const pushBody = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  });

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        pushBody
      );
      sent += 1;
    } catch (err) {
      failed += 1;
      if (isStalePushError(err)) {
        try {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
          removedStale += 1;
        } catch {
          // ignore cleanup race
        }
      }
    }
  }

  return { sent, failed, removedStale, skippedInactiveUser: false };
}
