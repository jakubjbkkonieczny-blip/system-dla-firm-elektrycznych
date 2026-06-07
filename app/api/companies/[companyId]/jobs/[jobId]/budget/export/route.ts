import { NextRequest, NextResponse } from "next/server";
import {
  buildBudgetExportFilename,
  parseBudgetExportFormat,
} from "@/lib/jobs/budget/export-data";
import { generateBudgetCsv } from "@/lib/jobs/budget/export-csv";
import { generateBudgetPdf } from "@/lib/jobs/budget/export-pdf";
import { generateBudgetXlsx } from "@/lib/jobs/budget/export-xlsx";
import { requireSessionUser } from "@/lib/server/auth/getUserFromSession";
import {
  companyRouteErrorStatus,
  handleSessionRouteErrorOr,
} from "@/lib/server/auth/handle-session-route-error";
import { requireJobBudgetAdmin } from "@/lib/server/jobs/budget-access";
import { loadBudgetExportData } from "@/lib/server/jobs/budget-export-data";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ companyId: string; jobId: string }> };

const MIME_TYPES = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

function budgetExportErrorStatus(msg: string): number {
  if (msg === "FORBIDDEN") return 403;
  if (msg === "JOB_NOT_FOUND" || msg === "COMPANY_NOT_FOUND") return 404;
  if (msg === "INVALID_FORMAT") return 400;
  if (msg === "PDF_NOT_AVAILABLE" || msg === "PDF_FONTS_UNAVAILABLE") return 503;
  return companyRouteErrorStatus(msg) ?? 500;
}

function fileResponse(buffer: Buffer, filename: string, mime: string) {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const sessionUser = await requireSessionUser();
    const { companyId, jobId } = await params;
    await requireJobBudgetAdmin(companyId, jobId, sessionUser.id);

    const format = parseBudgetExportFormat(new URL(req.url).searchParams.get("format"));
    if (!format) {
      return NextResponse.json({ error: "INVALID_FORMAT" }, { status: 400 });
    }

    const data = await loadBudgetExportData(companyId, jobId);
    const filename = buildBudgetExportFilename(data.job.jobNumber, data.job.id, format);

    if (format === "csv") {
      return fileResponse(generateBudgetCsv(data), filename, MIME_TYPES.csv);
    }

    if (format === "xlsx") {
      const buffer = await generateBudgetXlsx(data);
      return fileResponse(buffer, filename, MIME_TYPES.xlsx);
    }

    try {
      const buffer = await generateBudgetPdf(data);
      return fileResponse(buffer, filename, MIME_TYPES.pdf);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "PDF_NOT_AVAILABLE";
      if (msg === "PDF_FONTS_UNAVAILABLE" || msg === "PDF_NOT_AVAILABLE") {
        return NextResponse.json({ error: msg }, { status: 503 });
      }
      throw e;
    }
  } catch (e: unknown) {
    return handleSessionRouteErrorOr(e, budgetExportErrorStatus);
  }
}
