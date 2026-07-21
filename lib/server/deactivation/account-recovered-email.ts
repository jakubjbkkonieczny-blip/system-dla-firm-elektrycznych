import { prisma } from "@/lib/db/prisma";
import { recordEmailAudit } from "@/lib/server/email/email-audit";
import { sendTransactionalEmail } from "@/lib/server/email/send-transactional-email";
import { buildAccountRecoveredEmail } from "@/lib/server/email/templates/account-recovered";
import type { EmailClient } from "@/lib/server/email/types";

export type SendAccountRecoveredEmailInput = {
  userId: string;
  companyId: string;
};

export type SendAccountRecoveredEmailDeps = {
  emailClient?: EmailClient | null;
};

export async function sendAccountRecoveredConfirmationEmail(
  input: SendAccountRecoveredEmailInput,
  deps: SendAccountRecoveredEmailDeps = {}
): Promise<{ sent: boolean; errorCategory?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  });

  if (!user?.email) {
    return { sent: false, errorCategory: "recipient_not_found" };
  }

  const template = buildAccountRecoveredEmail();

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
      action: "account_recovered_email_sent",
    });
    return { sent: true };
  }

  await recordEmailAudit({
    companyId: input.companyId,
    userId: input.userId,
    action: "account_recovered_email_failed",
    data: { errorCategory: result.errorCategory },
  });

  return { sent: false, errorCategory: result.errorCategory };
}
