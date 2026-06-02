import type { VacationStatus, VacationType } from "@/lib/vacations/types";

export const VACATION_TYPE_LABELS: Record<VacationType, string> = {
  PAID: "Urlop wypoczynkowy",
  ON_DEMAND: "Urlop na żądanie",
  UNPAID: "Urlop bezpłatny",
  SICK: "Chorobowy",
};

export const VACATION_STATUS_LABELS: Record<VacationStatus, string> = {
  PENDING: "Oczekuje",
  APPROVED: "Zaakceptowany",
  REJECTED: "Odrzucony",
};

export function getVacationStatusBadgeClass(status: VacationStatus): string {
  if (status === "PENDING") {
    return "bg-amber-50 text-amber-800 border-amber-200";
  }
  if (status === "APPROVED") {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  return "bg-red-50 text-red-800 border-red-200";
}

export function getVacationTypeBarClass(type: VacationType, status: VacationStatus): string {
  if (status === "REJECTED") {
    return "bg-red-200 border-red-300 text-red-900";
  }
  if (type === "PAID") return "bg-sky-200 border-sky-300 text-sky-900";
  if (type === "ON_DEMAND") return "bg-amber-200 border-amber-300 text-amber-900";
  if (type === "UNPAID") return "bg-slate-200 border-slate-300 text-slate-800";
  return "bg-violet-200 border-violet-300 text-violet-900";
}

export const VACATION_TYPE_OPTIONS: { value: VacationType; label: string }[] = [
  { value: "PAID", label: VACATION_TYPE_LABELS.PAID },
  { value: "ON_DEMAND", label: VACATION_TYPE_LABELS.ON_DEMAND },
  { value: "UNPAID", label: VACATION_TYPE_LABELS.UNPAID },
  { value: "SICK", label: VACATION_TYPE_LABELS.SICK },
];
