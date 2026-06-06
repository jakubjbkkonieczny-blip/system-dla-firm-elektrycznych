import "server-only";
import {
  isBudgetCategory,
  isBudgetDocumentType,
  isBudgetTaxCategory,
  isValidVatRate,
} from "@/lib/jobs/budget/config";
import { isEmploymentType } from "@/lib/jobs/budget/employment-type";
import {
  MAX_MONEY_CENTS,
  parseHoursToMinutes,
  parsePlnToCents,
  resolveItemAmounts,
} from "@/lib/jobs/budget/money";

function parseOptionalDate(value: unknown): Date | null | "INVALID" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "INVALID";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "INVALID";
  return d;
}

function resolveVatRateInput(body: Record<string, unknown>): string | null | undefined | "INVALID" {
  if (body.vatRate === undefined && body.vatCustomPercent === undefined) return undefined;

  if (body.vatRate === null || body.vatRate === "") return null;

  const rawRate = String(body.vatRate);
  if (rawRate === "custom") {
    const pct = String(body.vatCustomPercent ?? "").trim().replace(",", ".");
    if (!pct) return "INVALID";
    const normalized = pct.endsWith("%") ? pct : `${pct}%`;
    return isValidVatRate(normalized) ? normalized : "INVALID";
  }

  return isValidVatRate(rawRate) ? rawRate : "INVALID";
}

export function parseBudgetPatchBody(body: Record<string, unknown>) {
  const errors: string[] = [];

  let totalBudgetCents: number | undefined;
  if (body.totalBudgetCents !== undefined) {
    if (typeof body.totalBudgetCents !== "number" || !Number.isInteger(body.totalBudgetCents)) {
      errors.push("INVALID_BUDGET");
    } else if (body.totalBudgetCents < 0 || body.totalBudgetCents > MAX_MONEY_CENTS) {
      errors.push("INVALID_BUDGET");
    } else {
      totalBudgetCents = body.totalBudgetCents;
    }
  } else if (body.totalBudgetPln !== undefined) {
    const parsed = parsePlnToCents(String(body.totalBudgetPln));
    if (parsed === null) errors.push("INVALID_BUDGET");
    else totalBudgetCents = parsed;
  }

  let note: string | null | undefined;
  if (body.note !== undefined) {
    note = typeof body.note === "string" ? body.note.trim() || null : null;
  }

  return { totalBudgetCents, note, errors };
}

export function parseBudgetItemBody(body: Record<string, unknown>, partial = false) {
  const errors: string[] = [];

  const name =
    body.name !== undefined
      ? (typeof body.name === "string" ? body.name.trim() : "")
      : partial
        ? undefined
        : "";
  if (!partial && (!name || name.length === 0)) errors.push("INVALID_NAME");

  const category =
    body.category !== undefined ? String(body.category) : partial ? undefined : "";
  if (category !== undefined && !isBudgetCategory(category)) errors.push("INVALID_CATEGORY");

  const taxCategory =
    body.taxCategory !== undefined ? String(body.taxCategory) : partial ? undefined : "";
  if (taxCategory !== undefined && !isBudgetTaxCategory(taxCategory)) {
    errors.push("INVALID_TAX_CATEGORY");
  }

  let netAmountCents: number | null | undefined;
  if (body.netAmountCents !== undefined) {
    if (body.netAmountCents === null) netAmountCents = null;
    else if (typeof body.netAmountCents === "number" && Number.isInteger(body.netAmountCents)) {
      if (body.netAmountCents < 0 || body.netAmountCents > MAX_MONEY_CENTS) errors.push("INVALID_NET");
      else netAmountCents = body.netAmountCents;
    } else errors.push("INVALID_NET");
  } else if (body.netAmountPln !== undefined) {
    const parsed = parsePlnToCents(String(body.netAmountPln));
    if (parsed === null) errors.push("INVALID_NET");
    else netAmountCents = parsed;
  }

  let grossAmountCents: number | null | undefined;
  if (body.grossAmountCents !== undefined) {
    if (typeof body.grossAmountCents !== "number" || !Number.isInteger(body.grossAmountCents)) {
      errors.push("INVALID_GROSS");
    } else if (body.grossAmountCents < 0 || body.grossAmountCents > MAX_MONEY_CENTS) {
      errors.push("INVALID_GROSS");
    } else {
      grossAmountCents = body.grossAmountCents;
    }
  } else if (body.grossAmountPln !== undefined) {
    const parsed = parsePlnToCents(String(body.grossAmountPln));
    if (parsed === null) errors.push("INVALID_GROSS");
    else grossAmountCents = parsed;
  }

  const vatResolved = resolveVatRateInput(body);
  let vatRate: string | null | undefined;
  if (vatResolved === "INVALID") errors.push("INVALID_VAT");
  else vatRate = vatResolved;

  const amountSource =
    body.amountSource === "net" || body.amountSource === "gross"
      ? body.amountSource
      : undefined;

  let deductible: boolean | undefined;
  if (body.deductible !== undefined) deductible = Boolean(body.deductible);

  let documentType: string | null | undefined;
  if (body.documentType !== undefined) {
    if (body.documentType === null || body.documentType === "") documentType = null;
    else if (isBudgetDocumentType(String(body.documentType))) documentType = String(body.documentType);
    else errors.push("INVALID_DOCUMENT");
  }

  let documentNumber: string | null | undefined;
  if (body.documentNumber !== undefined) {
    documentNumber =
      body.documentNumber === null || body.documentNumber === ""
        ? null
        : String(body.documentNumber).trim().slice(0, 120) || null;
  }

  let supplier: string | null | undefined;
  if (body.supplier !== undefined) {
    supplier =
      body.supplier === null || body.supplier === ""
        ? null
        : String(body.supplier).trim().slice(0, 200) || null;
  }

  let plannedDate: Date | null | undefined;
  if (body.plannedDate !== undefined) {
    const parsed = parseOptionalDate(body.plannedDate);
    if (parsed === "INVALID") errors.push("INVALID_DATE");
    else plannedDate = parsed;
  }

  let assignedUserId: string | null | undefined;
  if (body.assignedUserId !== undefined) {
    assignedUserId =
      body.assignedUserId === null || body.assignedUserId === ""
        ? null
        : String(body.assignedUserId);
  }

  let note: string | null | undefined;
  if (body.note !== undefined) {
    note = typeof body.note === "string" ? body.note.trim() || null : null;
  }

  let resolvedNet = netAmountCents;
  let resolvedGross = grossAmountCents;

  if (!partial || netAmountCents !== undefined || grossAmountCents !== undefined || vatRate !== undefined) {
    const source =
      amountSource ??
      (grossAmountCents != null ? "gross" : netAmountCents != null ? "net" : undefined);

    if (source) {
      const amounts = resolveItemAmounts({
        grossAmountCents: grossAmountCents ?? null,
        netAmountCents: netAmountCents ?? null,
        vatRate: vatRate ?? null,
        amountSource: source,
      });
      if (!amounts) {
        if (!partial) errors.push("INVALID_AMOUNT");
      } else {
        resolvedNet = amounts.netCents;
        resolvedGross = amounts.grossCents;
      }
    }
  }

  if (!partial && (resolvedGross == null || resolvedGross < 0)) {
    errors.push("INVALID_GROSS");
  }

  return {
    name,
    category,
    taxCategory,
    netAmountCents: resolvedNet,
    vatRate,
    grossAmountCents: resolvedGross ?? undefined,
    deductible,
    documentType,
    documentNumber,
    supplier,
    plannedDate,
    assignedUserId,
    note,
    errors,
  };
}

