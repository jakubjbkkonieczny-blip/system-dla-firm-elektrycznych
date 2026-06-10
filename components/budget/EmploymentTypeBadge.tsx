import type { EmploymentType } from "@/lib/jobs/budget/employment-type";

const BADGE_STYLES: Record<EmploymentType, string> = {
  b2b: "bg-bg-secondary text-accent border-border",
  employment_contract: "bg-success-bg text-success border-success-border",
  mandate_contract: "bg-warning-bg text-warning border-warning-border",
  student_under_26: "bg-success-bg text-success border-success-border",
  subcontractor: "bg-card text-text-muted border-border",
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
