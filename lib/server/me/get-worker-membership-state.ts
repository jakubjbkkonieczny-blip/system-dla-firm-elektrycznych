import "server-only";

import { getCurrentUser } from "@/lib/server/auth/get-current-user";
import {
  deriveWorkerMembershipState,
  type WorkerMembershipState,
} from "@/lib/server/workers/worker-membership-state";
import {
  countActiveCompanyMemberships,
  countCompanyMemberships,
} from "@/lib/server/workers/worker-lifecycle";

export type { WorkerMembershipState };

export async function getWorkerMembershipState(): Promise<WorkerMembershipState> {
  const currentUser = await getCurrentUser();
  if (!currentUser?.uid) {
    throw new Error("MISSING_AUTH");
  }

  const activeCount = await countActiveCompanyMemberships(currentUser.uid);
  const totalCount = await countCompanyMemberships(currentUser.uid);
  return deriveWorkerMembershipState(activeCount, totalCount);
}
