export const DEACTIVATED_ACCOUNT_TITLE = "Twoje konto i firma są zdezaktywowane";

export const DEACTIVATED_ACCOUNT_EXPLANATION = [
  "Firma pozostaje nieaktywna.",
  "Dane są przechowywane w ramach okresu odzyskiwania zgodnie z polityką retencji.",
  "Po zakończeniu tego okresu dane mogą zostać trwale usunięte lub zanonimizowane.",
  "Aktywna subskrypcja została anulowana zgodnie z flow rozliczeń.",
] as const;

export const DEACTIVATED_RECOVERY_EXPIRED_TITLE = "Okres odzyskiwania konta zakończył się";

export const DEACTIVATED_RECOVERY_EXPIRED_BODY =
  "Termin odzyskiwania konta minął. Jeżeli potrzebujesz pomocy, skontaktuj się z pomocą techniczną.";

export const DEACTIVATED_STRIPE_WARNING =
  "Konto zostało dezaktywowane, ale wystąpił problem z anulowaniem subskrypcji. Skontaktujemy się z Tobą lub sprawa wymaga obsługi.";

export function formatDeactivationDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
