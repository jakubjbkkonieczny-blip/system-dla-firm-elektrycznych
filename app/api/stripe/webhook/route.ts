import { BillingService } from "@/lib/server/billing/billing-service";
import { getStripeClient } from "@/lib/server/billing/stripe-client";
import { processStripeWebhookWithIdempotency } from "@/lib/server/billing/webhook-idempotency";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured.");
    return new Response("Webhook Error", { status: 500 });
  }

  let event;

  try {
    event = getStripeClient().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (error) {
    console.error(error);
    return new Response("Webhook Error", { status: 400 });
  }

  try {
    await processStripeWebhookWithIdempotency(event, () =>
      BillingService.handleWebhookEvent(event)
    );
    return new Response("ok");
  } catch (error) {
    console.error(error);
    return new Response("Webhook Handler Error", { status: 500 });
  }
}
