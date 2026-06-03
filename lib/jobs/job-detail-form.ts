import { toPreferredIso } from "@/lib/jobs/preferred-schedule";
import { normalizeJobPriority, type JobPriority } from "@/lib/jobs/job-priority-config";

export type { PreferredScheduleFields } from "@/lib/jobs/preferred-schedule";
export {
  formatPreferredDisplay,
  formatPreferredDatePl,
  formatPreferredTimePl,
  PREFERRED_RANGE_ERROR,
  validatePreferredRange,
} from "@/lib/jobs/preferred-schedule";

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
  priority: JobPriority;
};

export function jobToDetailsDraft(job: Record<string, unknown>): JobDetailsDraft {
  const priority = normalizeJobPriority(job.priority);
  return {
    customerName: String(job.customerName ?? ""),
    customerPhone: String(job.customerPhone ?? ""),
    addressCity: String(job.addressCity ?? ""),
    addressStreet: String(job.addressStreet ?? ""),
    addressZip: String(job.addressZip ?? ""),
    addressNotes: String(job.addressNotes ?? ""),
    description: String(job.description ?? ""),
    preferredFrom: toPreferredIso(job.preferredFrom),
    preferredTo: toPreferredIso(job.preferredTo),
    priority,
  };
}
