import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteErrorOr } from "@/lib/server/auth/handle-session-route-error";
import { BillingService } from "@/lib/server/billing/billing-service";
import { getStripeBillingPrices } from "@/lib/server/billing/stripe-price-config";
import { getStripeClient } from "@/lib/server/billing/stripe-client";

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL ||
    "http://localhost:3000"
  );
}

export async function POST() {
  try {
    const sessionUser = await requireSessionUser();
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        email: true,
        accountRole: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        subscriptionCancelAtPeriodEnd: true,
      },
    });

    if (!user || user.accountRole !== "employer") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const effective = BillingService.deriveEffectiveStatus(user);
    if (user.stripeSubscriptionId && effective.allowsAccess) {
      return NextResponse.json({ error: "SUBSCRIPTION_ALREADY_ACTIVE" }, { status: 409 });
    }

    const { basePriceId, introCouponId } = getStripeBillingPrices();
    const existingCustomerId = user.stripeCustomerId ?? undefined;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: basePriceId, quantity: 1 }],
      success_url: `${appUrl()}/settings?checkout=success`,
      cancel_url: `${appUrl()}/settings?checkout=cancel`,
      customer: existingCustomerId,
      customer_email: existingCustomerId ? undefined : user.email,
      metadata: { userId: user.id },
      subscription_data: {
        metadata: { userId: user.id },
      },
    };

    if (introCouponId) {
      sessionParams.discounts = [{ coupon: introCouponId }];
    }

    const checkoutSession = await getStripeClient().checkout.sessions.create(sessionParams);

    if (!checkoutSession.url) {
      return NextResponse.json({ error: "NO_CHECKOUT_URL" }, { status: 500 });
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, (msg) => {
      if (msg === "SUBSCRIPTION_ALREADY_ACTIVE") return 409;
      return null;
    });
  }
}
