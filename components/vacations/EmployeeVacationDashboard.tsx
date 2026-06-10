"use client";

import { apiFetch } from "@/lib/api";
import {
  formatDateShort,
  formatMonthParam,
  formatMonthParamFromParts,
  formatVacationDateInput,
  getVacationYearOptions,
  parseMonthParam,
  shiftMonth,
  VACATION_MONTH_NAMES,
} from "@/lib/vacations/dates";
import {
  getVacationStatusBadgeClass,
  VACATION_STATUS_LABELS,
  VACATION_TYPE_LABELS,
  VACATION_TYPE_OPTIONS,
} from "@/lib/vacations/labels";
import type { EmployeeVacationDashboardResponse, VacationRequestRow } from "@/lib/vacations/types";
import { useCallback, useEffect, useMemo, useState } from "react";

const STATUS_TABS = [
  { value: "", label: "Wszystkie" },
  { value: "PENDING", label: "Oczekujące" },
  { value: "APPROVED", label: "Zaakceptowane" },
  { value: "REJECTED", label: "Odrzucone" },
] as const;

const REQUESTS_VISIBLE_ROWS = 5;
const REQUESTS_TABLE_MAX_HEIGHT = "calc(3rem + 5 * 3.25rem)";
const REQUESTS_MOBILE_MAX_HEIGHT = "calc(5 * 8.5rem)";

const SIDEBAR_TYPES = [
  { key: "PAID" as const, label: "Urlop wypoczynkowy" },
  { key: "ON_DEMAND" as const, label: "Urlop na żądanie" },
  { key: "UNPAID" as const, label: "Urlop bezpłatny" },
  { key: "SICK" as const, label: "Chorobowe" },
];

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EmployeeNewVacationModal({
  open,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
  }) => Promise<void>;
  busy: boolean;
}) {
  const [type, setType] = useState("PAID");
  const [startDate, setStartDate] = useState(formatVacationDateInput());
  const [endDate, setEndDate] = useState(formatVacationDateInput());
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setType("PAID");
    setStartDate(formatVacationDateInput());
    setEndDate(formatVacationDateInput());
    setReason("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border theme-glass bg-card p-5 sm:p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text">Nowy wniosek urlopowy</h2>
        <p className="text-sm text-text-muted mt-1">Wypełnij dane urlopu i wyślij wniosek do akceptacji.</p>

        <div className="mt-5 space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">Typ urlopu</span>
            <select
              className="border border-border rounded-lg px-3 py-2.5 bg-input text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {VACATION_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">Od</span>
              <input
                type="date"
                className="border border-border rounded-lg px-3 py-2.5 bg-input text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">Do</span>
              <input
                type="date"
                className="border border-border rounded-lg px-3 py-2.5 bg-input text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">Uwagi (opcjonalnie)</span>
            <textarea
              className="border border-border rounded-lg px-3 py-2.5 bg-input text-text min-h-[88px] focus:outline-none focus:ring-2 focus:ring-accent"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            className="min-h-[44px] px-4 py-2 rounded-lg border border-border bg-card text-text text-sm hover:bg-card-hover"
            onClick={onClose}
            disabled={busy}
          >
            Anuluj
          </button>
          <button
            type="button"
            className="min-h-[44px] px-4 py-2 rounded-lg bg-primary text-primary-fg text-sm disabled:opacity-60"
            disabled={busy}
            onClick={() => onSubmit({ type, startDate, endDate, reason })}
          >
            Wyślij wniosek
          </button>
        </div>
      </div>
    </div>
  );
}

