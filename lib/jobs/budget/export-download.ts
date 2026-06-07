import {
  buildBudgetExportFilename,
  type BudgetServerExportFormat,
} from "@/lib/jobs/budget/export-data";

const FORMAT_LABELS: Record<BudgetServerExportFormat, string> = {
  csv: "CSV",
  xlsx: "Excel",
  pdf: "PDF",
};

const FORMAT_EXTENSIONS: Record<BudgetServerExportFormat, string> = {
  csv: "csv",
  xlsx: "xlsx",
  pdf: "pdf",
};

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Brak autoryzacji. Zaloguj się ponownie.",
  FORBIDDEN: "Brak uprawnień do eksportu kosztorysu.",
  JOB_NOT_FOUND: "Nie znaleziono zlecenia.",
  COMPANY_NOT_FOUND: "Nie znaleziono firmy.",
  INVALID_FORMAT: "Nieobsługiwany format eksportu.",
  PDF_NOT_AVAILABLE: "Eksport PDF jest tymczasowo niedostępny. Użyj CSV lub Excel.",
  PDF_FONTS_UNAVAILABLE: "Eksport PDF jest tymczasowo niedostępny. Użyj CSV lub Excel.",
  EXPORT_FAILED: "Nie udało się wygenerować pliku.",
};

function parseFilenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/i.exec(header);
  return match?.[1] ?? null;
}

function friendlyExportError(code: string): string {
  return ERROR_MESSAGES[code] ?? `Błąd eksportu: ${code}`;
}

export type BudgetExportDownloadArgs = {
  companyId: string;
  jobId: string;
  jobNumber: number;
  format: BudgetServerExportFormat;
};

export async function downloadBudgetExport(
  args: BudgetExportDownloadArgs
): Promise<{ ok: true; filename: string } | { ok: false; message: string }> {
  const url = `/api/companies/${args.companyId}/jobs/${args.jobId}/budget/export?format=${args.format}`;

  let response: Response;
  try {
    response = await fetch(url, { method: "GET", credentials: "same-origin" });
  } catch {
    return { ok: false, message: "Błąd połączenia podczas eksportu." };
  }

  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json?.error) code = json.error;
    } catch {
      // binary or empty body
    }
    return { ok: false, message: friendlyExportError(code) };
  }

  const blob = await response.blob();
  const fallbackName = buildBudgetExportFilename(
    args.jobNumber,
    args.jobId,
    FORMAT_EXTENSIONS[args.format]
  );
  const filename =
    parseFilenameFromDisposition(response.headers.get("Content-Disposition")) ??
    fallbackName;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  return { ok: true, filename };
}

export function budgetExportFormatLabel(format: BudgetServerExportFormat): string {
  return FORMAT_LABELS[format];
}
