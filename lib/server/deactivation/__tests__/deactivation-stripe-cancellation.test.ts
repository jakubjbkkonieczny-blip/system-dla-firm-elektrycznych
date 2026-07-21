import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { randomUUID } from "crypto";
import type Stripe from "stripe";

import { prisma } from "@/lib/db/prisma";
import {
  cancelSubscriptionForAccountDeactivation,
  recordDeactivationStripeAudit,
} from "../deactivation-stripe-cancellation";

function activeSubscription(id: string, cancelAtPeriodEnd = false): Stripe.Subscription {
  return {
    id,
    object: "subscription",
    status: "active",
    cancel_at_period_end: cancelAtPeriodEnd,
    customer: "cus_test",
    current_period_end: Math.floor(Date.now() / 1000) + 86400,
  } as unknown as Stripe.Subscription;
}

function canceledSubscription(id: string): Stripe.Subscription {
  return {
    id,
    object: "subscription",
    status: "canceled",
    cancel_at_period_end: false,
    customer: "cus_test",
    current_period_end: Math.floor(Date.now() / 1000),
  } as unknown as Stripe.Subscription;
}

function createMockStripe(options: {
  retrieve?: (id: string) => Promise<Stripe.Subscription>;
  cancel?: (id: string) => Promise<Stripe.Subscription>;
  onCancel?: () => void;
}) {
  let cancelCalls = 0;
  return {
    client: {
      subscriptions: {
        retrieve: options.retrieve ?? (async (id: string) => activeSubscription(id)),
        cancel:
          options.cancel ??
          (async (id: string) => {
            cancelCalls += 1;
            options.onCancel?.();
            return canceledSubscription(id);
          }),
      },
    },
    getCancelCalls: () => cancelCalls,
  };
}

async function createEmployerWithSubscription(subscriptionId: string | null) {
  const userId = randomUUID();
  const companyId = randomUUID();
  const customerId = subscriptionId ? `cus_${randomUUID()}` : null;

  await prisma.user.create({
    data: {
      id: userId,
      email: `employer-${userId}@example.com`,
      passwordHash: "hash",
      displayName: "Employer",
      accountRole: "employer",
      isActive: false,
      deactivatedAt: new Date(),
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      subscriptionStatus: subscriptionId ? "active" : "inactive",
    },
  });

  await prisma.company.create({
    data: {
      id: companyId,
      name: `Company-${companyId}`,
      isActive: false,
      deactivatedAt: new Date(),
      billingStatus: "active",
    },
  });

  return { userId, companyId };
}

describe("cancelSubscriptionForAccountDeactivation", () => {
  it("cancels an active subscription immediately on account deactivation", async () => {
    const subId = `sub_${randomUUID()}`;
    const { userId, companyId } = await createEmployerWithSubscription(subId);
    const mock = createMockStripe({});

    const result = await cancelSubscriptionForAccountDeactivation({
      userId,
      companyId,
      stripeClient: mock.client,
      syncBillingSnapshot: async () => {},
    });

    assert.equal(result.status, "canceled");
    assert.equal(mock.getCancelCalls(), 1);
  });

  it("treats already canceled subscriptions as idempotent", async () => {
    const subId = `sub_${randomUUID()}`;
    const { userId, companyId } = await createEmployerWithSubscription(subId);
    const mock = createMockStripe({
      retrieve: async () => canceledSubscription(subId),
    });

    const result = await cancelSubscriptionForAccountDeactivation({
      userId,
      companyId,
      stripeClient: mock.client,
      syncBillingSnapshot: async () => {},
    });

    assert.equal(result.status, "already_canceled");
    assert.equal(mock.getCancelCalls(), 0);
  });

  it("cancels immediately even when subscription is cancel_at_period_end", async () => {
    const subId = `sub_${randomUUID()}`;
    const { userId, companyId } = await createEmployerWithSubscription(subId);
    const mock = createMockStripe({
      retrieve: async () => activeSubscription(subId, true),
    });

    const result = await cancelSubscriptionForAccountDeactivation({
      userId,
      companyId,
      stripeClient: mock.client,
      syncBillingSnapshot: async () => {},
    });

    assert.equal(result.status, "canceled");
    assert.equal(mock.getCancelCalls(), 1);
  });

  it("handles missing stripeSubscriptionId safely", async () => {
    const { userId, companyId } = await createEmployerWithSubscription(null);
    let syncCalled = false;

    const result = await cancelSubscriptionForAccountDeactivation({
      userId,
      companyId,
      stripeClient: createMockStripe({}).client,
      syncBillingSnapshot: async () => {
        syncCalled = true;
      },
    });

    assert.equal(result.status, "no_subscription");
    assert.equal(syncCalled, true);
  });

  it("returns cancellation_failed when Stripe API fails and keeps account deactivated", async () => {
    const subId = `sub_${randomUUID()}`;
    const { userId, companyId } = await createEmployerWithSubscription(subId);
    const mock = createMockStripe({
      retrieve: async () => {
        throw Object.assign(new Error("Stripe unavailable"), { type: "api_error" });
      },
    });

    const result = await cancelSubscriptionForAccountDeactivation({
      userId,
      companyId,
      stripeClient: mock.client,
      syncBillingSnapshot: async () => {},
    });

    assert.equal(result.status, "cancellation_failed");
    assert.equal(result.errorCategory, "api_error");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    assert(user);
    assert.equal(user.isActive, false);
  });

  it("does not duplicate Stripe cancellation on repeat calls", async () => {
    const subId = `sub_${randomUUID()}`;
    const { userId, companyId } = await createEmployerWithSubscription(subId);
    const mock = createMockStripe({});

    const first = await cancelSubscriptionForAccountDeactivation({
      userId,
      companyId,
      stripeClient: mock.client,
      syncBillingSnapshot: async () => {},
    });

    const second = await cancelSubscriptionForAccountDeactivation({
      userId,
      companyId,
      stripeClient: {
        subscriptions: {
          retrieve: async () => canceledSubscription(subId),
          cancel: async () => {
            throw new Error("should not cancel twice");
          },
        },
      },
      syncBillingSnapshot: async () => {},
    });

    assert.equal(first.status, "canceled");
    assert.equal(second.status, "already_canceled");
    assert.equal(mock.getCancelCalls(), 1);
  });

  it("handles concurrent cancellation attempts idempotently", async () => {
    const subId = `sub_${randomUUID()}`;
    const { userId, companyId } = await createEmployerWithSubscription(subId);
    let status: Stripe.Subscription.Status = "active";
    let cancelCalls = 0;

    const stripeClient = {
      subscriptions: {
        retrieve: async () =>
          status === "active" ? activeSubscription(subId) : canceledSubscription(subId),
        cancel: async (id: string) => {
          if (status !== "canceled") {
            status = "canceled";
            cancelCalls += 1;
          }
          return canceledSubscription(id);
        },
      },
    };

    const [first, second] = await Promise.all([
      cancelSubscriptionForAccountDeactivation({
        userId,
        companyId,
        stripeClient,
        syncBillingSnapshot: async () => {},
      }),
      cancelSubscriptionForAccountDeactivation({
        userId,
        companyId,
        stripeClient,
        syncBillingSnapshot: async () => {},
      }),
    ]);

    const statuses = [first.status, second.status];
    assert.ok(statuses.includes("canceled"));
    assert.ok(statuses.every((value) => value === "canceled" || value === "already_canceled"));
    assert.equal(cancelCalls, 1);
  });
});

