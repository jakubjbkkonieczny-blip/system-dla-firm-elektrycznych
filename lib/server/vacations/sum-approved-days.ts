import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { VacationType } from "@/lib/vacations/types";

export async function sumApprovedVacationDaysInRange(params: {
  companyId: string;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  types?: VacationType[];
}): Promise<number> {
  const { companyId, userId, periodStart, periodEnd, types } = params;

  if (types && types.length > 0) {
    const rows = await prisma.$queryRaw<{ days: number }[]>`
      SELECT COALESCE(SUM(
        GREATEST(
          0,
          (LEAST("endDate", ${periodEnd}::date) - GREATEST("startDate", ${periodStart}::date) + 1)
        )
      ), 0)::int AS days
      FROM "VacationRequest"
      WHERE "companyId" = ${companyId}
        AND "userId" = ${userId}
        AND "status" = 'APPROVED'
        AND "type" IN (${Prisma.join(types)})
        AND "startDate" <= ${periodEnd}::date
        AND "endDate" >= ${periodStart}::date
    `;
    return rows[0]?.days ?? 0;
  }

  const rows = await prisma.$queryRaw<{ days: number }[]>`
    SELECT COALESCE(SUM(
      GREATEST(
        0,
        (LEAST("endDate", ${periodEnd}::date) - GREATEST("startDate", ${periodStart}::date) + 1)
      )
    ), 0)::int AS days
    FROM "VacationRequest"
    WHERE "companyId" = ${companyId}
      AND "userId" = ${userId}
      AND "status" = 'APPROVED'
      AND "startDate" <= ${periodEnd}::date
      AND "endDate" >= ${periodStart}::date
  `;

  return rows[0]?.days ?? 0;
}

export async function sumApprovedVacationDaysByType(params: {
  companyId: string;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<Record<VacationType, number>> {
  const { companyId, userId, periodStart, periodEnd } = params;

  const rows = await prisma.$queryRaw<{ type: string; days: number }[]>`
    SELECT "type",
      COALESCE(SUM(
        GREATEST(
          0,
          (LEAST("endDate", ${periodEnd}::date) - GREATEST("startDate", ${periodStart}::date) + 1)
        )
      ), 0)::int AS days
    FROM "VacationRequest"
    WHERE "companyId" = ${companyId}
      AND "userId" = ${userId}
      AND "status" = 'APPROVED'
      AND "startDate" <= ${periodEnd}::date
      AND "endDate" >= ${periodStart}::date
    GROUP BY "type"
  `;

  const breakdown: Record<VacationType, number> = {
    PAID: 0,
    ON_DEMAND: 0,
    UNPAID: 0,
    SICK: 0,
  };

  for (const row of rows) {
    if (row.type in breakdown) {
      breakdown[row.type as VacationType] = row.days;
    }
  }

  return breakdown;
}
