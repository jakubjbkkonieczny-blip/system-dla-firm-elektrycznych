import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth, db } from "@/lib/firebase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as any,
});

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const user = userSnap.exists ? (userSnap.data() as any) : null;

    if (!user || user.role !== "employer") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const subscriptionId = user?.billing?.subscriptionId;
    if (!subscriptionId) {
      return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 400 });
    }

    const updatedSub = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    const currentPeriodEndUnix =
      (updatedSub as any)?.current_period_end ?? null;

    await userRef.set(
      {
        billing: {
          ...(user?.billing ?? {}),
          status: "cancelled",
          cancelAtPeriodEnd: true,
          subscriptionEndsAt: currentPeriodEndUnix
            ? new Date(currentPeriodEndUnix * 1000).toISOString()
            : null,
        },
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      cancelAtPeriodEnd: true,
      subscriptionEndsAt: currentPeriodEndUnix
        ? new Date(currentPeriodEndUnix * 1000).toISOString()
        : null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "CANCEL_ERROR" }, { status: 500 });
  }
}