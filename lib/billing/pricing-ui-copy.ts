/** UI-only pricing copy — must stay aligned with Stripe Dashboard config, not billing logic. */

export const PRICING_INTRO_LINE = "250 zł / miesiąc przez pierwsze 2 miesiące";
export const PRICING_STANDARD_LINE = "potem 400 zł / miesiąc";
export const PRICING_INCLUDED_SEATS_LINE = "10 osób w cenie";
export const PRICING_EXTRA_SEAT_LINE = "każda kolejna aktywna osoba: +40 zł / miesiąc";
export const PRICING_WHO_COUNTS_LINE =
  "Właściciel, kierownik/admin i pracownik liczą się jako osoby.";

export const PRICING_SUMMARY_LINES = [
  PRICING_INTRO_LINE,
  PRICING_STANDARD_LINE,
  PRICING_INCLUDED_SEATS_LINE,
  PRICING_EXTRA_SEAT_LINE,
  PRICING_WHO_COUNTS_LINE,
] as const;

/** Short form for tight UI (login type card). */
export const PRICING_SUMMARY_COMPACT =
  "Subskrypcja: 250 zł / mies. (2 msc.), potem 400 zł · 10 osób w cenie · +40 zł / osoba";
