import { Resend } from "resend";

import { getEmailFromAddress, getResendApiKey } from "./config";
import type { EmailClient, EmailSendResult, TransactionalEmailPayload } from "./types";

function categorizeResendError(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name?: string }).name;
    if (typeof name === "string" && name.length > 0) {
      return name;
    }
  }
  return "resend_api_error";
}

export function createResendEmailClient(apiKey = getResendApiKey()): EmailClient | null {
  if (!apiKey) {
    return null;
  }

  const resend = new Resend(apiKey);
  const from = getEmailFromAddress();

  return {
    async send(payload: TransactionalEmailPayload): Promise<EmailSendResult> {
      try {
        const response = await resend.emails.send({
          from,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        });

        if (response.error) {
          return { ok: false, errorCategory: categorizeResendError(response.error) };
        }

        return { ok: true, providerMessageId: response.data?.id };
      } catch (error) {
        return { ok: false, errorCategory: categorizeResendError(error) };
      }
    },
  };
}
