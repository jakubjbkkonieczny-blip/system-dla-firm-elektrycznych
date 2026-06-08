import "server-only";
import type Stripe from "stripe";

import {
  getLegacyStripePriceIds,
  getStripeBillingPrices,
} from "@/lib/server/billing/stripe-price-config";

function itemsByPriceId(
  subscription: Stripe.Subscription,
  priceId: string
): Stripe.SubscriptionItem[] {
  return subscription.items.data.filter((item) => item.price.id === priceId);
}

function pushDelete(
  updates: Stripe.SubscriptionUpdateParams.Item[],
  itemId: string
): void {
  if (updates.some((entry) => entry.id === itemId && entry.deleted === true)) {
    return;
  }
  updates.push({ id: itemId, deleted: true });
}

/**
 * Builds a subscription item update that enforces exactly one base line item,
 * at most one extra-seat line item, and removes legacy prices.
 */
export function buildSubscriptionItemUpdates(
  subscription: Stripe.Subscription,
  extraSeatQty: number
): Stripe.SubscriptionUpdateParams.Item[] {
  const { basePriceId, extraSeatPriceId } = getStripeBillingPrices();
  const legacyPriceIds = new Set(getLegacyStripePriceIds());
  const updates: Stripe.SubscriptionUpdateParams.Item[] = [];

  const baseItems = itemsByPriceId(subscription, basePriceId);
  const extraSeatItems = itemsByPriceId(subscription, extraSeatPriceId);
  const managedPriceIds = new Set([basePriceId, extraSeatPriceId, ...legacyPriceIds]);

  if (baseItems.length > 0) {
    updates.push({ id: baseItems[0].id, quantity: 1 });
    for (let i = 1; i < baseItems.length; i++) {
      pushDelete(updates, baseItems[i].id);
    }
  } else {
    updates.push({ price: basePriceId, quantity: 1 });
  }

  if (extraSeatQty > 0) {
    if (extraSeatItems.length > 0) {
      updates.push({ id: extraSeatItems[0].id, quantity: extraSeatQty });
      for (let i = 1; i < extraSeatItems.length; i++) {
        pushDelete(updates, extraSeatItems[i].id);
      }
    } else {
      updates.push({ price: extraSeatPriceId, quantity: extraSeatQty });
    }
  } else {
    for (const item of extraSeatItems) {
      pushDelete(updates, item.id);
    }
  }

  for (const item of subscription.items.data) {
    const priceId = item.price.id;

    if (legacyPriceIds.has(priceId)) {
      pushDelete(updates, item.id);
      continue;
    }

    if (!managedPriceIds.has(priceId)) {
      console.warn(
        "[billing] Unmanaged subscription item on",
        subscription.id,
        "price",
        priceId,
        "— not modified"
      );
    }
  }

  return updates;
}
