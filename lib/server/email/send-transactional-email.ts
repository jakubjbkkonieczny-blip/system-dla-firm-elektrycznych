import { createResendEmailClient } from "./resend-client";
import type { EmailClient, EmailSendResult, TransactionalEmailPayload } from "./types";

let defaultClient: EmailClient | null | undefined;

function getDefaultEmailClient(): EmailClient | null {
  if (defaultClient === undefined) {
    defaultClient = createResendEmailClient();
  }
  return defaultClient;
}

export function resetDefaultEmailClientForTests(): void {
  defaultClient = undefined;
}

export function setDefaultEmailClientForTests(client: EmailClient | null): void {
  defaultClient = client;
}

export async function sendTransactionalEmail(
  payload: TransactionalEmailPayload,
  client?: EmailClient | null
): Promise<EmailSendResult> {
  const resolvedClient = client === undefined ? getDefaultEmailClient() : client;

  if (!resolvedClient) {
    return { ok: false, errorCategory: "missing_email_provider_config" };
  }

  return resolvedClient.send(payload);
}
