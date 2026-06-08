import "server-only";

export const DEFAULT_INCLUDED_SEATS = 10;

export type StripeBillingPrices = {
  basePriceId: string;
  extraSeatPriceId: string;
  introCouponId: string | null;
};

export function getIncludedSeats(): number {
  const raw = process.env.STRIPE_INCLUDED_SEATS?.trim();
  if (!raw) return DEFAULT_INCLUDED_SEATS;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_INCLUDED_SEATS;
  }

  return parsed;
}

export function getStripeBillingPrices(): StripeBillingPrices {
  const basePriceId = process.env.STRIPE_PRICE_BASE_400?.trim();
  const extraSeatPriceId = process.env.STRIPE_PRICE_EXTRA_SEAT_40?.trim();

  if (!basePriceId) {
    throw new Error("STRIPE_PRICE_BASE_400 is not configured");
  }
  if (!extraSeatPriceId) {
    throw new Error("STRIPE_PRICE_EXTRA_SEAT_40 is not configured");
  }

  const introCouponId = process.env.STRIPE_COUPON_INTRO_2M_250?.trim() || null;

  return { basePriceId, extraSeatPriceId, introCouponId };
}

/** Legacy checkout / per-company addon prices — removed from active billing, cleaned up on sync. */
export function getLegacyStripePriceIds(): string[] {
  const ids = [
    process.env.STRIPE_PRICE_ID?.trim(),
    process.env.STRIPE_PRICE_ADDON_250?.trim(),
  ];

  return ids.filter((id): id is string => Boolean(id));
}
