import type Stripe from "stripe";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type DeactivationStripeCancellationStatus =
  | "canceled"
  | "already_canceled"
  | "no_subscription"
  | "cancellation_failed";

export type DeactivationStripeCancellationResult = {
  status: DeactivationStripeCancellationStatus;
  errorCategory?: string;
};

export type StripeSubscriptionsClient = {
  subscriptions: {
    retrieve: (id: string) => Promise<Stripe.Subscription>;
    cancel: (id: string) => Promise<Stripe.Subscription>;
  };
};

export type CancelSubscriptionForDeactivationInput = {
  userId: string;
  companyId: string;
  stripeClient?: StripeSubscriptionsClient;
  syncBillingSnapshot?: (
    userId: string,
    companyId: string,
    subscription: Stripe.Subscription | null
  ) => Promise<void>;
};

function isStripeMissingResource(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "resource_missing"
  );
}

function categorizeStripeError(error: unknown): string {
  if (typeof error === "object" && error !== null && "type" in error) {
    const type = (error as { type?: string }).type;
    if (typeof type === "string" && type.length > 0) {
      return type;
    }
  }
  return "stripe_api_error";
}

function isTerminalSubscription(sub: Stripe.Subscription): boolean {
  return sub.status === "canceled" || sub.status === "incomplete_expired";
}

async function defaultSyncBillingSnapshot(
  userId: string,
  companyId: string,
  subscription: Stripe.Subscription | null
): Promise<void> {
  const { mapStripeSubscription, syncUserSubscription } = await import(
    "@/lib/server/billing/billing-service"
  );

  if (subscription) {
    const snapshot = mapStripeSubscription(subscription);
    await syncUserSubscription(userId, snapshot);
    await prisma.company.updateMany({
      where: { id: companyId, isActive: false },
      data: {
        billingStatus: snapshot.subscriptionStatus,
        subscriptionEndsAt: snapshot.currentPeriodEnd,
      },
    });
    return;
  }

  await syncUserSubscription(userId, {
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: "inactive",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  });
  await prisma.company.updateMany({
    where: { id: companyId },
    data: { billingStatus: "inactive", subscriptionEndsAt: null },
  });
}

async function getDefaultStripeClient(): Promise<StripeSubscriptionsClient> {
  const { getStripeClient } = await import("@/lib/server/billing/stripe-client");
  return getStripeClient();
}

export async function cancelSubscriptionForAccountDeactivation(
  input: CancelSubscriptionForDeactivationInput
): Promise<DeactivationStripeCancellationResult> {
  const { userId, companyId } = input;
  const stripeClient = input.stripeClient ?? (await getDefaultStripeClient());
  const syncBillingSnapshot = input.syncBillingSnapshot ?? defaultSyncBillingSnapshot;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeSubscriptionId: true },
  });

  if (!user?.stripeSubscriptionId) {
    await syncBillingSnapshot(userId, companyId, null);
    return { status: "no_subscription" };
  }

  const subscriptionId = user.stripeSubscriptionId;

  try {
    const existing = await stripeClient.subscriptions.retrieve(subscriptionId);

    if (isTerminalSubscription(existing)) {
      await syncBillingSnapshot(userId, companyId, existing);
      return { status: "already_canceled" };
    }

    const canceled = await stripeClient.subscriptions.cancel(subscriptionId);
    await syncBillingSnapshot(userId, companyId, canceled);
    return { status: "canceled" };
  } catch (error) {
    if (isStripeMissingResource(error)) {
      await syncBillingSnapshot(userId, companyId, null);
      return { status: "already_canceled" };
    }

    return {
      status: "cancellation_failed",
      errorCategory: categorizeStripeError(error),
    };
  }
}

export async function recordDeactivationStripeAudit(
  companyId: string,
  userId: string,
  action:
    | "deactivation_stripe_cancellation_attempted"
    | "deactivation_stripe_cancellation_success"
    | "deactivation_stripe_cancellation_already_inactive"
    | "deactivation_stripe_cancellation_failed"
    | "deactivation_stripe_cancellation_no_subscription",
  data: Record<string, unknown>
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      companyId,
      userId,
      action,
      entityType: "Subscription",
      entityId: companyId,
      data: data as Prisma.InputJsonValue,
    },
  });
}
