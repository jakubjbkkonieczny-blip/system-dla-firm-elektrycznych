import {
  createNotificationForFormerCompanyMember,
  createNotificationForUser,
  type CreateNotificationInput,
} from "@/lib/server/notifications/notification-service";
import { loadCompanyName } from "@/lib/server/notifications/job-notifications";

export { loadCompanyName };

export const MEMBERSHIP_NOTIFICATION_TYPES = {
  ADDED: "membership.added",
  DEACTIVATED: "membership.deactivated",
  REMOVED: "membership.removed",
} as const;

export function membershipAddedDeepLink(): string {
  return "/dashboard";
}

export function membershipLostDeepLink(): string {
  return "/dashboard";
}

function logNotificationSideEffectFailure(
  type: string,
  category: "recipient_validation" | "db" | "unknown",
  recipientUserId?: string
): void {
  console.error("[notification] membership side-effect failed", {
    type,
    category,
    ...(recipientUserId ? { recipientUserId } : {}),
  });
}

async function safeCreateActiveMembershipNotification(
  input: CreateNotificationInput
): Promise<void> {
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

async function safeCreateFormerMembershipNotification(
  input: CreateNotificationInput & { companyId: string }
): Promise<void> {
  try {
    await createNotificationForFormerCompanyMember(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const category = message === "USER_NOT_FOUND" ? "recipient_validation" : "unknown";
    logNotificationSideEffectFailure(input.type, category, input.recipientUserId);
  }
}

export async function notifyMemberAdded(params: {
  companyId: string;
  companyName: string;
  memberUserId: string;
  actorUserId: string;
}): Promise<void> {
  if (params.memberUserId === params.actorUserId) return;

  await safeCreateActiveMembershipNotification({
    recipientUserId: params.memberUserId,
    companyId: params.companyId,
    companyNameSnapshot: params.companyName,
    type: MEMBERSHIP_NOTIFICATION_TYPES.ADDED,
    title: `Dodano Cię do firmy — ${params.companyName}`,
    body: `Otrzymałeś dostęp do firmy ${params.companyName}.`,
    url: membershipAddedDeepLink(),
  });
}

export async function notifyMemberDeactivated(params: {
  companyId: string;
  companyName: string;
  memberUserId: string;
}): Promise<void> {
  await safeCreateFormerMembershipNotification({
    recipientUserId: params.memberUserId,
    companyId: params.companyId,
    companyNameSnapshot: params.companyName,
    type: MEMBERSHIP_NOTIFICATION_TYPES.DEACTIVATED,
    title: `Dostęp do firmy został wyłączony — ${params.companyName}`,
    body: `Twój dostęp do firmy ${params.companyName} został dezaktywowany.`,
    url: membershipLostDeepLink(),
  });
}

export async function notifyMemberRemoved(params: {
  companyId: string;
  companyName: string;
  memberUserId: string;
}): Promise<void> {
  await safeCreateFormerMembershipNotification({
    recipientUserId: params.memberUserId,
    companyId: params.companyId,
    companyNameSnapshot: params.companyName,
    type: MEMBERSHIP_NOTIFICATION_TYPES.REMOVED,
    title: `Usunięto Cię z firmy — ${params.companyName}`,
    body: `Twój dostęp do firmy ${params.companyName} został usunięty.`,
    url: membershipLostDeepLink(),
  });
}
