import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { BudgetExportData } from "@/lib/jobs/budget/export-data";
import { loadBudgetPayload } from "@/lib/server/jobs/budget-response";

export async function loadBudgetExportData(
  companyId: string,
  jobId: string
): Promise<BudgetExportData> {
  const [company, job, payload] = await Promise.all([
    prisma.company.findFirst({
      where: { id: companyId },
      select: { name: true },
    }),
    prisma.job.findFirst({
      where: { id: jobId, companyId, deletedAt: null },
      select: {
        id: true,
        jobNumber: true,
        customerName: true,
        addressCity: true,
        addressStreet: true,
        status: true,
      },
    }),
    loadBudgetPayload(companyId, jobId),
  ]);

  if (!company) throw new Error("COMPANY_NOT_FOUND");
  if (!job) throw new Error("JOB_NOT_FOUND");

  return {
    companyName: company.name,
    job: {
      id: job.id,
      jobNumber: job.jobNumber,
      customerName: job.customerName,
      addressCity: job.addressCity,
      addressStreet: job.addressStreet,
      status: job.status,
    },
    exportedAt: new Date().toISOString(),
    budget: payload.budget,
    items: payload.items,
    laborItems: payload.laborItems,
    summary: payload.summary,
  };
}
