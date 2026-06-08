import "server-only";
import { BillingService } from "@/lib/server/billing/billing-service";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/server/auth/get-current-user";
import type { SubscriptionStatus } from "@/lib/server/billing/types";

type Role = "worker" | "employer";

export type MeBilling = {
  subscriptionEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
  hasStripeSubscription: boolean;
};

export type MeData = {
  uid: string;
  canCreateCompany: boolean;
  role: Role | null;
  billingStatus: SubscriptionStatus | null;
  billing: MeBilling;
  displayName: string | null;
  theme: "LIGHT_BUSINESS" | "DARK_ELECTRIC";
};

function buildBillingObject(user: {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionEndsAt: Date | null;
  subscriptionCancelAtPeriodEnd: boolean;
}): MeBilling {
  return {
    subscriptionEndsAt: user.subscriptionEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
    hasStripeCustomer: Boolean(user.stripeCustomerId),
    hasStripeSubscription: Boolean(user.stripeSubscriptionId),
  };
}

export async function getMeData(): Promise<MeData> {
  const currentUser = await getCurrentUser();
  if (!currentUser?.uid) {
    throw new Error("MISSING_AUTH");
  }

  const uid = currentUser.uid;

  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: {
      displayName: true,
      accountRole: true,
      theme: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      subscriptionCancelAtPeriodEnd: true,
    },
  });

  if (!user) {
    throw new Error("MISSING_AUTH");
  }

  const role: Role | null =
    user.accountRole === "employer" || user.accountRole === "worker"
      ? (user.accountRole as Role)
      : null;

  const ownedCompanies = await prisma.companyMember.findMany({
    where: { userId: uid, role: "owner", isActive: true },
    include: { company: { select: { isActive: true } } },
  });

  const activeOwned = ownedCompanies.filter((m) => m.company.isActive);

  let billingStatus: SubscriptionStatus | null = null;

  if (role === "employer") {
    billingStatus = BillingService.deriveEffectiveStatus(user).status;
  }

  const canCreateCompany = role === "employer" || activeOwned.length > 0;

  return {
    uid,
    canCreateCompany,
    role,
    billingStatus,
    billing: buildBillingObject(user),
    displayName: user.displayName ?? null,
    theme: user.theme,
  };
}
