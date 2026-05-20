export type JobDetailsDraft = {
  customerName: string;
  customerPhone: string;
  addressCity: string;
  addressStreet: string;
  addressZip: string;
  addressNotes: string;
  description: string;
  preferredFrom: string;
  preferredTo: string;
  priority: "normal" | "urgent";
};

export function preferredToInputValue(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return v;
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return preferredToInputValue(v.toISOString());
  }
  return String(v);
}

export function jobToDetailsDraft(job: Record<string, unknown>): JobDetailsDraft {
  const priority = job.priority === "urgent" ? "urgent" : "normal";
  return {
    customerName: String(job.customerName ?? ""),
    customerPhone: String(job.customerPhone ?? ""),
    addressCity: String(job.addressCity ?? ""),
    addressStreet: String(job.addressStreet ?? ""),
    addressZip: String(job.addressZip ?? ""),
    addressNotes: String(job.addressNotes ?? ""),
    description: String(job.description ?? ""),
    preferredFrom: preferredToInputValue(job.preferredFrom),
    preferredTo: preferredToInputValue(job.preferredTo),
    priority,
  };
}

export function formatPreferredDisplay(v: unknown): string {
  const s = preferredToInputValue(v);
  return s || "";
}
