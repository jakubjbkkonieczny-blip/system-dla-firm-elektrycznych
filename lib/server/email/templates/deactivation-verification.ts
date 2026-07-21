import { wrapEmailHtml, wrapEmailText } from "./layout";

export type DeactivationVerificationEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export function buildDeactivationVerificationEmail(code: string): DeactivationVerificationEmailContent {
  const subject = "Potwierdzenie dezaktywacji konta";

  const htmlBody = `
    <p style="margin:0 0 16px;">Rozpocząłeś proces dezaktywacji konta pracodawcy i firmy w VectorWork.</p>
    <p style="margin:0 0 16px;">Twój kod potwierdzający:</p>
    <p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:0.2em;color:#0f172a;">${code}</p>
    <p style="margin:0 0 16px;">Kod jest ważny przez 15 minut.</p>
    <p style="margin:0;">Jeśli nie rozpocząłeś tego procesu, zignoruj tę wiadomość i zabezpiecz swoje konto.</p>
  `;

  const textBody = [
    "Rozpocząłeś proces dezaktywacji konta pracodawcy i firmy w VectorWork.",
    "",
    `Twój kod potwierdzający: ${code}`,
    "",
    "Kod jest ważny przez 15 minut.",
    "",
    "Jeśli nie rozpocząłeś tego procesu, zignoruj tę wiadomość i zabezpiecz swoje konto.",
  ].join("\n");

  return {
    subject,
    html: wrapEmailHtml(htmlBody),
    text: wrapEmailText(textBody),
  };
}
