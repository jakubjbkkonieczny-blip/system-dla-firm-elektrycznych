import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth, db } from "@/lib/firebase/admin";

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

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const userSnap = await db.collection("users").doc(uid).get();
    const user = userSnap.exists ? (userSnap.data() as any) : null;

    if (user?.role !== "employer") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const existingCustomerId = user?.billing?.customerId || undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${appUrl()}/settings?checkout=success`,
      cancel_url: `${appUrl()}/settings?checkout=cancel`,
      customer: existingCustomerId,
      customer_email: existingCustomerId ? undefined : user?.email || decoded.email || undefined,
      metadata: { uid },
      subscription_data: {
        metadata: { uid },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "STRIPE_ERROR" }, { status: 500 });
  }
}