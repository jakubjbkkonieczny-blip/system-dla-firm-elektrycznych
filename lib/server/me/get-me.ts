import "server-only";
import { db } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/server/auth/get-current-user";

type Role = "worker" | "employer";
type BillingStatus = "active" | "inactive";

export type MeData = {
  uid: string;
  canCreateCompany: boolean;
  role: Role | null;
  billingStatus: BillingStatus | null;
  billing: Record<string, unknown> | null;
  displayName: string | null;
};

export async function getMeData(): Promise<MeData> {
  const currentUser = await getCurrentUser();
  if (!currentUser?.uid) {
    throw new Error("MISSING_AUTH");
  }

  const uid = currentUser.uid;
  const userIndexSnap = await db.collection("user_index").doc(uid).get();
  const userSnap = await db.collection("users").doc(uid).get();
  const user = userSnap.exists ? (userSnap.data() as Record<string, any>) : null;

  const role: Role | null =
    user?.role === "employer" || user?.role === "worker"
      ? (user.role as Role)
      : null;

  const billingStatus: BillingStatus | null =
    user?.billing?.status === "active"
      ? "active"
      : user?.billing?.status
      ? "inactive"
      : null;

  const canCreateCompany = userIndexSnap.exists
    ? Boolean((userIndexSnap.data() as Record<string, any>)?.canCreateCompany ?? (role === "employer"))
    : role === "employer";

  return {
    uid,
    canCreateCompany,
    role,
    billingStatus,
    billing: (user?.billing as Record<string, unknown> | undefined) ?? null,
    displayName: (user?.displayName as string | undefined) ?? null,
  };
}
