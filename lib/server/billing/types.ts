import "server-only";

export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "cancelled",
  "past_due",
  "inactive",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type SubscriptionSnapshot = {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
};

export type UserBillingSnapshot = {
  subscriptionStatus: string | null;
  subscriptionEndsAt: Date | null;
  subscriptionCancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
};

export type CompanyBillingMirror = {
  billingStatus: string | null;
  isActive: boolean;
};

export function isSubscriptionStatus(value: string | null | undefined): value is SubscriptionStatus {
  if (!value) return false;
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export function normalizeSubscriptionStatus(value: string | null | undefined): SubscriptionStatus {
  return isSubscriptionStatus(value) ? value : "inactive";
}

export function subscriptionPeriodActive(subscriptionEndsAt: Date | null): boolean {
  if (!subscriptionEndsAt) return true;
  return subscriptionEndsAt.getTime() > Date.now();
}

/**
 * Access policy (no read-only grace for past_due at this stage):
 * active/trialing -> allowed
 * cancelled -> allowed until subscriptionEndsAt
 * past_due/inactive -> blocked
 */
export function statusAllowsAccess(
  status: SubscriptionStatus,
  subscriptionEndsAt: Date | null
): boolean {
  if (status === "active" || status === "trialing") {
    return true;
  }

  if (status === "cancelled") {
    return subscriptionPeriodActive(subscriptionEndsAt);
  }

  return false;
}
