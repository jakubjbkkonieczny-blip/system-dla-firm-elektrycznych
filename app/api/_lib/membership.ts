import "server-only";
import { prisma } from "@/lib/db/prisma";

export type ActiveMember = {
  role: string;
  scope: string | null;
  userId: string;
  isActive: boolean;
};

export async function requireActiveMember(companyId: string, userId: string): Promise<ActiveMember> {
  const m = await prisma.companyMember.findUnique({
    where: { companyId_userId: { companyId, userId } },
  });

  if (!m || !m.isActive) throw new Error("NOT_MEMBER");

  return {
    role: m.role,
    scope: m.scope,
    userId: m.userId,
    isActive: m.isActive,
  };
}
