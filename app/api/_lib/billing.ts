import "server-only";
import { BillingService } from "@/lib/server/billing/billing-service";

export async function syncSubscriptionForUser(userId: string): Promise<void> {
  return BillingService.syncSubscriptionQuantities(userId);
}
