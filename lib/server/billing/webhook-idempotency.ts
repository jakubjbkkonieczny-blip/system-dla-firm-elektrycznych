import "server-only";
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/db/prisma";

export type WebhookIdempotencyOutcome = "processed" | "already_processed" | "in_flight";

const STALE_PROCESSING_MS = 5 * 60 * 1000;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 2000);
  return "UNKNOWN_ERROR";
}

async function findEvent(eventId: string) {
  return prisma.stripeWebhookEvent.findUnique({
    where: { eventId },
    select: { status: true, createdAt: true },
  });
}

async function markProcessing(event: Stripe.Event): Promise<"created" | "retry" | "skip"> {
  const existing = await findEvent(event.id);

  if (existing?.status === "processed") {
    return "skip";
  }

  if (existing?.status === "processing") {
    const ageMs = Date.now() - existing.createdAt.getTime();
    if (ageMs < STALE_PROCESSING_MS) {
      return "skip";
    }
  }

  if (existing) {
    await prisma.stripeWebhookEvent.update({
      where: { eventId: event.id },
      data: {
        eventType: event.type,
        status: "processing",
        errorMessage: null,
        processedAt: null,
      },
    });
    return "retry";
  }

  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        eventId: event.id,
        eventType: event.type,
        status: "processing",
      },
    });
    return "created";
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "skip";
    }
    throw error;
  }
}

async function markProcessed(eventId: string): Promise<void> {
  await prisma.stripeWebhookEvent.update({
    where: { eventId },
    data: {
      status: "processed",
      processedAt: new Date(),
      errorMessage: null,
    },
  });
}

async function markFailed(eventId: string, error: unknown): Promise<void> {
  await prisma.stripeWebhookEvent.update({
    where: { eventId },
    data: {
      status: "failed",
      errorMessage: errorMessage(error),
    },
  });
}

/**
 * Ensures each Stripe event id is handled at most once successfully.
 * Returns 200-safe outcomes for duplicates and in-flight deliveries.
 */
export async function processStripeWebhookWithIdempotency(
  event: Stripe.Event,
  handler: () => Promise<void>
): Promise<WebhookIdempotencyOutcome> {
  const existingBefore = await findEvent(event.id);
  if (existingBefore?.status === "processed") {
    return "already_processed";
  }

  const claim = await markProcessing(event);

  if (claim === "skip") {
    const current = await findEvent(event.id);
    if (current?.status === "processed") {
      return "already_processed";
    }
    return "in_flight";
  }

  try {
    await handler();
    await markProcessed(event.id);
    return "processed";
  } catch (error) {
    await markFailed(event.id, error);
    throw error;
  }
}
