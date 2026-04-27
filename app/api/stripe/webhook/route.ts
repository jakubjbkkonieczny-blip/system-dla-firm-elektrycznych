import Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as any,
});

async function resolveUserIdFromSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = (sub.metadata?.userId as string | undefined)?.trim();
  if (fromMeta) return fromMeta;

  const customerId = typeof sub.customer === "string" ? sub.customer : null;
  if (!customerId) return null;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return user?.id ?? null;
}

function isoFromUnix(unix: number | null | undefined) {
  if (!unix) return null;
  return new Date(unix * 1000);
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

      const userId = session.metadata?.userId || null;
      const customerId =
        typeof session.customer === "string" ? session.customer : null;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;

      let subscription: Stripe.Subscription | null = null;
      if (subscriptionId) {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      }

      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            subscriptionCancelAtPeriodEnd:
              subscription?.cancel_at_period_end ?? false,
            subscriptionEndsAt: isoFromUnix(
              (subscription as { current_period_end?: number })?.current_period_end ?? null
            ),
          },
        });
      }
    }

    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserIdFromSubscription(sub);

      if (userId) {
        const stripeStatus = sub.status;
        const localStatus =
          stripeStatus === "active" || stripeStatus === "trialing"
            ? sub.cancel_at_period_end
              ? "cancelled"
              : "active"
            : "inactive";

        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeCustomerId:
              typeof sub.customer === "string" ? sub.customer : undefined,
            stripeSubscriptionId: sub.id,
            subscriptionCancelAtPeriodEnd: sub.cancel_at_period_end,
            subscriptionEndsAt: isoFromUnix(
              (sub as { current_period_end?: number }).current_period_end ?? null
            ),
          },
        });

        if (localStatus === "active") {
          const owned = await prisma.companyMember.findMany({
            where: { userId, role: "owner", isActive: true },
            select: { companyId: true },
          });
          for (const { companyId } of owned) {
            await prisma.company.update({
              where: { id: companyId },
              data: { billingStatus: "active" },
            });
          }
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserIdFromSubscription(sub);

      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeSubscriptionId: sub.id,
            subscriptionCancelAtPeriodEnd: false,
            subscriptionEndsAt: isoFromUnix(
              (sub as { current_period_end?: number }).current_period_end ?? null
            ),
          },
        });

        const ownedInactive = await prisma.companyMember.findMany({
          where: { userId, role: "owner", isActive: true },
          select: { companyId: true },
        });
        for (const { companyId } of ownedInactive) {
          await prisma.company.update({
            where: { id: companyId },
            data: { billingStatus: "inactive" },
          });
        }
      }
    }

    return new Response("ok");
  } catch (e) {
    console.error(e);
    return new Response("Webhook Handler Error", { status: 500 });
  }
}
