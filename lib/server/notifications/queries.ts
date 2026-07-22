import { prisma } from "@/lib/db/prisma";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type NotificationListItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  companyId: string | null;
  companyNameSnapshot: string | null;
  read: boolean;
  createdAt: string;
};

export async function listNotificationsForUser(params: {
  userId: string;
  cursor?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const rows = await prisma.notification.findMany({
    where: { userId: params.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      url: true,
      companyId: true,
      companyNameSnapshot: true,
      readAt: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  const notifications: NotificationListItem[] = page.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    url: row.url,
    companyId: row.companyId,
    companyNameSnapshot: row.companyNameSnapshot,
    read: row.readAt != null,
    createdAt: row.createdAt.toISOString(),
  }));

  return { notifications, nextCursor, limit };
}

export async function markNotificationReadForUser(
  userId: string,
  notificationId: string
): Promise<{ updated: boolean; reason?: "NOT_FOUND" | "FORBIDDEN" }> {
  const existing = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, userId: true, readAt: true },
  });

  if (!existing) return { updated: false, reason: "NOT_FOUND" };
  if (existing.userId !== userId) return { updated: false, reason: "FORBIDDEN" };

  if (existing.readAt) return { updated: true };

  await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });

  return { updated: true };
}
