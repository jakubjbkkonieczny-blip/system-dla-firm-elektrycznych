import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";
import { BillingService } from "@/lib/server/billing/billing-service";
import { getStripeClient } from "@/lib/server/billing/stripe-client";

export async function POST() {
  try {
    const sessionUser = await requireSessionUser();
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        accountRole: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        subscriptionCancelAtPeriodEnd: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }
    if (user.accountRole !== "employer") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (!user.subscriptionCancelAtPeriodEnd) {
      return NextResponse.json({ error: "NOT_CANCELLED_AT_PERIOD_END" }, { status: 400 });
    }

    const effective = BillingService.deriveEffectiveStatus(user);
    if (!effective.allowsAccess) {
      return NextResponse.json({ error: "SUBSCRIPTION_INACTIVE" }, { status: 400 });
    }

    const subId = user.stripeSubscriptionId;
    if (!subId) {
      return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 400 });
    }

    await getStripeClient().subscriptions.update(subId, {
      cancel_at_period_end: false,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
