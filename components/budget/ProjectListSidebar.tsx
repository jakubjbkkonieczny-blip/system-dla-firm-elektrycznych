"use client";

import { formatPlnFromCents } from "@/lib/jobs/budget/money";
import type { BudgetJobListItem, PaginatedMeta } from "@/lib/jobs/budget/types";
import { BUDGET_INPUT_CLASS } from "@/components/budget/constants";

const STATUS_LABELS: Record<string, string> = {
  new: "Nowe",
  scheduled: "Zaplanowane",
  in_progress: "W trakcie",
  done: "Zakończone",
  cancelled: "Anulowane",
};

const STATUS_FILTERS = [
  { value: "", label: "Wszystkie" },
  { value: "new", label: "Nowe" },
  { value: "scheduled", label: "Zaplanowane" },
  { value: "in_progress", label: "W trakcie" },
  { value: "done", label: "Zakończone" },
];

const UTILIZATION_DOT = (percent: number | null) => {
  if (percent == null) return "bg-gray-300";
  if (percent >= 95) return "bg-red-500";
  if (percent >= 80) return "bg-orange-500";
  return "bg-emerald-500";
};

type Props = {
  jobs: BudgetJobListItem[];
  meta: PaginatedMeta | null;
  selectedJobId: string;
  search: string;
  statusFilter: string;
  busy: boolean;
  onSearchChange: (q: string) => void;
  onStatusChange: (status: string) => void;
  onSelectJob: (jobId: string) => void;
  onPageChange: (page: number) => void;
};

export function ProjectListSidebar({
  jobs,
  meta,
  selectedJobId,
  search,
  statusFilter,
  busy,
  onSearchChange,
  onStatusChange,
  onSelectJob,
  onPageChange,
}: Props) {
  return (
    <aside className="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col gap-3 min-w-0 lg:sticky lg:top-4 lg:self-start">
      <input
        className={BUDGET_INPUT_CLASS}
        placeholder="Szukaj projektu..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="Szukaj projektu"
      />

      <select
        className={BUDGET_INPUT_CLASS}
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
        aria-label="Filtr statusu"
      >
        {STATUS_FILTERS.map((f) => (
          <option key={f.value || "all"} value={f.value}>{f.label}</option>
        ))}
      </select>

      <div className="border rounded-xl bg-white overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">
          Projekty / zlecenia
          {meta ? <span className="ml-1 text-gray-400">({meta.total})</span> : null}
        </div>
        <div>
          {busy && jobs.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Ładowanie listy...</div>
          ) : jobs.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Brak zleceń.</div>
          ) : (
            <ul className="divide-y">
              {jobs.map((job) => {
                const active = job.id === selectedJobId;
                return (
                  <li key={job.id}>
                    <button
                      type="button"
                      onClick={() => onSelectJob(job.id)}
                      className={[
                        "w-full text-left px-3 py-3 min-h-[52px] transition",
                        active ? "bg-gray-900 text-white" : "hover:bg-gray-50",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={["w-2 h-2 rounded-full shrink-0", UTILIZATION_DOT(job.budgetUtilizationPercent)].join(" ")}
                          aria-hidden
                        />
                        <span className="text-sm font-medium truncate flex-1">
                          #{job.jobNumber} · {job.customerName}
                        </span>
                      </div>
                      <div className={["text-xs mt-0.5 truncate pl-4", active ? "text-gray-300" : "text-gray-500"].join(" ")}>
                        {job.addressCity} · {STATUS_LABELS[job.status] ?? job.status}
                      </div>
                      {job.totalBudgetCents != null && job.totalBudgetCents > 0 ? (
                        <div className={["text-xs mt-1 pl-4", active ? "text-gray-200" : "text-gray-600"].join(" ")}>
                          Budżet: {formatPlnFromCents(job.totalBudgetCents)}
                          {job.remainingCents != null ? (
                            <span> · Pozostało: {formatPlnFromCents(job.remainingCents)}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {meta && meta.totalPages > 1 ? (
          <div className="border-t px-3 py-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-xs px-2 py-1.5 min-h-[36px] rounded border hover:bg-gray-50 disabled:opacity-50"
              disabled={meta.page <= 1 || busy}
              onClick={() => onPageChange(meta.page - 1)}
            >
              ←
            </button>
            <span className="text-xs text-gray-500">{meta.page}/{meta.totalPages}</span>
            <button
              type="button"
              className="text-xs px-2 py-1.5 min-h-[36px] rounded border hover:bg-gray-50 disabled:opacity-50"
              disabled={!meta.hasMore || busy}
              onClick={() => onPageChange(meta.page + 1)}
            >
              →
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
