import { wrapEmailHtml, wrapEmailText } from "./layout";

export type AccountRecoveredEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export function buildAccountRecoveredEmail(): AccountRecoveredEmailContent {
  const subject = "Twoje konto i firma zostały odzyskane";

  const htmlBody = `
    <p style="margin:0 0 16px;">Twoje konto pracodawcy zostało ponownie aktywowane.</p>
    <p style="margin:0 0 16px;">Firma została ponownie aktywowana.</p>
    <p style="margin:0 0 16px;">Aby kontynuować, zaloguj się ponownie.</p>
    <p style="margin:0 0 16px;">Pozostali członkowie i pracownicy nie zostali automatycznie reaktywowani.</p>
    <p style="margin:0 0 16px;">Subskrypcja nie została automatycznie wznowiona.</p>
    <p style="margin:0;">Przy kolejnym logowaniu może być wymagane przejście przez proces subskrypcji i płatności.</p>
  `;

  const textBody = [
    "Twoje konto pracodawcy zostało ponownie aktywowane.",
    "Firma została ponownie aktywowana.",
    "Aby kontynuować, zaloguj się ponownie.",
    "Pozostali członkowie i pracownicy nie zostali automatycznie reaktywowani.",
    "Subskrypcja nie została automatycznie wznowiona.",
    "Przy kolejnym logowaniu może być wymagane przejście przez proces subskrypcji i płatności.",
  ].join("\n");

  return {
    subject,
    html: wrapEmailHtml(htmlBody),
    text: wrapEmailText(textBody),
  };
}
