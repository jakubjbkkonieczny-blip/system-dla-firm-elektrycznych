import "server-only";
import { BillingService } from "@/lib/server/billing/billing-service";

export async function syncSubscriptionForUser(userId: string): Promise<void> {
  return BillingService.syncSubscriptionQuantities(userId);
}

/**
 * Sync seat quantities for the company billing owner.
 * Wire into member invite / activate / deactivate routes in a follow-up phase.
 */
export async function syncSubscriptionForCompany(companyId: string): Promise<void> {
  const ownerUserId = await BillingService.resolveBillingOwnerUserId(companyId);
  if (!ownerUserId) {
    throw new Error("BILLING_OWNER_NOT_FOUND");
  }

  return BillingService.syncSubscriptionQuantities(ownerUserId);
}
