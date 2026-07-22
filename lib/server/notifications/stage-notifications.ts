import { prisma } from "@/lib/db/prisma";
import {
  createNotificationForUser,
  type CreateNotificationInput,
} from "@/lib/server/notifications/notification-service";
import {
  excludeActor,
  formatJobDisplayTitle,
  loadCompanyName,
} from "@/lib/server/notifications/job-notifications";

export { loadCompanyName };

export const STAGE_NOTIFICATION_TYPES = {
  SUPERVISOR_ASSIGNED: "stage.supervisor_assigned",
  SUPERVISOR_REMOVED: "stage.supervisor_removed",
  SUBMITTED_FOR_APPROVAL: "stage.submitted_for_approval",
  APPROVED: "stage.approved",
  REJECTED: "stage.rejected",
  REOPENED: "stage.reopened",
} as const;

export type StageNotificationContext = {
  companyId: string;
  companyName: string;
  jobId: string;
  jobNumber: number;
  customerName: string;
  stageId: string;
  stageName: string;
  actorUserId: string;
};

export function buildStageNotificationContext(params: {
  companyId: string;
  companyName: string;
  jobId: string;
  jobNumber: number;
  customerName: string;
  stageId: string;
  stageName: string;
  actorUserId: string;
}): StageNotificationContext {
  return params;
}

export async function loadStageNotificationContext(params: {
  companyId: string;
  jobId: string;
  stage: { id: string; name: string };
  actorUserId: string;
}): Promise<StageNotificationContext | null> {
  const [companyName, job] = await Promise.all([
    loadCompanyName(params.companyId),
    prisma.job.findFirst({
      where: { id: params.jobId, companyId: params.companyId, deletedAt: null },
      select: { jobNumber: true, customerName: true },
    }),
  ]);

  if (!companyName || !job) return null;

  return buildStageNotificationContext({
    companyId: params.companyId,
    companyName,
    jobId: params.jobId,
    jobNumber: job.jobNumber,
    customerName: job.customerName,
    stageId: params.stage.id,
    stageName: params.stage.name,
    actorUserId: params.actorUserId,
  });
}

export function stageJobDeepLink(jobId: string): string {
  return `/jobs/${jobId}`;
}

export function stageSupervisorRemovedDeepLink(): string {
  return "/jobs";
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

async function resolveStageApprovalRecipients(companyId: string): Promise<string[]> {
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

function logNotificationSideEffectFailure(
  type: string,
  category: "recipient_validation" | "db" | "unknown",
  recipientUserId?: string
): void {
  console.error("[notification] stage side-effect failed", {
    type,
    category,
    ...(recipientUserId ? { recipientUserId } : {}),
  });
}

async function safeCreateStageNotification(input: CreateNotificationInput): Promise<void> {
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

function uniqueRecipientIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => !!id)));
}

export async function notifyStageSupervisorChange(params: {
  context: StageNotificationContext;
  previousSupervisorUserId: string | null;
  newSupervisorUserId: string | null;
}): Promise<void> {
  const { context, previousSupervisorUserId, newSupervisorUserId } = params;
  if (previousSupervisorUserId === newSupervisorUserId) return;

  const jobTitle = formatJobDisplayTitle(context);
  const stageName = context.stageName;

  const candidateIds = uniqueRecipientIds([
    newSupervisorUserId,
    previousSupervisorUserId !== newSupervisorUserId ? previousSupervisorUserId : null,
  ]);
  const eligible = await resolveEligibleRecipients(context.companyId, candidateIds);
  const tasks: Promise<void>[] = [];

  if (
    newSupervisorUserId &&
    newSupervisorUserId !== context.actorUserId &&
    eligible.has(newSupervisorUserId)
  ) {
    tasks.push(
      safeCreateStageNotification({
        recipientUserId: newSupervisorUserId,
        companyId: context.companyId,
        companyNameSnapshot: context.companyName,
        type: STAGE_NOTIFICATION_TYPES.SUPERVISOR_ASSIGNED,
        title: `Przypisano Ci etap — ${context.companyName}`,
        body: `Zostałeś wyznaczony jako kierownik etapu „${stageName}" w zleceniu „${jobTitle}".`,
        url: stageJobDeepLink(context.jobId),
      })
    );
  }

  if (
    previousSupervisorUserId &&
    previousSupervisorUserId !== newSupervisorUserId &&
    previousSupervisorUserId !== context.actorUserId &&
    eligible.has(previousSupervisorUserId)
  ) {
    tasks.push(
      safeCreateStageNotification({
        recipientUserId: previousSupervisorUserId,
        companyId: context.companyId,
        companyNameSnapshot: context.companyName,
        type: STAGE_NOTIFICATION_TYPES.SUPERVISOR_REMOVED,
        title: `Zmiana kierownika etapu — ${context.companyName}`,
        body: `Nie jesteś już kierownikiem etapu „${stageName}" w zleceniu „${jobTitle}".`,
        url: stageSupervisorRemovedDeepLink(),
      })
    );
  }

  await Promise.all(tasks);
}

