import "server-only";
import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured.");
    }

    stripeClient = new Stripe(secretKey, {
      apiVersion: "2024-04-10" as Stripe.LatestApiVersion, // aligned with existing Stripe routes
    });
  }

  return stripeClient;
}