function EmployeeRequestDetailsModal({
  request,
  onClose,
}: {
  request: VacationRequestRow | null;
  onClose: () => void;
}) {
  if (!request) return null;

  const notes = request.reason?.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-[680px] max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border theme-glass bg-card p-5 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-text">Szczegóły wniosku urlopowego</h2>
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-border bg-card text-text-muted hover:bg-card-hover"
            onClick={onClose}
            aria-label="Zamknij"
          >
            ✕
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs font-medium text-text-muted">Typ urlopu</dt>
            <dd className="mt-1 text-text">{VACATION_TYPE_LABELS[request.type]}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-text-muted">Status</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex px-2 py-1 rounded-full border text-xs font-medium ${getVacationStatusBadgeClass(request.status)}`}
              >
                {VACATION_STATUS_LABELS[request.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-text-muted">Data od</dt>
            <dd className="mt-1 text-text">{formatDateShort(request.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-text-muted">Data do</dt>
            <dd className="mt-1 text-text">{formatDateShort(request.endDate)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-text-muted">Liczba dni</dt>
            <dd className="mt-1 text-text">{request.totalDays}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-text-muted">Data utworzenia</dt>
            <dd className="mt-1 text-text">{formatCreatedAt(request.createdAt)}</dd>
          </div>
        </dl>

        <div className="mt-5">
          <div className="text-xs font-medium text-text-muted">Uwagi</div>
          <div className="mt-2 rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text whitespace-pre-wrap break-words">
            {notes ? notes : "Brak uwag"}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmployeeVacationDashboard({ companyId }: { companyId: string }) {
  const [month, setMonth] = useState(formatMonthParam());
  const [statusFilter, setStatusFilter] = useState("");
  const [data, setData] = useState<EmployeeVacationDashboardResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailsRequest, setDetailsRequest] = useState<VacationRequestRow | null>(null);

  const { year, month: monthNum } = parseMonthParam(month);
  const yearOptions = useMemo(() => getVacationYearOptions(year), [year]);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ month });
      if (statusFilter) qs.set("status", statusFilter);
      const res = await apiFetch(
        `/api/companies/${companyId}/vacations/me?${qs.toString()}`
      );
      setData(res as EmployeeVacationDashboardResponse);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "LOAD_ERROR");
    } finally {
      setBusy(false);
    }
  }, [companyId, month, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function setSelectedYear(newYear: number) {
    setMonth(formatMonthParamFromParts(newYear, monthNum));
  }

  function setSelectedMonth(newMonth: number) {
    setMonth(formatMonthParamFromParts(year, newMonth));
  }

  function goPrev() {
    const shifted = shiftMonth(year, monthNum, -1);
    setMonth(formatMonthParamFromParts(shifted.year, shifted.month));
  }

  function goNext() {
    const shifted = shiftMonth(year, monthNum, 1);
    setMonth(formatMonthParamFromParts(shifted.year, shifted.month));
  }

  async function handleCreate(payload: {
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
  }) {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/companies/${companyId}/vacations/me`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setModalOpen(false);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "CREATE_ERROR");
    } finally {
      setBusy(false);
    }
  }

  const requestCount = data?.requests.length ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Moje urlopy</h1>
          <p className="text-sm text-text-muted mt-1">
            Przeglądaj swoje wykorzystane urlopy oraz składaj nowe wnioski.
          </p>
        </div>
        <button
          type="button"
          className="min-h-[44px] px-4 py-2 rounded-lg bg-primary text-primary-fg text-sm disabled:opacity-60"
          onClick={() => setModalOpen(true)}
          disabled={busy}
        >
          + Nowy wniosek urlopowy
        </button>
      </div>

      {err && (
        <div className="text-sm text-danger border border-danger-border bg-danger-bg p-3 rounded-lg">{err}</div>
      )}

      <section className="border border-border rounded-xl bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 sm:gap-3">
            <label className="flex flex-col gap-1 text-sm min-w-[7rem]">
              <span className="text-text-muted">Rok</span>
              <select
                className="min-h-[44px] border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
                value={year}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm min-w-[10rem]">
              <span className="text-text-muted">Miesiąc</span>
              <select
                className="min-h-[44px] border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
                value={monthNum}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
              >
                {VACATION_MONTH_NAMES.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2 pb-0.5">
              <button
                type="button"
                className="min-h-[44px] w-11 rounded-lg border border-border bg-card text-text text-sm hover:bg-card-hover"
                onClick={goPrev}
                aria-label="Poprzedni miesiąc"
              >
                ‹
              </button>
              <button
                type="button"
                className="min-h-[44px] w-11 rounded-lg border border-border bg-card text-text text-sm hover:bg-card-hover"
                onClick={goNext}
                aria-label="Następny miesiąc"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-bg-secondary p-4">
            <div className="text-sm font-medium text-text">{data?.monthLabel ?? "—"}</div>
            <div className="text-2xl font-semibold text-accent mt-1">
              {data?.usedMonth.days ?? 0} dni ({data?.usedMonth.hours ?? 0}h)
            </div>
            <p className="text-xs text-text-muted mt-1">wykorzystane</p>
          </div>
          <div className="rounded-xl border border-warning-border bg-warning-bg p-4">
            <div className="text-sm font-medium text-text">Rok {year}</div>
            <div className="text-2xl font-semibold text-warning mt-1">
              {data?.usedYear.days ?? 0} dni ({data?.usedYear.hours ?? 0}h)
            </div>
            <p className="text-xs text-text-muted mt-1">wykorzystane</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6 items-start">
        <section className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-border space-y-3">
            <h2 className="text-lg font-semibold text-text">
              Moje wnioski urlopowe ({requestCount})
            </h2>
            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value || "all"}
                  type="button"
                  className={[
                    "min-h-[44px] px-3 py-2 rounded-lg border text-sm",
                    statusFilter === tab.value
                      ? "bg-primary text-primary-fg border-primary"
                      : "bg-card text-text border-border hover:bg-card-hover",
                  ].join(" ")}
                  onClick={() => setStatusFilter(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="hidden md:block overflow-y-auto scroll-smooth overscroll-contain border-t border-border"
            style={{ maxHeight: REQUESTS_TABLE_MAX_HEIGHT }}
          >
            <table className="w-full text-sm">
              <thead className="bg-bg-secondary sticky top-0 z-10 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Typ urlopu</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Od</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Do</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Dni</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Data utworzenia</th>
                </tr>
              </thead>
              <tbody>
                {(data?.requests ?? []).map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-border hover:bg-card-hover cursor-pointer"
                    onClick={() => setDetailsRequest(row)}
                  >
                    <td className="px-4 py-3 text-text">{VACATION_TYPE_LABELS[row.type]}</td>
                    <td className="px-4 py-3 text-text">{formatDateShort(row.startDate)}</td>
                    <td className="px-4 py-3 text-text">{formatDateShort(row.endDate)}</td>
                    <td className="px-4 py-3 text-text">{row.totalDays}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full border text-xs font-medium ${getVacationStatusBadgeClass(row.status)}`}
                      >
                        {VACATION_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text">{formatCreatedAt(row.createdAt)}</td>
                  </tr>
                ))}
                {!busy && requestCount === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                      Brak wniosków urlopowych.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div
            className="md:hidden overflow-y-auto scroll-smooth overscroll-contain divide-y divide-border border-t border-border"
            style={{ maxHeight: REQUESTS_MOBILE_MAX_HEIGHT }}
          >
            {(data?.requests ?? []).map((row) => (
              <article
                key={row.id}
                className="p-4 space-y-2"
                onClick={() => setDetailsRequest(row)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailsRequest(row);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-medium text-text">{VACATION_TYPE_LABELS[row.type]}</div>
                  <span
                    className={`inline-flex px-2 py-1 rounded-full border text-xs font-medium ${getVacationStatusBadgeClass(row.status)}`}
                  >
                    {VACATION_STATUS_LABELS[row.status]}
                  </span>
                </div>
                <div className="text-sm text-text">
                  {formatDateShort(row.startDate)} – {formatDateShort(row.endDate)} · {row.totalDays} dni
                </div>
                <div className="text-xs text-text-muted">{formatCreatedAt(row.createdAt)}</div>
              </article>
            ))}
            {!busy && requestCount === 0 && (
              <p className="p-6 text-center text-sm text-text-muted">Brak wniosków urlopowych.</p>
            )}
          </div>
        </section>

        <aside className="border border-border rounded-xl bg-card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-text">W tym roku</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {SIDEBAR_TYPES.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3">
                <span className="text-text-muted">{item.label}</span>
                <span className="font-medium text-text">
                  {data?.yearBreakdown[item.key] ?? 0} dni
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <EmployeeNewVacationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
        busy={busy}
      />

      <EmployeeRequestDetailsModal
        request={detailsRequest}
        onClose={() => setDetailsRequest(null)}
      />
    </div>
  );
}
