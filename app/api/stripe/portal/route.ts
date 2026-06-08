import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import { handleSessionRouteError } from "@/lib/server/auth/handle-session-route-error";
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
    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (!user) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }
    if (user.accountRole !== "employer") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const customerId = user.stripeCustomerId;
    if (!customerId) {
      return NextResponse.json({ error: "NO_STRIPE_CUSTOMER" }, { status: 400 });
    }

    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl()}/settings`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "NO_PORTAL_URL" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    return handleSessionRouteError(e);
  }
}
