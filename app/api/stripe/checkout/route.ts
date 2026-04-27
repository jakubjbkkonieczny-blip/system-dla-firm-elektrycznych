import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as any,
});

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
    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || user.accountRole !== "employer") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const existingCustomerId = user.stripeCustomerId ?? undefined;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${appUrl()}/settings?checkout=success`,
      cancel_url: `${appUrl()}/settings?checkout=cancel`,
      customer: existingCustomerId,
      customer_email: existingCustomerId ? undefined : user.email,
      metadata: { userId: user.id },
      subscription_data: {
        metadata: { userId: user.id },
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "MISSING_AUTH") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "STRIPE_ERROR" }, { status: 500 });
  }
}
