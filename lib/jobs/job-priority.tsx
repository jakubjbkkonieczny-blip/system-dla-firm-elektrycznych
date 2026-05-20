export type JobPriority = "normal" | "urgent";

const PRIORITY_LABELS: Record<JobPriority, string> = {
  normal: "Normalny",
  urgent: "Pilny",
};

export function normalizeJobPriority(value: unknown): JobPriority {
  return value === "urgent" ? "urgent" : "normal";
}

export function getJobPriorityLabel(priority: unknown): string {
  return PRIORITY_LABELS[normalizeJobPriority(priority)];
}

type JobPriorityBadgeProps = {
  priority: unknown;
  className?: string;
};

export function JobPriorityBadge({ priority, className = "" }: JobPriorityBadgeProps) {
  const p = normalizeJobPriority(priority);
  const label = PRIORITY_LABELS[p];

  const cls =
    p === "urgent"
      ? "bg-orange-50 text-orange-900 border-orange-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  const dot = p === "urgent" ? "bg-orange-600" : "bg-gray-400";

  return (
    <span
      className={[
        "inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold whitespace-nowrap",
        cls,
        className,
      ].join(" ")}
      title={`Priorytet: ${label}`}
    >
      <span className={["w-2 h-2 rounded-full shrink-0", dot].join(" ")} />
      {label}
    </span>
  );
}
