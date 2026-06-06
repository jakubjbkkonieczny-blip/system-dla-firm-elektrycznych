import type { EmploymentType } from "@/lib/jobs/budget/employment-type";

const BADGE_STYLES: Record<EmploymentType, string> = {
  b2b: "bg-blue-100 text-blue-800 border-blue-200",
  employment_contract: "bg-purple-100 text-purple-800 border-purple-200",
  mandate_contract: "bg-orange-100 text-orange-800 border-orange-200",
  student_under_26: "bg-green-100 text-green-800 border-green-200",
  subcontractor: "bg-slate-100 text-slate-800 border-slate-200",
};

const SHORT_LABELS: Record<EmploymentType, string> = {
  b2b: "B2B",
  employment_contract: "UoP",
  mandate_contract: "Zlecenie",
  student_under_26: "Student",
  subcontractor: "Podwyk.",
};

export function EmploymentTypeBadge({
  type,
  label,
}: {
  type: EmploymentType;
  label?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold",
        BADGE_STYLES[type],
      ].join(" ")}
    >
      {label ?? SHORT_LABELS[type]}
    </span>
  );
}
