import Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as any,
});

export async function syncSubscriptionForUser(userId: string) {
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

  const ownedCount = await prisma.companyMember.count({
    where: { userId, role: "owner", isActive: true },
  });

  const n = ownedCount;
  const addonQty = Math.max(0, n - 1);

  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  const basePriceId = process.env.STRIPE_PRICE_BASE_400!;
  const addonPriceId = process.env.STRIPE_PRICE_ADDON_250!;

  const baseItem = sub.items.data.find((it) => it.price.id === basePriceId) || null;
  const addonItem = sub.items.data.find((it) => it.price.id === addonPriceId) || null;

  const items: Stripe.SubscriptionUpdateParams.Item[] = [];

  if (baseItem) {
    items.push({ id: baseItem.id, quantity: 1 });
  } else {
    items.push({ price: basePriceId, quantity: 1 });
  }

  if (addonQty > 0) {
    if (addonItem) items.push({ id: addonItem.id, quantity: addonQty });
    else items.push({ price: addonPriceId, quantity: addonQty });
  } else if (addonItem) {
    items.push({ id: addonItem.id, deleted: true } as any);
  }

  await stripe.subscriptions.update(subscriptionId, {
    items,
    proration_behavior: "create_prorations",
  });
}
