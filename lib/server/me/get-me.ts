import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/server/auth/get-current-user";

type Role = "worker" | "employer";
type BillingStatus = "active" | "inactive" | "cancelled";

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
  billingStatus: BillingStatus | null;
  billing: MeBilling;
  displayName: string | null;
  theme: "LIGHT_BUSINESS" | "DARK_ELECTRIC";
};

type UserBillingFields = {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionEndsAt: Date | null;
  subscriptionCancelAtPeriodEnd: boolean;
};

function buildBillingObject(user: UserBillingFields): MeBilling {
  return {
    subscriptionEndsAt: user.subscriptionEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
    hasStripeCustomer: Boolean(user.stripeCustomerId),
    hasStripeSubscription: Boolean(user.stripeSubscriptionId),
  };
}

function subscriptionPeriodActive(subscriptionEndsAt: Date | null): boolean {
  if (!subscriptionEndsAt) return true;
  return subscriptionEndsAt.getTime() > Date.now();
}

function deriveBillingStatusFromUser(user: UserBillingFields): BillingStatus {
  if (!user.stripeSubscriptionId) {
    return "inactive";
  }

  const periodActive = subscriptionPeriodActive(user.subscriptionEndsAt);

  if (user.subscriptionCancelAtPeriodEnd) {
    return periodActive ? "cancelled" : "inactive";
  }

  return periodActive ? "active" : "inactive";
}

function deriveBillingStatusFromCompanies(
  activeOwned: { company: { billingStatus: string | null } }[]
): BillingStatus {
  return activeOwned.some((m) => m.company.billingStatus === "active") ? "active" : "inactive";
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
    include: { company: { select: { billingStatus: true, isActive: true } } },
  });

  const activeOwned = ownedCompanies.filter((m) => m.company.isActive);

  let billingStatus: BillingStatus | null = null;

  if (role === "employer") {
    if (activeOwned.length > 0) {
      billingStatus = deriveBillingStatusFromCompanies(activeOwned);
    } else {
      billingStatus = deriveBillingStatusFromUser(user);
    }
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
