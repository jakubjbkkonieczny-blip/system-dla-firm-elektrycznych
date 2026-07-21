import "server-only";
import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/db/prisma";
import {
  mapStripeSubscriptionPeriodEnd,
  mapStripeSubscriptionStatus,
  resolveStripeCustomerId,
} from "@/lib/server/billing/map-stripe-status";
import { getStripeClient } from "@/lib/server/billing/stripe-client";
import { getIncludedSeats } from "@/lib/server/billing/stripe-price-config";
import { buildSubscriptionItemUpdates } from "@/lib/server/billing/subscription-item-sync";
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
    where: {
      id: { in: owned.map((row) => row.companyId) },
      isActive: true,
    },
    data: { billingStatus },
  });
}

async function applySubscriptionSnapshot(
  userId: string,
  snapshot: SubscriptionSnapshot,
  db: DbClient = prisma
): Promise<void> {
  await syncUserSubscription(userId, snapshot, db);
  await syncOwnerCompaniesBilling(userId, snapshot.subscriptionStatus, db);
}

async function resolveUserIdFromCustomerId(customerId: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return user?.id ?? null;
}

async function resolveUserIdFromSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = (sub.metadata?.userId as string | undefined)?.trim();
  if (fromMeta) return fromMeta;

  const customerId = resolveStripeCustomerId(sub.customer);
  if (!customerId) return null;

  return resolveUserIdFromCustomerId(customerId);
}

async function retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return getStripeClient().subscriptions.retrieve(subscriptionId);
}

function checkoutSnapshot(
  customerId: string | null,
  subscriptionId: string | null,
  subscription: Stripe.Subscription | null
): SubscriptionSnapshot {
  if (subscription) {
    return mapStripeSubscription(subscription);
  }

  return {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: "inactive",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  };
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = (session.metadata?.userId as string | undefined)?.trim() || null;
  if (!userId) return;

  const customerId = resolveStripeCustomerId(session.customer);
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;

  let subscription: Stripe.Subscription | null = null;
  if (subscriptionId) {
    subscription = await retrieveSubscription(subscriptionId);
  }

  const snapshot = checkoutSnapshot(customerId, subscriptionId, subscription);
  await applySubscriptionSnapshot(userId, snapshot);
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
  const userId = await resolveUserIdFromSubscription(sub);
  if (!userId) return;

  const snapshot = mapStripeSubscription(sub);
  await applySubscriptionSnapshot(userId, snapshot);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const userId = await resolveUserIdFromSubscription(sub);
  if (!userId) return;

  const snapshot: SubscriptionSnapshot = {
    stripeCustomerId: resolveStripeCustomerId(sub.customer),
    stripeSubscriptionId: sub.id,
    subscriptionStatus: "inactive",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: mapStripeSubscriptionPeriodEnd(sub),
  };

  await applySubscriptionSnapshot(userId, snapshot);
}

async function resolveUserIdFromInvoice(invoice: Stripe.Invoice): Promise<string | null> {
  const customerId = resolveStripeCustomerId(invoice.customer);
  if (!customerId) return null;
  return resolveUserIdFromCustomerId(customerId);
}

async function subscriptionIdFromInvoice(invoice: Stripe.Invoice): Promise<string | null> {
  const extended = invoice as Stripe.Invoice & {
    subscription?: string | { id: string } | null;
    parent?: {
      subscription_details?: {
        subscription?: string | { id: string } | null;
      };
    } | null;
  };

  const direct = extended.subscription;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object" && "id" in direct) {
    return direct.id;
  }

  const parentSub = extended.parent?.subscription_details?.subscription;
  if (typeof parentSub === "string") return parentSub;
  if (parentSub && typeof parentSub === "object" && "id" in parentSub) {
    return parentSub.id;
  }

  const lineSub = invoice.lines?.data?.[0]?.subscription;
  if (typeof lineSub === "string") return lineSub;
  if (lineSub && typeof lineSub === "object" && "id" in lineSub) {
    return lineSub.id;
  }

  return null;
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const userId = await resolveUserIdFromInvoice(invoice);
  if (!userId) return;

  const subscriptionId = await subscriptionIdFromInvoice(invoice);
  if (subscriptionId) {
    const sub = await retrieveSubscription(subscriptionId);
    const snapshot = mapStripeSubscription(sub);
    await applySubscriptionSnapshot(userId, snapshot);
    return;
  }

  const customerId = resolveStripeCustomerId(invoice.customer);
  const snapshot: SubscriptionSnapshot = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: null,
    subscriptionStatus: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  };
  await applySubscriptionSnapshot(userId, snapshot);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const userId = await resolveUserIdFromInvoice(invoice);
  if (!userId) return;

  const subscriptionId = await subscriptionIdFromInvoice(invoice);

  if (subscriptionId) {
    const sub = await retrieveSubscription(subscriptionId);
    const snapshot = mapStripeSubscription(sub);

    if (snapshot.subscriptionStatus === "active" || snapshot.subscriptionStatus === "trialing") {
      await applySubscriptionSnapshot(userId, {
        ...snapshot,
        subscriptionStatus: "past_due",
      });
      return;
    }

    await applySubscriptionSnapshot(userId, snapshot);
    return;
  }

  const customerId = resolveStripeCustomerId(invoice.customer);
  const snapshot: SubscriptionSnapshot = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: null,
    subscriptionStatus: "past_due",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  };
  await applySubscriptionSnapshot(userId, snapshot);
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      return;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      return;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      return;
    default:
      return;
  }
}

