import { resolveItemAmounts } from "@/lib/jobs/budget/vat";

/** Max single amount: 10 000 000,00 PLN */
export const MAX_MONEY_CENTS = 1_000_000_000;

const plnFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPlnFromCents(cents: number): string {
  return plnFormatter.format(cents / 100);
}

export function parsePlnToCents(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const paddedFrac = (frac + "00").slice(0, 2);
  const cents = Number(whole) * 100 + Number(paddedFrac);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_MONEY_CENTS) return null;
  return cents;
}

export { resolveItemAmounts, amountsFromGrossCents, amountsFromNetCents, itemTaxCents } from "@/lib/jobs/budget/vat";

/** Labor cost in cents: (minutes * hourlyRateCents) / 60, rounded. */
export function laborCostCents(plannedMinutes: number, hourlyRateCents: number): number {
  return Math.round((plannedMinutes * hourlyRateCents) / 60);
}

export function parseHoursToMinutes(hoursInput: string): number | null {
  const trimmed = hoursInput.trim().replace(",", ".");
  if (!trimmed) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const hours = Number(trimmed);
  if (!Number.isFinite(hours) || hours < 0 || hours > 9999) return null;
  const minutes = Math.round(hours * 60);
  if (minutes > 599_940) return null;
  return minutes;
}

export function minutesToHoursLabel(minutes: number): string {
  const hours = minutes / 60;
  return hours % 1 === 0 ? String(hours) : hours.toFixed(2).replace(/\.?0+$/, "");
}
