import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as any,
});

export async function POST() {
  try {
    const sessionUser = await requireSessionUser();
    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (!user) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }
    if (user.accountRole !== "employer") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const subId = user.stripeSubscriptionId;
    if (!subId) {
      return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 400 });
    }

    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });

    await prisma.user.update({
      where: { id: user.id },
      data: { subscriptionCancelAtPeriodEnd: true },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
