import "server-only";
import { prisma } from "@/lib/db/prisma";
import { requireActiveMember } from "@/app/api/_lib/membership";
import { requireOwnerOrAdmin } from "@/lib/server/attendance/require-owner-admin";

export async function requireBudgetAdmin(companyId: string, userId: string) {
  const member = await requireActiveMember(companyId, userId);
  requireOwnerOrAdmin(member);
  return { member };
}

export async function requireJobBudgetAdmin(companyId: string, jobId: string, userId: string) {
  const { member } = await requireBudgetAdmin(companyId, userId);

  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId, deletedAt: null },
    select: { id: true, companyId: true },
  });

  if (!job) throw new Error("JOB_NOT_FOUND");

  return { member, job };
}

export async function getOrCreateJobBudget(companyId: string, jobId: string) {
  const existing = await prisma.jobBudget.findUnique({ where: { jobId } });
  if (existing) return existing;

  return prisma.jobBudget.create({
    data: {
      companyId,
      jobId,
      totalBudgetCents: 0,
    },
  });
}

export async function assertBudgetItemScope(
  companyId: string,
  jobId: string,
  budgetId: string,
  itemId: string
) {
  const item = await prisma.jobBudgetItem.findFirst({
    where: { id: itemId, companyId, jobId, budgetId },
  });
  if (!item) throw new Error("ITEM_NOT_FOUND");
  return item;
}

export async function assertBudgetLaborScope(
  companyId: string,
  jobId: string,
  budgetId: string,
  laborItemId: string
) {
  const item = await prisma.jobBudgetLaborItem.findFirst({
    where: { id: laborItemId, companyId, jobId, budgetId },
  });
  if (!item) throw new Error("LABOR_NOT_FOUND");
  return item;
}

export async function assertCompanyUser(companyId: string, userId: string | null | undefined) {
  if (!userId) return;
  const member = await prisma.companyMember.findFirst({
    where: { companyId, userId, isActive: true },
    select: { id: true },
  });
  if (!member) throw new Error("INVALID_USER");
}
