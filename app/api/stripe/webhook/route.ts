import Stripe from "stripe";
import { db } from "@/lib/firebase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as any,
});

async function resolveUidFromSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const uidFromMeta = (sub as any)?.metadata?.uid as string | undefined;
  if (uidFromMeta) return uidFromMeta;

  const customerId = typeof sub.customer === "string" ? sub.customer : null;
  if (!customerId) return null;

  const mapSnap = await db.collection("stripe_customers").doc(customerId).get();
  if (!mapSnap.exists) return null;

  const uid = String((mapSnap.data() as any)?.uid || "");
  return uid || null;
}

function isoFromUnix(unix: number | null | undefined) {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (e) {
    console.error(e);
    return new Response("Webhook Error", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const uid = session.metadata?.uid || null;
      const customerId =
        typeof session.customer === "string" ? session.customer : null;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;

      let subscription: Stripe.Subscription | null = null;
      if (subscriptionId) {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      }

      if (uid) {
        await db.collection("users").doc(uid).set(
          {
            billing: {
              status: "active",
              customerId: customerId ?? null,
              subscriptionId: subscriptionId ?? null,
              activeCompaniesCount: 0,
              unitAmountPln: 400,
              cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
              subscriptionEndsAt: isoFromUnix(
                (subscription as any)?.current_period_end ?? null
              ),
            },
          },
          { merge: true }
        );
      }

      if (customerId && uid) {
        await db.collection("stripe_customers").doc(customerId).set(
          { uid },
          { merge: true }
        );
      }
    }

    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const uid = await resolveUidFromSubscription(sub);

      if (uid) {
        const stripeStatus = sub.status;
        const localStatus =
          stripeStatus === "active" || stripeStatus === "trialing"
            ? sub.cancel_at_period_end
              ? "cancelled"
              : "active"
            : "inactive";

        await db.collection("users").doc(uid).set(
          {
            billing: {
              status: localStatus,
              customerId: typeof sub.customer === "string" ? sub.customer : null,
              subscriptionId: sub.id,
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              subscriptionEndsAt: isoFromUnix((sub as any)?.current_period_end ?? null),
            },
          },
          { merge: true }
        );
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const uid = await resolveUidFromSubscription(sub);

      if (uid) {
        await db.collection("users").doc(uid).set(
          {
            billing: {
              status: "inactive",
              customerId: typeof sub.customer === "string" ? sub.customer : null,
              subscriptionId: sub.id,
              cancelAtPeriodEnd: false,
              subscriptionEndsAt: isoFromUnix((sub as any)?.current_period_end ?? null),
            },
          },
          { merge: true }
        );
      }
    }

    return new Response("ok");
  } catch (e) {
    console.error(e);
    return new Response("Webhook Handler Error", { status: 500 });
  }
}