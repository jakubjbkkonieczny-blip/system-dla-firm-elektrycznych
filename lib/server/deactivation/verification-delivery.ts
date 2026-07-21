import { prisma } from "@/lib/db/prisma";
import { recordEmailAudit, resolveEmployerOwnerCompanyId } from "@/lib/server/email/email-audit";
import { sendTransactionalEmail } from "@/lib/server/email/send-transactional-email";
import { buildDeactivationVerificationEmail } from "@/lib/server/email/templates/deactivation-verification";
import type { EmailClient } from "@/lib/server/email/types";

export type DeliverDeactivationVerificationCodeDeps = {
  emailClient?: EmailClient | null;
};

export async function deliverDeactivationVerificationCode(
  userId: string,
  _purpose: string,
  code: string,
  deps: DeliverDeactivationVerificationCodeDeps = {}
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user?.email) {
    throw new Error("USER_NOT_FOUND");
  }

  const companyId = await resolveEmployerOwnerCompanyId(userId);
  const template = buildDeactivationVerificationEmail(code);

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
    if (companyId) {
      await recordEmailAudit({
        companyId,
        userId,
        action: "deactivation_verification_email_sent",
      });
    }
    return;
  }

  if (companyId) {
    await recordEmailAudit({
      companyId,
      userId,
      action: "deactivation_verification_email_failed",
      data: { errorCategory: result.errorCategory },
    });
  }

  throw new Error("EMAIL_DELIVERY_FAILED");
}
