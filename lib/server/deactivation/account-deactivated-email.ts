import { prisma } from "@/lib/db/prisma";
import { recordEmailAudit } from "@/lib/server/email/email-audit";
import { sendTransactionalEmail } from "@/lib/server/email/send-transactional-email";
import { buildAccountDeactivatedEmail } from "@/lib/server/email/templates/account-deactivated";
import type { EmailClient } from "@/lib/server/email/types";

import type { DeactivationStripeCancellationStatus } from "./deactivation-stripe-cancellation";

export type SendAccountDeactivatedEmailInput = {
  userId: string;
  companyId: string;
  deactivatedAt: Date;
  scheduledDeletionAt: Date;
  stripeStatus: DeactivationStripeCancellationStatus;
};

export type SendAccountDeactivatedEmailDeps = {
  emailClient?: EmailClient | null;
};

export function stripeCancellationFailedForEmail(
  stripeStatus: DeactivationStripeCancellationStatus
): boolean {
  return stripeStatus === "cancellation_failed";
}

export async function sendAccountDeactivatedConfirmationEmail(
  input: SendAccountDeactivatedEmailInput,
  deps: SendAccountDeactivatedEmailDeps = {}
): Promise<{ sent: boolean; errorCategory?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  });

  if (!user?.email) {
    return { sent: false, errorCategory: "recipient_not_found" };
  }

  const template = buildAccountDeactivatedEmail({
    deactivatedAt: input.deactivatedAt,
    recoveryDeadline: input.scheduledDeletionAt,
    stripeCancellationFailed: stripeCancellationFailedForEmail(input.stripeStatus),
  });

  const result = await sendTransactionalEmail(
    {
      to: user.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    },
    deps.emailClient
  );

  if (result.ok) {
    await recordEmailAudit({
      companyId: input.companyId,
      userId: input.userId,
      action: "account_deactivated_email_sent",
    });
    return { sent: true };
  }

  await recordEmailAudit({
    companyId: input.companyId,
    userId: input.userId,
    action: "account_deactivated_email_failed",
    data: { errorCategory: result.errorCategory },
  });

  return { sent: false, errorCategory: result.errorCategory };
}