export async function assertCompanyAccessAllowed(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isActive: true, billingStatus: true, subscriptionEndsAt: true },
  });

  if (!company || !company.isActive) {
    throw new Error("COMPANY_NOT_FOUND");
  }

  const ownerMember = await prisma.companyMember.findFirst({
    where: { companyId, role: "owner", isActive: true },
    select: {
      user: {
        select: {
          subscriptionStatus: true,
          subscriptionEndsAt: true,
          subscriptionCancelAtPeriodEnd: true,
          stripeSubscriptionId: true,
        },
      },
    },
  });

  const subscriptionEndsAt =
    company.subscriptionEndsAt ?? ownerMember?.user.subscriptionEndsAt ?? null;

  const companyStatus = normalizeSubscriptionStatus(company.billingStatus);
  const companyEffective = deriveEffectiveStatus({
    subscriptionStatus: companyStatus,
    subscriptionEndsAt,
    subscriptionCancelAtPeriodEnd: companyStatus === "cancelled",
    stripeSubscriptionId: ownerMember?.user.stripeSubscriptionId ?? null,
  });

  if (companyEffective.allowsAccess) {
    return;
  }

  if (ownerMember?.user) {
    const ownerEffective = deriveEffectiveStatus(ownerMember.user);
    if (ownerEffective.allowsAccess) {
      return;
    }
  }

  throw new Error("BILLING_INACTIVE");
}

export async function assertUserCanCreateCompany(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      accountRole: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      subscriptionCancelAtPeriodEnd: true,
      stripeSubscriptionId: true,
    },
  });

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  if (user.accountRole !== "employer") {
    throw new Error("FORBIDDEN_ROLE");
  }

  const effective = deriveEffectiveStatus(user);
  if (!effective.allowsAccess) {
    throw new Error("BILLING_INACTIVE");
  }
}

export async function countBillableSeatsForEmployer(userId: string): Promise<number> {
  const ownedCompanies = await prisma.companyMember.findMany({
    where: { userId, role: "owner", isActive: true },
    select: { companyId: true },
  });

  if (ownedCompanies.length === 0) {
    return 0;
  }

  return prisma.companyMember.count({
    where: {
      companyId: { in: ownedCompanies.map((row) => row.companyId) },
      isActive: true,
    },
  });
}

/** Resolves the employer account that owns billing for a company (for future member triggers). */
export async function resolveBillingOwnerUserId(companyId: string): Promise<string | null> {
  const owner = await prisma.companyMember.findFirst({
    where: { companyId, role: "owner", isActive: true },
    select: { userId: true },
  });

  return owner?.userId ?? null;
}

export async function syncSubscriptionQuantities(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      accountRole: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  if (!user) throw new Error("USER_NOT_FOUND");
  if (user.accountRole !== "employer") throw new Error("FORBIDDEN_ROLE");

  const customerId = user.stripeCustomerId;
  const subscriptionId = user.stripeSubscriptionId;
  if (!customerId || !subscriptionId) {
    throw new Error("MISSING_STRIPE_IDS");
  }

  const activeMembers = await countBillableSeatsForEmployer(userId);
  const includedSeats = getIncludedSeats();
  const extraSeatQty = Math.max(0, activeMembers - includedSeats);

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const items = buildSubscriptionItemUpdates(subscription, extraSeatQty);

  await stripe.subscriptions.update(subscriptionId, {
    items,
    proration_behavior: "create_prorations",
  });
}

export const BillingService = {
  mapStripeSubscription,
  deriveEffectiveStatus,
  syncUserSubscription,
  syncOwnerCompaniesBilling,
  handleWebhookEvent,
  assertCompanyAccessAllowed,
  assertUserCanCreateCompany,
  countBillableSeatsForEmployer,
  resolveBillingOwnerUserId,
  syncSubscriptionQuantities,
};
