import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/server/auth/get-current-user";

export type MyCompany = {
  id: string;
  name: string;
};

export async function getMyCompanies(): Promise<MyCompany[]> {
  const currentUser = await getCurrentUser();
  if (!currentUser?.uid) {
    throw new Error("MISSING_AUTH");
  }

  const uid = currentUser.uid;

  const memberships = await prisma.companyMember.findMany({
    where: { userId: uid, isActive: true },
    include: {
      company: { select: { id: true, name: true, isActive: true } },
    },
  });

  return memberships
    .filter((m) => m.company.isActive)
    .map((m) => ({
      id: m.company.id,
      name: String(m.company.name ?? "(no name)"),
    }));
}
