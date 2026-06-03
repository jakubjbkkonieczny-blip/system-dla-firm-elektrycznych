"use client";

import {
  getJobPriorityBadgeStyles,
  getJobPriorityDefinition,
  getJobPriorityLabel,
  JOB_PRIORITIES_ORDERED,
  normalizeJobPriority,
  type JobPriority,
} from "@/lib/jobs/job-priority-config";

export type { JobPriority } from "@/lib/jobs/job-priority-config";
export {
  getJobPriorityLabel,
  JOB_PRIORITIES_ORDERED,
  JOB_PRIORITY_DEFINITIONS,
  JOB_PRIORITY_VALUES,
  normalizeJobPriority,
  parseJobPriorityForWrite,
} from "@/lib/jobs/job-priority-config";

type JobPriorityBadgeProps = {
  priority: unknown;
  className?: string;
};

export function JobPriorityBadge({ priority, className = "" }: JobPriorityBadgeProps) {
  const p = normalizeJobPriority(priority);
  const label = getJobPriorityLabel(p);
  const styles = getJobPriorityBadgeStyles(p);

  return (
    <span
      className={[
        "inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold whitespace-nowrap",
        styles.container,
        className,
      ].join(" ")}
      role="status"
      aria-label={`Priorytet: ${label}`}
      title={`Priorytet: ${label}`}
    >
      <span
        className={["w-2 h-2 rounded-full shrink-0", styles.dot].join(" ")}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

type JobPrioritySelectProps = {
  id?: string;
  value: JobPriority;
  onChange: (value: JobPriority) => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
  showLiveBadge?: boolean;
};

export function JobPrioritySelect({
  id,
  value,
  onChange,
  disabled = false,
  "aria-label": ariaLabel = "Priorytet zlecenia",
  "aria-labelledby": ariaLabelledBy,
  className = "",
  showLiveBadge = true,
}: JobPrioritySelectProps) {
  const normalized = normalizeJobPriority(value);

  return (
    <div className={["flex flex-col sm:flex-row sm:items-center gap-2", className].join(" ")}>
      <select
        id={id}
        className="min-h-[44px] border border-gray-200 rounded-lg px-3 py-2 bg-white max-w-xs w-full sm:w-auto touch-manipulation"
        value={normalized}
        disabled={disabled}
        onChange={(e) => onChange(normalizeJobPriority(e.target.value))}
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        {JOB_PRIORITIES_ORDERED.map((p) => {
          const def = getJobPriorityDefinition(p);
          return (
            <option key={p} value={p}>
              {def.label}
            </option>
          );
        })}
      </select>
      {showLiveBadge ? <JobPriorityBadge priority={normalized} /> : null}
    </div>
  );
}
