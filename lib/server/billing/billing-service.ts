import "server-only";
import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/db/prisma";
import {
  mapStripeSubscriptionPeriodEnd,
  mapStripeSubscriptionStatus,
  resolveStripeCustomerId,
} from "@/lib/server/billing/map-stripe-status";
import {
  normalizeSubscriptionStatus,
  statusAllowsAccess,
  subscriptionPeriodActive,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
  type UserBillingSnapshot,
} from "@/lib/server/billing/types";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type EffectiveBillingStatus = {
  status: SubscriptionStatus;
  allowsAccess: boolean;
  subscriptionEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
};

export function mapStripeSubscription(sub: Stripe.Subscription): SubscriptionSnapshot {
  const cancelAtPeriodEnd = sub.cancel_at_period_end === true;

  return {
    stripeCustomerId: resolveStripeCustomerId(sub.customer),
    stripeSubscriptionId: sub.id,
    subscriptionStatus: mapStripeSubscriptionStatus(sub.status, cancelAtPeriodEnd),
    cancelAtPeriodEnd,
    currentPeriodEnd: mapStripeSubscriptionPeriodEnd(sub),
  };
}

export function deriveEffectiveStatus(user: UserBillingSnapshot): EffectiveBillingStatus {
  let status = normalizeSubscriptionStatus(user.subscriptionStatus);

  if (status === "cancelled" && user.subscriptionEndsAt && !subscriptionPeriodActive(user.subscriptionEndsAt)) {
    status = "inactive";
  }

  return {
    status,
    allowsAccess: statusAllowsAccess(status, user.subscriptionEndsAt),
    subscriptionEndsAt: user.subscriptionEndsAt,
    cancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
  };
}

export async function syncUserSubscription(
  userId: string,
  snapshot: SubscriptionSnapshot,
  db: DbClient = prisma
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      stripeCustomerId: snapshot.stripeCustomerId ?? undefined,
      stripeSubscriptionId: snapshot.stripeSubscriptionId,
      subscriptionStatus: snapshot.subscriptionStatus,
      subscriptionEndsAt: snapshot.currentPeriodEnd,
      subscriptionCancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    },
  });
}

export async function syncOwnerCompaniesBilling(
  userId: string,
  billingStatus: SubscriptionStatus,
  db: DbClient = prisma
): Promise<void> {
  const owned = await db.companyMember.findMany({
    where: { userId, role: "owner", isActive: true },
    select: { companyId: true },
  });

  if (owned.length === 0) {
    return;
  }

  await db.company.updateMany({
    where: { id: { in: owned.map((row) => row.companyId) } },
    data: { billingStatus },
  });
}

export const BillingService = {
  mapStripeSubscription,
  deriveEffectiveStatus,
  syncUserSubscription,
  syncOwnerCompaniesBilling,
};
