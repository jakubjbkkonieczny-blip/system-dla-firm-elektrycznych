import Stripe from "stripe";
import { db } from "@/lib/firebase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as any,
});

export async function syncSubscriptionForUser(uid: string) {
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? (userSnap.data() as any) : null;

  if (!user) throw new Error("USER_NOT_FOUND");
  if (user.role !== "employer") throw new Error("FORBIDDEN_ROLE");
  if (user.billing?.status !== "active") throw new Error("SUBSCRIPTION_REQUIRED");

  const customerId = user.billing?.customerId;
  const subscriptionId = user.billing?.subscriptionId;

  if (!customerId || !subscriptionId) {
    throw new Error("MISSING_STRIPE_IDS");
  }

  // liczba aktywnych firm (trzymasz licznik w user.billing.activeCompaniesCount)
  const n = Number(user.billing?.activeCompaniesCount ?? 0);
  const addonQty = Math.max(0, n - 1);

  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  const basePriceId = process.env.STRIPE_PRICE_BASE_400!;
  const addonPriceId = process.env.STRIPE_PRICE_ADDON_250!;

  const baseItem = sub.items.data.find((it) => it.price.id === basePriceId) || null;
  const addonItem = sub.items.data.find((it) => it.price.id === addonPriceId) || null;

  // update: base zawsze 1, addon = addonQty (0 -> usuń)
  const items: Stripe.SubscriptionUpdateParams.Item[] = [];

  if (baseItem) {
    items.push({ id: baseItem.id, quantity: 1 });
  } else {
    items.push({ price: basePriceId, quantity: 1 });
  }

  if (addonQty > 0) {
    if (addonItem) items.push({ id: addonItem.id, quantity: addonQty });
    else items.push({ price: addonPriceId, quantity: addonQty });
  } else {
    // jeśli addon istnieje, usuń go
    if (addonItem) {
      items.push({ id: addonItem.id, deleted: true } as any);
    }
  }

  await stripe.subscriptions.update(subscriptionId, {
    items,
    proration_behavior: "create_prorations",
  });

  await userRef.set(
    {
      billing: {
        activeCompaniesCount: n,
        unitAmountPln: 400 + Math.max(0, n - 1) * 250,
        updatedAt: new Date().toISOString(),
      },
    },
    { merge: true }
  );
}