export function parsePaginationParams(
  searchParams: URLSearchParams,
  defaultLimit: number,
  maxLimit = 100
) {
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const rawLimit = Number(searchParams.get("limit") || String(defaultLimit)) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function parseBudgetLaborBody(body: Record<string, unknown>, partial = false) {
  const errors: string[] = [];

  let plannedMinutes: number | undefined;
  if (body.plannedMinutes !== undefined) {
    if (typeof body.plannedMinutes !== "number" || !Number.isInteger(body.plannedMinutes)) {
      errors.push("INVALID_HOURS");
    } else if (body.plannedMinutes < 0 || body.plannedMinutes > 599_940) {
      errors.push("INVALID_HOURS");
    } else {
      plannedMinutes = body.plannedMinutes;
    }
  } else if (body.plannedHours !== undefined) {
    const parsed = parseHoursToMinutes(String(body.plannedHours));
    if (parsed === null) errors.push("INVALID_HOURS");
    else plannedMinutes = parsed;
  }

  let hourlyRateCents: number | undefined;
  if (body.hourlyRateCents !== undefined) {
    if (typeof body.hourlyRateCents !== "number" || !Number.isInteger(body.hourlyRateCents)) {
      errors.push("INVALID_RATE");
    } else if (body.hourlyRateCents < 0 || body.hourlyRateCents > MAX_MONEY_CENTS) {
      errors.push("INVALID_RATE");
    } else {
      hourlyRateCents = body.hourlyRateCents;
    }
  } else if (body.hourlyRatePln !== undefined) {
    const parsed = parsePlnToCents(String(body.hourlyRatePln));
    if (parsed === null) errors.push("INVALID_RATE");
    else hourlyRateCents = parsed;
  }

  let userId: string | null | undefined;
  if (body.userId !== undefined) {
    userId = body.userId === null || body.userId === "" ? null : String(body.userId);
  }

  let employmentType: string | undefined;
  if (body.employmentType !== undefined) {
    const raw = String(body.employmentType);
    if (!isEmploymentType(raw)) errors.push("INVALID_EMPLOYMENT_TYPE");
    else employmentType = raw;
  } else if (!partial) {
    employmentType = "b2b";
  }

  let plannedDate: Date | null | undefined;
  if (body.plannedDate !== undefined) {
    const parsed = parseOptionalDate(body.plannedDate);
    if (parsed === "INVALID") errors.push("INVALID_DATE");
    else plannedDate = parsed;
  }

  let note: string | null | undefined;
  if (body.note !== undefined) {
    note = typeof body.note === "string" ? body.note.trim() || null : null;
  }

  if (!partial) {
    if (plannedMinutes === undefined) errors.push("INVALID_HOURS");
    if (hourlyRateCents === undefined) errors.push("INVALID_RATE");
  }

  return { plannedMinutes, hourlyRateCents, userId, employmentType, plannedDate, note, errors };
}
