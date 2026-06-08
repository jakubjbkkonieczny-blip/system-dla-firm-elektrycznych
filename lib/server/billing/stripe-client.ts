import "server-only";
import Stripe from "stripe";

import { validateRequiredBillingEnv } from "@/lib/server/billing/validate-billing-env";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    validateRequiredBillingEnv();

    const secretKey = process.env.STRIPE_SECRET_KEY!.trim();

    stripeClient = new Stripe(secretKey, {
      apiVersion: "2024-04-10" as Stripe.LatestApiVersion, // aligned with existing Stripe routes
    });
  }

  return stripeClient;
}
