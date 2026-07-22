import { prisma } from "@/lib/db/prisma";
import {
  createNotificationForUser,
  type CreateNotificationInput,
} from "@/lib/server/notifications/notification-service";

export const JOB_NOTIFICATION_TYPES = {
  ASSIGNED: "job.assigned",
  UNASSIGNED: "job.unassigned",
  STATUS_CHANGED: "job.status_changed",
} as const;

export const JOB_STATUS_LABELS: Record<string, string> = {
  new: "Nowe",
  scheduled: "Zaplanowane",
  in_progress: "W trakcie",
  done: "Zakończone",
  cancelled: "Anulowane",
};

export function formatJobDisplayTitle(job: { jobNumber: number; customerName: string }): string {
  return `#${job.jobNumber} — ${job.customerName}`;
}

export function formatJobStatusLabel(status: string): string {
  return JOB_STATUS_LABELS[status] || status;
}

export function computeAssignmentDiff(previous: string[], next: string[]) {
  const prevSet = new Set(previous);
  const nextSet = new Set(next);
  return {
    newlyAssigned: next.filter((id) => !prevSet.has(id)),
    removed: previous.filter((id) => !nextSet.has(id)),
  };
}

export function excludeActor(recipientIds: string[], actorUserId: string): string[] {
  return recipientIds.filter((id) => id !== actorUserId);
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
  console.error("[notification] job side-effect failed", {
    type,
    category,
    ...(recipientUserId ? { recipientUserId } : {}),
  });
}

async function safeCreateJobNotification(input: CreateNotificationInput): Promise<void> {
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

export type JobNotificationContext = {
  companyId: string;
  companyName: string;
  jobId: string;
  jobNumber: number;
  customerName: string;
  actorUserId: string;
};

export async function notifyJobAssignmentChanges(params: {
  context: JobNotificationContext;
  previousAssignedToUids: string[];
  newAssignedToUids: string[];
}): Promise<void> {
  const { context, previousAssignedToUids, newAssignedToUids } = params;
  const { newlyAssigned, removed } = computeAssignmentDiff(
    previousAssignedToUids,
    newAssignedToUids
  );

  if (newlyAssigned.length === 0 && removed.length === 0) return;

  const jobTitle = formatJobDisplayTitle(context);
  const recipientsToNotify = [
    ...excludeActor(newlyAssigned, context.actorUserId),
    ...excludeActor(removed, context.actorUserId),
  ];
  const eligible = await resolveEligibleRecipients(context.companyId, recipientsToNotify);

  const tasks: Promise<void>[] = [];

  for (const userId of excludeActor(newlyAssigned, context.actorUserId)) {
    if (!eligible.has(userId)) continue;
    tasks.push(
      safeCreateJobNotification({
        recipientUserId: userId,
        companyId: context.companyId,
        companyNameSnapshot: context.companyName,
        type: JOB_NOTIFICATION_TYPES.ASSIGNED,
        title: `Nowe zlecenie — ${context.companyName}`,
        body: `Zostałeś przypisany do zlecenia „${jobTitle}".`,
        url: `/jobs/${context.jobId}`,
      })
    );
  }

  for (const userId of excludeActor(removed, context.actorUserId)) {
    if (!eligible.has(userId)) continue;
    tasks.push(
      safeCreateJobNotification({
        recipientUserId: userId,
        companyId: context.companyId,
        companyNameSnapshot: context.companyName,
        type: JOB_NOTIFICATION_TYPES.UNASSIGNED,
        title: `Zmiana przypisania — ${context.companyName}`,
        body: `Nie jesteś już przypisany do zlecenia „${jobTitle}".`,
        url: "/jobs",
      })
    );
  }

  await Promise.all(tasks);
}

export async function notifyJobStatusChange(params: {
  context: JobNotificationContext;
  previousStatus: string;
  newStatus: string;
  assignedToUids: string[];
}): Promise<void> {
  const { context, previousStatus, newStatus, assignedToUids } = params;
  if (previousStatus === newStatus) return;

  const jobTitle = formatJobDisplayTitle(context);
  const recipients = excludeActor(assignedToUids, context.actorUserId);
  if (recipients.length === 0) return;

  const eligible = await resolveEligibleRecipients(context.companyId, recipients);
  const statusLabel = formatJobStatusLabel(newStatus);

  await Promise.all(
    recipients
      .filter((userId) => eligible.has(userId))
      .map((userId) =>
        safeCreateJobNotification({
          recipientUserId: userId,
          companyId: context.companyId,
          companyNameSnapshot: context.companyName,
          type: JOB_NOTIFICATION_TYPES.STATUS_CHANGED,
          title: `Zmiana statusu — ${context.companyName}`,
          body: `Status zlecenia „${jobTitle}" zmieniono na „${statusLabel}".`,
          url: `/jobs/${context.jobId}`,
        })
      )
  );
}

export async function notifyInitialJobAssignments(params: {
  context: JobNotificationContext;
  assignedToUids: string[];
}): Promise<void> {
  await notifyJobAssignmentChanges({
    context: params.context,
    previousAssignedToUids: [],
    newAssignedToUids: params.assignedToUids,
  });
}

export async function loadCompanyName(companyId: string): Promise<string | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  return company?.name ?? null;
}

export function buildJobNotificationContext(params: {
  companyId: string;
  companyName: string;
  jobId: string;
  jobNumber: number;
  customerName: string;
  actorUserId: string;
}): JobNotificationContext {
  return params;
}
