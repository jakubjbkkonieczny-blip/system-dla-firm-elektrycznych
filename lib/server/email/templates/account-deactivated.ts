import { formatEmailDate } from "../format-email-date";
import { wrapEmailHtml, wrapEmailText } from "./layout";

export type AccountDeactivatedEmailInput = {
  deactivatedAt: Date;
  recoveryDeadline: Date;
  stripeCancellationFailed: boolean;
};

export type AccountDeactivatedEmailContent = {
  subject: string;
  html: string;
  text: string;
};

function subscriptionParagraph(stripeCancellationFailed: boolean): { html: string; text: string } {
  if (stripeCancellationFailed) {
    return {
      html:
        "<p style=\"margin:0 0 16px;\">Wystąpił problem z anulowaniem subskrypcji i może być wymagana dodatkowa obsługa.</p>",
      text: "Wystąpił problem z anulowaniem subskrypcji i może być wymagana dodatkowa obsługa.",
    };
  }

  return {
    html:
      "<p style=\"margin:0 0 16px;\">Aktywna subskrypcja została anulowana zgodnie z procesem rozliczeń konta.</p>",
    text: "Aktywna subskrypcja została anulowana zgodnie z procesem rozliczeń konta.",
  };
}

export function buildAccountDeactivatedEmail(
  input: AccountDeactivatedEmailInput
): AccountDeactivatedEmailContent {
  const subject = "Twoje konto i firma zostały zdezaktywowane";
  const deactivatedLabel = formatEmailDate(input.deactivatedAt);
  const recoveryLabel = formatEmailDate(input.recoveryDeadline);
  const subscription = subscriptionParagraph(input.stripeCancellationFailed);

  const htmlBody = `
    <p style="margin:0 0 16px;">Twoje konto pracodawcy i firma zostały zdezaktywowane.</p>
    <p style="margin:0 0 16px;">Data dezaktywacji: <strong>${deactivatedLabel}</strong></p>
    <p style="margin:0 0 16px;">Możesz rozpocząć odzyskanie konta do: <strong>${recoveryLabel}</strong></p>
    <p style="margin:0 0 16px;">Po zakończeniu tego okresu dane mogą zostać trwale usunięte lub zanonimizowane zgodnie z polityką retencji.</p>
    ${subscription.html}
  `;

  const textBody = [
    "Twoje konto pracodawcy i firma zostały zdezaktywowane.",
    "",
    `Data dezaktywacji: ${deactivatedLabel}`,
    `Możesz rozpocząć odzyskanie konta do: ${recoveryLabel}`,
    "",
    "Po zakończeniu tego okresu dane mogą zostać trwale usunięte lub zanonimizowane zgodnie z polityką retencji.",
    "",
    subscription.text,
  ].join("\n");

  return {
    subject,
    html: wrapEmailHtml(htmlBody),
    text: wrapEmailText(textBody),
  };
}
