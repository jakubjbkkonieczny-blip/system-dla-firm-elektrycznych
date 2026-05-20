import "server-only";

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
  priority: "normal" | "urgent";
};

export function hasJobDetailPatchKeys(body: Record<string, unknown>): boolean {
  return JOB_DETAIL_PATCH_KEYS.some((k) => body[k] !== undefined);
}

export function parseJobDetailPatchBody(
  body: Record<string, unknown>
): JobDetailPatchInput {
  const customerName = (typeof body.customerName === "string" ? body.customerName : "").trim();
  const customerPhone = (typeof body.customerPhone === "string" ? body.customerPhone : "").trim();
  const addressCity = (typeof body.addressCity === "string" ? body.addressCity : "").trim();
  const addressStreet = (typeof body.addressStreet === "string" ? body.addressStreet : "").trim();
  const addressZip = (typeof body.addressZip === "string" ? body.addressZip : "").trim();
  const addressNotes = (typeof body.addressNotes === "string" ? body.addressNotes : "").trim();
  const description = (typeof body.description === "string" ? body.description : "").trim();
  const preferredFrom = (typeof body.preferredFrom === "string" ? body.preferredFrom : "").trim();
  const preferredTo = (typeof body.preferredTo === "string" ? body.preferredTo : "").trim();
  const priority = body.priority === "urgent" ? "urgent" : "normal";

  return {
    customerName,
    customerPhone,
    addressCity,
    addressStreet,
    addressZip: addressZip || null,
    addressNotes: addressNotes || null,
    description,
    preferredFrom: preferredFrom ? new Date(preferredFrom) : null,
    preferredTo: preferredTo ? new Date(preferredTo) : null,
    priority,
  };
}

export function validateJobDetailPatch(fields: JobDetailPatchInput): boolean {
  return Boolean(
    fields.customerName &&
      fields.customerPhone &&
      fields.addressCity &&
      fields.addressStreet &&
      fields.description
  );
}
