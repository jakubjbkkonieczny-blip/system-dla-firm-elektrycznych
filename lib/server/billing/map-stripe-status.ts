import "server-only";
import type Stripe from "stripe";

import type { SubscriptionStatus } from "@/lib/server/billing/types";

function isoFromUnix(unix: number | null | undefined): Date | null {
  if (unix == null) return null;
  return new Date(unix * 1000);
}

export function resolveStripeCustomerId(
  customer: Stripe.Subscription["customer"]
): string | null {
  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object" && "id" in customer) {
    return customer.id;
  }
  return null;
}

export function mapStripeSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status,
  cancelAtPeriodEnd: boolean
): SubscriptionStatus {
  if (stripeStatus === "past_due") {
    return "past_due";
  }

  if (stripeStatus === "active" || stripeStatus === "trialing") {
    return cancelAtPeriodEnd ? "cancelled" : stripeStatus;
  }

  return "inactive";
}

export function mapStripeSubscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  return isoFromUnix((sub as Stripe.Subscription & { current_period_end?: number }).current_period_end);
}
