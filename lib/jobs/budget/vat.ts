/** VAT rates that skip automatic net/gross calculation. */
export const VAT_NO_CALC = ["zw.", "nie dotyczy"] as const;

const PRESET_BASIS_POINTS: Record<string, number> = {
  "23%": 2300,
  "8%": 800,
  "5%": 500,
  "0%": 0,
};

export type ParsedVatRate = {
  valid: boolean;
  basisPoints: number | null;
};

export function isVatCalculable(rate: string | null | undefined): boolean {
  if (!rate) return false;
  return !(VAT_NO_CALC as readonly string[]).includes(rate);
}

/** Accepts preset rates, zw./nie dotyczy, or custom e.g. "12.5%" (0–100). */
export function parseVatRateString(rate: string): ParsedVatRate {
  if ((VAT_NO_CALC as readonly string[]).includes(rate)) {
    return { valid: true, basisPoints: null };
  }
  if (rate in PRESET_BASIS_POINTS) {
    return { valid: true, basisPoints: PRESET_BASIS_POINTS[rate] };
  }
  const match = /^(\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)%$/.exec(rate);
  if (!match) return { valid: false, basisPoints: null };
  const pct = Number(rate.replace("%", ""));
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return { valid: false, basisPoints: null };
  }
  return { valid: true, basisPoints: Math.round(pct * 100) };
}

export function isValidVatRate(rate: string): boolean {
  return parseVatRateString(rate).valid;
}

export function netFromGrossCents(grossCents: number, basisPoints: number): number {
  return Math.round((grossCents * 10000) / (10000 + basisPoints));
}

export function taxFromNetCents(netCents: number, basisPoints: number): number {
  return Math.round((netCents * basisPoints) / 10000);
}

export type VatAmounts = {
  netCents: number;
  taxCents: number;
  grossCents: number;
};

export function amountsFromGrossCents(grossCents: number, vatRate: string): VatAmounts {
  const parsed = parseVatRateString(vatRate);
  if (!parsed.valid) {
    return { netCents: grossCents, taxCents: 0, grossCents };
  }
  if (parsed.basisPoints === null) {
    return { netCents: grossCents, taxCents: 0, grossCents };
  }
  const netCents = netFromGrossCents(grossCents, parsed.basisPoints);
  const taxCents = grossCents - netCents;
  return { netCents, taxCents, grossCents };
}

export function amountsFromNetCents(netCents: number, vatRate: string): VatAmounts {
  const parsed = parseVatRateString(vatRate);
  if (!parsed.valid) {
    return { netCents, taxCents: 0, grossCents: netCents };
  }
  if (parsed.basisPoints === null) {
    return { netCents, taxCents: 0, grossCents: netCents };
  }
  const taxCents = taxFromNetCents(netCents, parsed.basisPoints);
  const grossCents = netCents + taxCents;
  return { netCents, taxCents, grossCents };
}

export function itemTaxCents(
  netAmountCents: number | null,
  grossAmountCents: number
): number {
  if (netAmountCents == null) return 0;
  return Math.max(0, grossAmountCents - netAmountCents);
}

export function resolveItemAmounts(args: {
  grossAmountCents: number | null;
  netAmountCents: number | null;
  vatRate: string | null;
  amountSource?: "gross" | "net";
}): VatAmounts | null {
  const rate = args.vatRate ?? "nie dotyczy";

  if (args.amountSource === "net" && args.netAmountCents != null) {
    return amountsFromNetCents(args.netAmountCents, rate);
  }
  if (args.grossAmountCents != null) {
    return amountsFromGrossCents(args.grossAmountCents, rate);
  }
  if (args.netAmountCents != null) {
    return amountsFromNetCents(args.netAmountCents, rate);
  }
  return null;
}
