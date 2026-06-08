import "server-only";

/** Dev-only billing bypass — never enabled in production. */
export function isDevBillingBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_BILLING_BYPASS?.trim() === "true"
  );
}
