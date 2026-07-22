import type { Notification } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sendPushToUser } from "@/lib/server/push/sender";

export type CreateNotificationInput = {
  recipientUserId: string;
  companyId?: string | null;
  companyNameSnapshot?: string | null;
  type: string;
  title: string;
  body: string;
  url?: string | null;
};

async function assertRecipientAllowed(
  recipientUserId: string,
  companyId?: string | null
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: recipientUserId },
    select: { id: true, isActive: true },
  });

  if (!user || !user.isActive) {
    throw new Error("USER_NOT_FOUND");
  }

  if (!companyId) return;

  const membership = await prisma.companyMember.findUnique({
    where: {
      companyId_userId: { companyId, userId: recipientUserId },
    },
    select: { isActive: true },
  });

  if (!membership || !membership.isActive) {
    throw new Error("NOT_ACTIVE_MEMBER");
  }
}

/**
 * Persists notification history first; Web Push delivery is best-effort.
 */
export async function createNotificationForUser(
  input: CreateNotificationInput
): Promise<Notification> {
  await assertRecipientAllowed(input.recipientUserId, input.companyId ?? null);

  const notification = await prisma.notification.create({
    data: {
      userId: input.recipientUserId,
      companyId: input.companyId ?? null,
      companyNameSnapshot: input.companyNameSnapshot ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      url: input.url ?? null,
    },
  });

  try {
    await sendPushToUser(input.recipientUserId, {
      title: input.title,
      body: input.body,
      url: input.url ?? undefined,
      tag: notification.id,
    });
  } catch {
    // Push failure must not rollback DB record.
  }

  return notification;
}

/**
 * Persists notification for a user who no longer has active membership in companyId.
 * Only for explicit post-membership lifecycle events (deactivation/removal).
 * Does not weaken createNotificationForUser membership checks for normal company events.
 */
export async function createNotificationForFormerCompanyMember(
  input: CreateNotificationInput & { companyId: string }
): Promise<Notification> {
  const user = await prisma.user.findUnique({
    where: { id: input.recipientUserId },
    select: { id: true, isActive: true },
  });

  if (!user || !user.isActive) {
    throw new Error("USER_NOT_FOUND");
  }

  const notification = await prisma.notification.create({
    data: {
      userId: input.recipientUserId,
      companyId: input.companyId,
      companyNameSnapshot: input.companyNameSnapshot ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      url: input.url ?? null,
    },
  });

  try {
    await sendPushToUser(input.recipientUserId, {
      title: input.title,
      body: input.body,
      url: input.url ?? undefined,
      tag: notification.id,
    });
  } catch {
    // Push failure must not rollback DB record.
  }

  return notification;
}
