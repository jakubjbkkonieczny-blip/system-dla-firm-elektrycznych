import "server-only";

const REQUIRED_BILLING_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_BASE_400",
  "STRIPE_PRICE_EXTRA_SEAT_40",
] as const;

/**
 * Validates required Stripe billing configuration. Throws with a clear message if anything is missing.
 */
export function validateRequiredBillingEnv(): void {
  const missing = REQUIRED_BILLING_ENV_KEYS.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required billing env: ${missing.join(", ")}`);
  }
}
