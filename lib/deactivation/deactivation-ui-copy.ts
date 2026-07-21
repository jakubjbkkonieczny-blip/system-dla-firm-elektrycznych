export const DEACTIVATION_WARNING_POINTS = [
  "Twoje konto pracodawcy zostanie dezaktywowane.",
  "Twoja firma zostanie dezaktywowana.",
  "Utracisz dostęp do firmy i jej danych.",
  "Pracownicy utracą dostęp do tej firmy zgodnie z obowiązującym lifecycle kont.",
  "Aktywna subskrypcja zostanie anulowana.",
  "Rozpocznie się 12-miesięczny okres odzyskiwania konta i firmy.",
  "Po tym okresie dane mogą zostać usunięte lub zanonimizowane zgodnie z polityką retencji i obowiązującymi przepisami.",
] as const;

export const DEACTIVATION_CONSEQUENCES = [
  "Firma zostanie dezaktywowana.",
  "Konto pracodawcy zostanie dezaktywowane.",
  "Dostęp do danych firmy zostanie zablokowany.",
  "Pracownicy utracą dostęp do tej firmy.",
  "Pracownicy należący do innych firm zachowają pozostałe dostępy zgodnie z lifecycle.",
  "Aktywna subskrypcja zostanie anulowana.",
  "Konto będzie można odzyskać w 12-miesięcznym okresie odzyskiwania.",
  "Po okresie retencji dane mogą zostać usunięte lub zanonimizowane zgodnie z polityką retencji.",
] as const;

export type DeactivationConfirmationId =
  | "accessLoss"
  | "dataExport"
  | "workersAccess"
  | "subscriptionCancel"
  | "retentionPolicy";

export const DEACTIVATION_CONFIRMATIONS: ReadonlyArray<{
  id: DeactivationConfirmationId;
  label: string;
}> = [
  {
    id: "accessLoss",
    label:
      "Rozumiem, że zamknięcie konta spowoduje utratę dostępu do mojej firmy i jej danych.",
  },
  {
    id: "dataExport",
    label:
      "Potwierdzam, że pobrałem dane, dokumenty, kosztorysy, raporty i inne informacje, które chcę zachować.",
  },
  {
    id: "workersAccess",
    label:
      "Rozumiem, że pracownicy utracą dostęp do tej firmy, ale ich konta mogą pozostać aktywne, jeśli należą do innych firm.",
  },
  {
    id: "subscriptionCancel",
    label:
      "Rozumiem, że aktywna subskrypcja zostanie anulowana zgodnie z zasadami rozliczeń.",
  },
  {
    id: "retentionPolicy",
    label:
      "Rozumiem, że po zakończeniu 12-miesięcznego okresu odzyskiwania dane mogą zostać trwale usunięte lub zanonimizowane zgodnie z obowiązującą polityką retencji.",
  },
];

export const DEACTIVATION_SUCCESS_MESSAGE =
  "Konto i firma zostały dezaktywowane. Rozpoczął się 12-miesięczny okres odzyskiwania.";

export const DEACTIVATION_SUCCESS_WITH_STRIPE_WARNING_MESSAGE =
  "Konto i firma zostały dezaktywowane. Wystąpił problem z anulowaniem subskrypcji — nasz zespół wsparcia pomoże dokończyć ten proces.";
