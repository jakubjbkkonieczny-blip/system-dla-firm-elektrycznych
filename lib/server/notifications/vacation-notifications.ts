import { prisma } from "@/lib/db/prisma";
import {
  createNotificationForUser,
  type CreateNotificationInput,
} from "@/lib/server/notifications/notification-service";
import { excludeActor, loadCompanyName } from "@/lib/server/notifications/job-notifications";

export { loadCompanyName };

export const VACATION_NOTIFICATION_TYPES = {
  REQUEST_CREATED: "vacation.request_created",
  APPROVED: "vacation.approved",
  REJECTED: "vacation.rejected",
} as const;

export function vacationsDeepLink(): string {
  return "/vacations";
}

async function resolveVacationManagementRecipients(companyId: string): Promise<string[]> {
  const members = await prisma.companyMember.findMany({
    where: {
      companyId,
      isActive: true,
      role: { in: ["owner", "admin"] },
      user: { isActive: true },
    },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

async function resolveEligibleRecipients(
  companyId: string,
  recipientUserIds: string[]
): Promise<Set<string>> {
  if (recipientUserIds.length === 0) return new Set();

  const uniqueIds = Array.from(new Set(recipientUserIds));

  const [users, memberships] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: uniqueIds }, isActive: true },
      select: { id: true },
    }),
    prisma.companyMember.findMany({
      where: {
        companyId,
        userId: { in: uniqueIds },
        isActive: true,
      },
      select: { userId: true },
    }),
  ]);

  const activeUserIds = new Set(users.map((u) => u.id));
  const activeMemberIds = new Set(memberships.map((m) => m.userId));

  const eligible = new Set<string>();
  for (const userId of uniqueIds) {
    if (activeUserIds.has(userId) && activeMemberIds.has(userId)) {
      eligible.add(userId);
    }
  }
  return eligible;
}

function logNotificationSideEffectFailure(
  type: string,
  category: "recipient_validation" | "db" | "unknown",
  recipientUserId?: string
): void {
  console.error("[notification] vacation side-effect failed", {
    type,
    category,
    ...(recipientUserId ? { recipientUserId } : {}),
  });
}

async function safeCreateVacationNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await createNotificationForUser(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const category =
      message === "USER_NOT_FOUND" || message === "NOT_ACTIVE_MEMBER"
        ? "recipient_validation"
        : "unknown";
    logNotificationSideEffectFailure(input.type, category, input.recipientUserId);
  }
}

export async function notifyVacationRequestCreated(params: {
  companyId: string;
  companyName: string;
  requesterUserId: string;
}): Promise<void> {
  const approvers = await resolveVacationManagementRecipients(params.companyId);
  const recipients = excludeActor(approvers, params.requesterUserId);
  if (recipients.length === 0) return;

  const eligible = await resolveEligibleRecipients(params.companyId, recipients);

  await Promise.all(
    recipients
      .filter((userId) => eligible.has(userId))
      .map((userId) =>
        safeCreateVacationNotification({
          recipientUserId: userId,
          companyId: params.companyId,
          companyNameSnapshot: params.companyName,
          type: VACATION_NOTIFICATION_TYPES.REQUEST_CREATED,
          title: `Nowy wniosek urlopowy — ${params.companyName}`,
          body: "Pracownik złożył nowy wniosek urlopowy.",
          url: vacationsDeepLink(),
        })
      )
  );
}

export async function notifyVacationApproved(params: {
  companyId: string;
  companyName: string;
  requesterUserId: string;
  actorUserId: string;
}): Promise<void> {
  if (params.requesterUserId === params.actorUserId) return;

  const eligible = await resolveEligibleRecipients(params.companyId, [params.requesterUserId]);
  if (!eligible.has(params.requesterUserId)) return;

  await safeCreateVacationNotification({
    recipientUserId: params.requesterUserId,
    companyId: params.companyId,
    companyNameSnapshot: params.companyName,
    type: VACATION_NOTIFICATION_TYPES.APPROVED,
    title: `Wniosek urlopowy zaakceptowany — ${params.companyName}`,
    body: "Twój wniosek urlopowy został zaakceptowany.",
    url: vacationsDeepLink(),
  });
}

export async function notifyVacationRejected(params: {
  companyId: string;
  companyName: string;
  requesterUserId: string;
  actorUserId: string;
}): Promise<void> {
  if (params.requesterUserId === params.actorUserId) return;

  const eligible = await resolveEligibleRecipients(params.companyId, [params.requesterUserId]);
  if (!eligible.has(params.requesterUserId)) return;

  await safeCreateVacationNotification({
    recipientUserId: params.requesterUserId,
    companyId: params.companyId,
    companyNameSnapshot: params.companyName,
    type: VACATION_NOTIFICATION_TYPES.REJECTED,
    title: `Wniosek urlopowy odrzucony — ${params.companyName}`,
    body: "Twój wniosek urlopowy został odrzucony. Otwórz VectorWork, aby zobaczyć szczegóły.",
    url: vacationsDeepLink(),
  });
}
