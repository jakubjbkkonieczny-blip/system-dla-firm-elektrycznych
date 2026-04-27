import "server-only";
import { prisma } from "@/lib/db/prisma";
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

  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: {
      displayName: true,
      accountRole: true,
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

  const billingStatus: BillingStatus | null =
    activeOwned.length === 0
      ? null
      : activeOwned.some((m) => m.company.billingStatus === "active")
        ? "active"
        : "inactive";

  const canCreateCompany = role === "employer" || activeOwned.length > 0;

  return {
    uid,
    canCreateCompany,
    role,
    billingStatus,
    billing: null,
    displayName: user.displayName ?? null,
  };
}