export async function notifyStageSubmittedForApproval(params: {
  context: StageNotificationContext;
}): Promise<void> {
  const { context } = params;
  const jobTitle = formatJobDisplayTitle(context);
  const stageName = context.stageName;

  const approvers = await resolveStageApprovalRecipients(context.companyId);
  const recipients = excludeActor(approvers, context.actorUserId);
  if (recipients.length === 0) return;

  const eligible = await resolveEligibleRecipients(context.companyId, recipients);

  await Promise.all(
    recipients
      .filter((userId) => eligible.has(userId))
      .map((userId) =>
        safeCreateStageNotification({
          recipientUserId: userId,
          companyId: context.companyId,
          companyNameSnapshot: context.companyName,
          type: STAGE_NOTIFICATION_TYPES.SUBMITTED_FOR_APPROVAL,
          title: `Etap oczekuje na akceptację — ${context.companyName}`,
          body: `Etap „${stageName}" w zleceniu „${jobTitle}" został zgłoszony do akceptacji.`,
          url: stageJobDeepLink(context.jobId),
        })
      )
  );
}

export async function notifyStageApproved(params: {
  context: StageNotificationContext;
  supervisorUserId: string | null;
  submittedByUserId: string | null;
}): Promise<void> {
  const { context, supervisorUserId, submittedByUserId } = params;
  const stageName = context.stageName;
  const recipients = excludeActor(
    uniqueRecipientIds([supervisorUserId, submittedByUserId]),
    context.actorUserId
  );
  if (recipients.length === 0) return;

  const eligible = await resolveEligibleRecipients(context.companyId, recipients);

  await Promise.all(
    recipients
      .filter((userId) => eligible.has(userId))
      .map((userId) =>
        safeCreateStageNotification({
          recipientUserId: userId,
          companyId: context.companyId,
          companyNameSnapshot: context.companyName,
          type: STAGE_NOTIFICATION_TYPES.APPROVED,
          title: `Etap zaakceptowany — ${context.companyName}`,
          body: `Etap „${stageName}" został zaakceptowany.`,
          url: stageJobDeepLink(context.jobId),
        })
      )
  );
}

export async function notifyStageRejected(params: {
  context: StageNotificationContext;
  supervisorUserId: string | null;
  submittedByUserId: string | null;
}): Promise<void> {
  const { context, supervisorUserId, submittedByUserId } = params;
  const recipients = excludeActor(
    uniqueRecipientIds([supervisorUserId, submittedByUserId]),
    context.actorUserId
  );
  if (recipients.length === 0) return;

  const eligible = await resolveEligibleRecipients(context.companyId, recipients);

  await Promise.all(
    recipients
      .filter((userId) => eligible.has(userId))
      .map((userId) =>
        safeCreateStageNotification({
          recipientUserId: userId,
          companyId: context.companyId,
          companyNameSnapshot: context.companyName,
          type: STAGE_NOTIFICATION_TYPES.REJECTED,
          title: `Etap odrzucony — ${context.companyName}`,
          body: "Etap został odrzucony. Otwórz VectorWork, aby zobaczyć szczegóły.",
          url: stageJobDeepLink(context.jobId),
        })
      )
  );
}

export async function notifyStageReopened(params: {
  context: StageNotificationContext;
  supervisorUserId: string | null;
  submittedByUserId: string | null;
}): Promise<void> {
  const { context, supervisorUserId, submittedByUserId } = params;
  const jobTitle = formatJobDisplayTitle(context);
  const stageName = context.stageName;
  const recipients = excludeActor(
    uniqueRecipientIds([supervisorUserId, submittedByUserId]),
    context.actorUserId
  );
  if (recipients.length === 0) return;

  const eligible = await resolveEligibleRecipients(context.companyId, recipients);

  await Promise.all(
    recipients
      .filter((userId) => eligible.has(userId))
      .map((userId) =>
        safeCreateStageNotification({
          recipientUserId: userId,
          companyId: context.companyId,
          companyNameSnapshot: context.companyName,
          type: STAGE_NOTIFICATION_TYPES.REOPENED,
          title: `Etap ponownie otwarty — ${context.companyName}`,
          body: `Etap „${stageName}" w zleceniu „${jobTitle}" został ponownie otwarty.`,
          url: stageJobDeepLink(context.jobId),
        })
      )
  );
}