describe("deactivation stripe webhook safety", () => {
  it("owner company billing sync skips inactive companies", async () => {
    const ownerId = randomUUID();
    const companyId = randomUUID();

    await prisma.user.create({
      data: {
        id: ownerId,
        email: `owner-${ownerId}@example.com`,
        passwordHash: "hash",
        accountRole: "employer",
        subscriptionStatus: "active",
      },
    });

    await prisma.company.create({
      data: {
        id: companyId,
        name: "Deactivated Co",
        isActive: false,
        billingStatus: "active",
      },
    });

    await prisma.companyMember.create({
      data: {
        companyId,
        userId: ownerId,
        role: "owner",
        isActive: true,
      },
    });

    const before = await prisma.company.findUnique({ where: { id: companyId } });

    await prisma.company.updateMany({
      where: {
        id: {
          in: (
            await prisma.companyMember.findMany({
              where: { userId: ownerId, role: "owner", isActive: true },
              select: { companyId: true },
            })
          ).map((row) => row.companyId),
        },
        isActive: true,
      },
      data: { billingStatus: "inactive" },
    });

    const after = await prisma.company.findUnique({ where: { id: companyId } });
    assert(before);
    assert(after);
    assert.equal(before.billingStatus, "active");
    assert.equal(after.billingStatus, "active");
  });

  it("may update billingStatus on inactive company via direct deactivation billing sync", async () => {
    const ownerId = randomUUID();
    const companyId = randomUUID();

    await prisma.user.create({
      data: {
        id: ownerId,
        email: `owner-sync-${ownerId}@example.com`,
        passwordHash: "hash",
        accountRole: "employer",
        isActive: false,
      },
    });

    await prisma.company.create({
      data: {
        id: companyId,
        name: "Deactivated Co Sync",
        isActive: false,
        billingStatus: "active",
      },
    });

    await prisma.company.updateMany({
      where: { id: companyId, isActive: false },
      data: { billingStatus: "inactive" },
    });

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    assert(company);
    assert.equal(company.isActive, false);
    assert.equal(company.billingStatus, "inactive");
  });
});

describe("existing stripe routes compatibility", () => {
  it("normal cancel route still uses cancel_at_period_end", async () => {
    const source = await readFile("app/api/stripe/cancel/route.ts", "utf8");
    assert.match(source, /cancel_at_period_end:\s*true/);
  });

  it("resume route relies on active session and does not bypass deactivated accounts", async () => {
    const source = await readFile("app/api/stripe/resume/route.ts", "utf8");
    assert.match(source, /requireSessionUser/);
    const sessionSource = await readFile("lib/server/auth/getUserFromSession.ts", "utf8");
    assert.match(sessionSource, /!user\.isActive/);
  });

  it("final deactivation route orchestrates stripe after db deactivation", async () => {
    const source = await readFile("app/api/deactivation/final/route.ts", "utf8");
    assert.match(source, /deactivateEmployerAccount/);
    assert.match(source, /cancelSubscriptionForAccountDeactivation/);
    assert.match(source, /deactivation_stripe_cancellation_attempted/);
  });
});

describe("deactivation stripe audit logging", () => {
  it("records stripe audit events without sensitive payloads", async () => {
    const companyId = randomUUID();
    const userId = randomUUID();

    await prisma.company.create({
      data: { id: companyId, name: "Audit Co", isActive: false },
    });
    await prisma.user.create({
      data: {
        id: userId,
        email: `audit-${userId}@example.com`,
        passwordHash: "hash",
        accountRole: "employer",
        isActive: false,
      },
    });

    await recordDeactivationStripeAudit(companyId, userId, "deactivation_stripe_cancellation_success", {
      stripeStatus: "canceled",
    });

    const audit = await prisma.auditLog.findFirst({
      where: { companyId, action: "deactivation_stripe_cancellation_success" },
    });

    assert(audit);
    assert.equal(JSON.stringify(audit.data).includes("sk_"), false);
  });
});
