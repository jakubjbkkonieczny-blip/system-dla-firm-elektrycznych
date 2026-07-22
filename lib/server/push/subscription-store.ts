import { prisma } from "@/lib/db/prisma";
import type { ParsedPushSubscription } from "./types";

export async function upsertUserPushSubscription(
  userId: string,
  subscription: ParsedPushSubscription,
  userAgent?: string | null
) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      userAgent: userAgent ?? null,
    },
    update: {
      userId,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      userAgent: userAgent ?? null,
    },
  });
}

export async function deleteUserPushSubscription(userId: string, endpoint: string) {
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { id: true, userId: true },
  });

  if (!existing) return { deleted: false as const, reason: "NOT_FOUND" as const };
  if (existing.userId !== userId) {
    return { deleted: false as const, reason: "FORBIDDEN" as const };
  }

  await prisma.pushSubscription.delete({ where: { endpoint } });
  return { deleted: true as const };
}
