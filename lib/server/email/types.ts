export type TransactionalEmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailSendResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; errorCategory: string };

export type EmailClient = {
  send(payload: TransactionalEmailPayload): Promise<EmailSendResult>;
};

export type EmailAuditAction =
  | "deactivation_verification_email_sent"
  | "deactivation_verification_email_failed"
  | "account_deactivated_email_sent"
  | "account_deactivated_email_failed"
  | "account_recovered_email_sent"
  | "account_recovered_email_failed";
