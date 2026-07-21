import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import type { EmailAuditAction } from "./types";

type RecordEmailAuditInput = {
  companyId: string;
  userId: string;
  action: EmailAuditAction;
  data?: Record<string, unknown>;
};

export async function recordEmailAudit(input: RecordEmailAuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      action: input.action,
      entityType: "User",
      entityId: input.userId,
      data: (input.data ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function resolveEmployerOwnerCompanyId(userId: string): Promise<string | null> {
  const membership = await prisma.companyMember.findFirst({
    where: { userId, role: "owner" },
    orderBy: { updatedAt: "desc" },
    select: { companyId: true },
  });

  return membership?.companyId ?? null;
}
