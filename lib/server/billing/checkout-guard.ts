import "server-only";
import type Stripe from "stripe";

import {
  deriveEffectiveStatus,
  mapStripeSubscription,
} from "@/lib/server/billing/billing-service";
import { getStripeClient } from "@/lib/server/billing/stripe-client";
import type { UserBillingSnapshot } from "@/lib/server/billing/types";

type CheckoutUser = UserBillingSnapshot & {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

function isStripeMissingResource(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "resource_missing"
  );
}

function effectiveFromStripeSubscription(sub: Stripe.Subscription) {
  const snapshot = mapStripeSubscription(sub);
  return deriveEffectiveStatus({
    subscriptionStatus: snapshot.subscriptionStatus,
    subscriptionEndsAt: snapshot.currentPeriodEnd,
    subscriptionCancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    stripeSubscriptionId: snapshot.stripeSubscriptionId,
  });
}

function assertNoBlockingSubscription(sub: Stripe.Subscription): void {
  if (effectiveFromStripeSubscription(sub).allowsAccess) {
    throw new Error("SUBSCRIPTION_ALREADY_ACTIVE");
  }
}

/**
 * Blocks checkout when the user already has access or Stripe still has a billable subscription.
 */
export async function assertCheckoutAllowed(user: CheckoutUser): Promise<void> {
  const effective = deriveEffectiveStatus(user);
  if (effective.allowsAccess) {
    throw new Error("SUBSCRIPTION_ALREADY_ACTIVE");
  }

  const stripe = getStripeClient();

  if (user.stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      assertNoBlockingSubscription(sub);
    } catch (error) {
      if (!isStripeMissingResource(error)) {
        throw error;
      }
    }
  }

  if (user.stripeCustomerId) {
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: "all",
      limit: 100,
    });

    for (const sub of subscriptions.data) {
      assertNoBlockingSubscription(sub);
    }
  }
}
