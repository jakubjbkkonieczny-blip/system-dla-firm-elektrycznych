import "server-only";
import {
  PREFERRED_RANGE_ERROR,
  parsePreferredDateTime,
  toPreferredIso,
} from "@/lib/jobs/preferred-schedule";
import {
  parseJobPriorityForWrite,
  type JobPriority,
} from "@/lib/server/jobs/job-priority";

export const JOB_DETAIL_PATCH_KEYS = [
  "customerName",
  "customerPhone",
  "addressCity",
  "addressStreet",
  "addressZip",
  "addressNotes",
  "description",
  "preferredFrom",
  "preferredTo",
  "priority",
] as const;

export type JobDetailPatchInput = {
  customerName: string;
  customerPhone: string;
  addressCity: string;
  addressStreet: string;
  addressZip: string | null;
  addressNotes: string | null;
  description: string;
  preferredFrom: Date | null;
  preferredTo: Date | null;
  priority: JobPriority;
};

export function hasJobDetailPatchKeys(body: Record<string, unknown>): boolean {
  return JOB_DETAIL_PATCH_KEYS.some((k) => body[k] !== undefined);
}

export function parseJobDetailPatchBody(
  body: Record<string, unknown>
): JobDetailPatchInput | null {
  const customerName = (typeof body.customerName === "string" ? body.customerName : "").trim();
  const customerPhone = (typeof body.customerPhone === "string" ? body.customerPhone : "").trim();
  const addressCity = (typeof body.addressCity === "string" ? body.addressCity : "").trim();
  const addressStreet = (typeof body.addressStreet === "string" ? body.addressStreet : "").trim();
  const addressZip = (typeof body.addressZip === "string" ? body.addressZip : "").trim();
  const addressNotes = (typeof body.addressNotes === "string" ? body.addressNotes : "").trim();
  const description = (typeof body.description === "string" ? body.description : "").trim();
  const preferredFrom = (typeof body.preferredFrom === "string" ? body.preferredFrom : "").trim();
  const preferredTo = (typeof body.preferredTo === "string" ? body.preferredTo : "").trim();
  let priority: JobPriority = "normal";
  if (body.priority !== undefined) {
    const parsed = parseJobPriorityForWrite(body.priority);
    if (parsed === null) return null;
    priority = parsed;
  }

  const fromIso = preferredFrom ? toPreferredIso(preferredFrom) : "";
  const toIso = preferredTo ? toPreferredIso(preferredTo) : "";

  return {
    customerName,
    customerPhone,
    addressCity,
    addressStreet,
    addressZip: addressZip || null,
    addressNotes: addressNotes || null,
    description,
    preferredFrom: fromIso ? parsePreferredDateTime(fromIso) : null,
    preferredTo: toIso ? parsePreferredDateTime(toIso) : null,
    priority,
  };
}

export function validateJobDetailPatch(fields: JobDetailPatchInput): boolean {
  if (
    !fields.customerName ||
    !fields.customerPhone ||
    !fields.addressCity ||
    !fields.addressStreet ||
    !fields.description
  ) {
    return false;
  }

  if (fields.preferredFrom && fields.preferredTo) {
    if (fields.preferredTo.getTime() < fields.preferredFrom.getTime()) {
      return false;
    }
  }

  return true;
}

export function jobDetailPatchValidationError(
  fields: JobDetailPatchInput
): string | null {
  if (
    !fields.customerName ||
    !fields.customerPhone ||
    !fields.addressCity ||
    !fields.addressStreet ||
    !fields.description
  ) {
    return "MISSING_FIELDS";
  }

  if (
    fields.preferredFrom &&
    fields.preferredTo &&
    fields.preferredTo.getTime() < fields.preferredFrom.getTime()
  ) {
    return PREFERRED_RANGE_ERROR;
  }

  return null;
}
