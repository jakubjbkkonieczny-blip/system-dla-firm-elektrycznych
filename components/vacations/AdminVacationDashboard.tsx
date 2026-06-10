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
  getVacationTypeBarClass,
  VACATION_STATUS_LABELS,
  VACATION_TYPE_LABELS,
  VACATION_TYPE_OPTIONS,
} from "@/lib/vacations/labels";
import type {
  AbsencePlanResponse,
  VacationDashboardResponse,
  VacationRequestRow,
  VacationUtilization,
} from "@/lib/vacations/types";
import { useCallback, useEffect, useMemo, useState } from "react";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "", label: "Wszystkie" },
  { value: "PENDING", label: "Oczekujące" },
  { value: "APPROVED", label: "Zaakceptowane" },
  { value: "REJECTED", label: "Odrzucone" },
];

const SUMMARY_CARDS = [
  {
    key: "pending" as const,
    label: "Oczekujące",
    helper: "Wnioski do rozpatrzenia",
    icon: "⏳",
    card: "border-warning-border bg-warning-bg",
    text: "text-warning",
  },
  {
    key: "approved" as const,
    label: "Zaakceptowane",
    helper: "Zatwierdzone urlopy",
    icon: "✅",
    card: "border-success-border bg-success-bg",
    text: "text-success",
  },
  {
    key: "rejected" as const,
    label: "Odrzucone",
    helper: "Odrzucone wnioski",
    icon: "✕",
    card: "border-danger-border bg-danger-bg",
    text: "text-danger",
  },
  {
    key: "absentToday" as const,
    label: "Dzisiaj nieobecni",
    helper: "Na urlopie dziś",
    icon: "🏖️",
    card: "border-border bg-bg-secondary",
    text: "text-accent",
  },
];

const REQUESTS_VISIBLE_ROWS = 5;
/** ~52px per desktop table row (py-3 + text-sm) */
const REQUEST_ROW_HEIGHT = "3.25rem";
/** ~48px thead row */
const REQUEST_TABLE_HEADER_HEIGHT = "3rem";
const REQUESTS_TABLE_MAX_HEIGHT = `calc(${REQUEST_TABLE_HEADER_HEIGHT} + ${REQUESTS_VISIBLE_ROWS} * ${REQUEST_ROW_HEIGHT})`;
/** ~136px per mobile card (padding + content + Szczegóły button) */
const REQUESTS_MOBILE_MAX_HEIGHT = `calc(${REQUESTS_VISIBLE_ROWS} * 8.5rem)`;

function formatRequestCountLabel(count: number): string {
  if (count === 1) return "1 wniosek";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} wnioski`;
  }
  return `${count} wniosków`;
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function VacationRequestDetailsModal({
  request,
  onClose,
  onDecision,
  busy,
}: {
  request: VacationRequestRow | null;
  onClose: () => void;
  onDecision: (id: string, action: "approve" | "reject") => Promise<void>;
  busy: boolean;
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
        aria-labelledby="vacation-details-title"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="vacation-details-title" className="text-lg font-semibold text-text">
            Szczegóły wniosku urlopowego
          </h2>
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
            <dt className="text-xs font-medium text-text-muted">Pracownik</dt>
            <dd className="mt-1 font-medium text-text">{request.displayName}</dd>
          </div>
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
            <dt className="text-xs font-medium text-text-muted">Data utworzenia</dt>
            <dd className="mt-1 text-text">{formatCreatedAt(request.createdAt)}</dd>
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
        </dl>

        <div className="mt-5">
          <div className="text-xs font-medium text-text-muted">Uwagi</div>
          <div className="mt-2 rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text whitespace-pre-wrap break-words">
            {notes ? notes : "Brak uwag"}
          </div>
        </div>

        {request.status === "PENDING" && (
          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              className="min-h-[44px] flex-1 px-4 py-2 rounded-lg border border-success-border bg-success-bg text-success text-sm font-medium disabled:opacity-60"
              disabled={busy}
              onClick={() => onDecision(request.id, "approve")}
            >
              Akceptuj
            </button>
            <button
              type="button"
              className="min-h-[44px] flex-1 px-4 py-2 rounded-lg border border-danger-border bg-danger-bg text-danger text-sm font-medium disabled:opacity-60"
              disabled={busy}
              onClick={() => onDecision(request.id, "reject")}
            >
              Odrzuć
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddVacationModal({
  open,
  onClose,
  employees,
  onSubmit,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  employees: { userId: string; displayName: string }[];
  onSubmit: (payload: {
    userId: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
  }) => Promise<void>;
  busy: boolean;
}) {
  const [userId, setUserId] = useState("");
  const [type, setType] = useState("PAID");
  const [startDate, setStartDate] = useState(formatVacationDateInput());
  const [endDate, setEndDate] = useState(formatVacationDateInput());
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setUserId(employees[0]?.userId ?? "");
    setType("PAID");
    setStartDate(formatVacationDateInput());
    setEndDate(formatVacationDateInput());
    setReason("");
  }, [open, employees]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border theme-glass bg-card p-5 sm:p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text">Dodaj wniosek urlopowy</h2>
        <p className="text-sm text-text-muted mt-1">Utwórz wniosek w imieniu pracownika.</p>

        <div className="mt-5 space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">Pracownik</span>
            <select
              className="border border-border rounded-lg px-3 py-2.5 bg-input text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              {employees.map((e) => (
                <option key={e.userId} value={e.userId}>
                  {e.displayName}
                </option>
              ))}
            </select>
          </label>

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
            disabled={busy || !userId}
            onClick={() =>
              onSubmit({ userId, type, startDate, endDate, reason })
            }
          >
            Zapisz wniosek
          </button>
        </div>
      </div>
    </div>
  );
}

function VacationUtilizationCard({
  utilization,
  monthLabel,
  year,
}: {
  utilization: VacationUtilization;
  monthLabel: string;
  year: number;
}) {
  const typeRows = [
    { key: "PAID" as const, label: "Urlop wypoczynkowy" },
    { key: "ON_DEMAND" as const, label: "Urlop na żądanie" },
    { key: "UNPAID" as const, label: "Urlop bezpłatny" },
    { key: "SICK" as const, label: "Chorobowy" },
  ];

  function renderSection(
    title: string,
    byType: VacationUtilization["month"]["byType"]
  ) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h4 className="text-sm font-semibold text-text">{title}</h4>
        <ul className="mt-3 space-y-2 text-sm text-text">
          {typeRows.map((row) => {
            const usage = byType[row.key];
            return (
              <li key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className="text-text-muted">{row.label}</span>
                <span className="font-medium text-text shrink-0">
                  {usage.days} {usage.days === 1 ? "dzień" : "dni"} ({usage.hours}h)
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-4 sm:p-5 space-y-4">
      <h3 className="text-base font-semibold text-text">{utilization.displayName}</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderSection(`Miesiąc: ${monthLabel}`, utilization.month.byType)}
        {renderSection(`Rok: ${year}`, utilization.year.byType)}
      </div>
    </div>
  );
}

function AbsencePlanSection({
  companyId,
  planUserId,
}: {
  companyId: string;
  planUserId: string;
}) {
  const [month, setMonth] = useState(formatMonthParam());
  const [plan, setPlan] = useState<AbsencePlanResponse | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ month, page: String(page), pageSize: "30" });
      if (planUserId) qs.set("userId", planUserId);
      const res = await apiFetch(
        `/api/companies/${companyId}/vacations/plan?${qs.toString()}`
      );
      setPlan(res as AbsencePlanResponse);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "LOAD_ERROR");
    } finally {
      setBusy(false);
    }
  }, [companyId, month, page, planUserId]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const { year, month: monthNum } = parseMonthParam(month);
  const yearOptions = useMemo(() => getVacationYearOptions(year), [year]);
  const dayHeaders = useMemo(
    () => Array.from({ length: plan?.daysInMonth ?? 31 }, (_, i) => i + 1),
    [plan?.daysInMonth]
  );

  function setSelectedYear(newYear: number) {
    setPage(1);
    setMonth(formatMonthParamFromParts(newYear, monthNum));
  }

  function setSelectedMonth(newMonth: number) {
    setPage(1);
    setMonth(formatMonthParamFromParts(year, newMonth));
  }

  function goToday() {
    setPage(1);
    setMonth(formatMonthParam());
  }

  function goPrev() {
    setPage(1);
    const shifted = shiftMonth(year, monthNum, -1);
    setMonth(formatMonthParamFromParts(shifted.year, shifted.month));
  }

  function goNext() {
    setPage(1);
    const shifted = shiftMonth(year, monthNum, 1);
    setMonth(formatMonthParamFromParts(shifted.year, shifted.month));
  }

  return (
    <section className="border border-border rounded-xl bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text">Plan nieobecności pracowników</h2>
          <p className="text-sm text-text-muted mt-1">Widok miesiąca — przewiń w poziomie na mobile.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 w-full lg:w-auto">
          <label className="flex flex-col gap-1 text-sm min-w-[7rem] flex-1 sm:flex-none">
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
          <label className="flex flex-col gap-1 text-sm min-w-[10rem] flex-1 sm:flex-none">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="min-h-[44px] px-3 py-2 rounded-lg border border-border bg-card text-text text-sm hover:bg-card-hover"
              onClick={goToday}
            >
              Dzisiaj
            </button>
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

      {plan?.utilization && (
        <VacationUtilizationCard
          utilization={plan.utilization}
          monthLabel={plan.monthLabel}
          year={year}
        />
      )}

      <div className="flex flex-wrap gap-3 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-success-bg border border-success-border" /> Urlop wypoczynkowy
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-warning-bg border border-warning-border" /> Urlop na żądanie
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-bg-secondary border border-border" /> Urlop bezpłatny
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-input border border-border" /> Chorobowy
        </span>
      </div>

      {err && (
        <div className="text-sm text-danger border border-danger-border bg-danger-bg p-3 rounded-lg">{err}</div>
      )}

      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="min-w-[720px] w-full text-xs">
          <thead className="bg-bg-secondary">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-text-muted sticky left-0 bg-bg-secondary z-10 min-w-[140px]">
                Pracownik
              </th>
              {dayHeaders.map((day) => (
                <th key={day} className="px-1 py-2 font-medium text-text-muted w-7 text-center">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(plan?.rows ?? []).map((row) => (
              <tr key={row.userId} className="border-t border-border">
                <td className="px-3 py-2 font-medium text-text sticky left-0 bg-card z-10">
                  {row.displayName}
                </td>
                <td colSpan={dayHeaders.length} className="p-0 relative h-10">
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${dayHeaders.length}, minmax(1.75rem, 1fr))` }}>
                    {dayHeaders.map((day) => (
                      <div key={day} className="border-l border-border h-full" />
                    ))}
                  </div>
                  <div className="absolute inset-y-1 inset-x-0">
                    {row.bars.filter((bar) => bar.status === "APPROVED").map((bar) => (
                      <div
                        key={bar.requestId}
                        className={`absolute top-1 bottom-1 rounded border text-[10px] px-1 flex items-center overflow-hidden whitespace-nowrap ${getVacationTypeBarClass(bar.type, bar.status)}`}
                        style={{
                          left: `${((bar.startDay - 1) / dayHeaders.length) * 100}%`,
                          width: `${(bar.spanDays / dayHeaders.length) * 100}%`,
                        }}
                        title={`${VACATION_TYPE_LABELS[bar.type]} (${formatDateShort(bar.startDate)} – ${formatDateShort(bar.endDate)})`}
                      />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {!busy && (plan?.rows.length ?? 0) === 0 && (
              <tr>
                <td colSpan={dayHeaders.length + 1} className="px-3 py-6 text-center text-sm text-text-muted">
                  Brak pracowników do wyświetlenia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-muted">
          Pokazano {plan?.rows.length ?? 0} z {plan?.totalEmployees ?? 0} pracowników
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-[44px] px-3 py-2 rounded-lg border border-border bg-card text-text text-sm hover:bg-card-hover disabled:opacity-50"
            disabled={page <= 1 || busy}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Poprzednia
          </button>
          <button
            type="button"
            className="min-h-[44px] px-3 py-2 rounded-lg border border-border bg-card text-text text-sm hover:bg-card-hover disabled:opacity-50"
            disabled={!plan?.hasMore || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Następna
          </button>
        </div>
      </div>
    </section>
  );
}

export function AdminVacationDashboard({ companyId }: { companyId: string }) {
  const [data, setData] = useState<VacationDashboardResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [requestUserId, setRequestUserId] = useState("");
  const [planUserId, setPlanUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailsRequest, setDetailsRequest] = useState<VacationRequestRow | null>(null);
  const [showAllAbsences, setShowAllAbsences] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      if (requestUserId) qs.set("userId", requestUserId);
      const res = await apiFetch(
        `/api/companies/${companyId}/vacations?${qs.toString()}`
      );
      setData(res as VacationDashboardResponse);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "LOAD_ERROR");
    } finally {
      setBusy(false);
    }
  }, [companyId, statusFilter, requestUserId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDecision(id: string, action: "approve" | "reject") {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/companies/${companyId}/vacations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      setDetailsRequest(null);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "ACTION_ERROR");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(payload: {
    userId: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
  }) {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/companies/${companyId}/vacations`, {
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

  const todayList = showAllAbsences
    ? data?.todayAbsences ?? []
    : (data?.todayAbsences ?? []).slice(0, 5);

  const requestCount = data?.requests.length ?? 0;
  const selectedRequestEmployee = useMemo(
    () => data?.employees.find((e) => e.userId === requestUserId),
    [data?.employees, requestUserId]
  );
  const requestsSectionTitle = useMemo(() => {
    if (selectedRequestEmployee) {
      return `${selectedRequestEmployee.displayName} — ${formatRequestCountLabel(requestCount)}`;
    }
    return `Wnioski urlopowe (${requestCount})`;
  }, [selectedRequestEmployee, requestCount]);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Urlopy</h1>
          <p className="text-sm text-text-muted mt-1">
            Zarządzaj wnioskami urlopowymi pracowników i planuj nieobecności w firmie.
          </p>
        </div>
        <button
          type="button"
          className="min-h-[44px] px-4 py-2 rounded-lg bg-primary text-primary-fg text-sm disabled:opacity-60"
          onClick={() => setModalOpen(true)}
          disabled={busy}
        >
          Dodaj wniosek
        </button>
      </div>

      {err && (
        <div className="text-sm text-danger border border-danger-border bg-danger-bg p-3 rounded-lg">{err}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SUMMARY_CARDS.map((card) => {
          const count = data?.summary[card.key] ?? 0;
          return (
            <div key={card.key} className={`rounded-xl border p-4 ${card.card}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-muted">{card.label}</span>
                <span aria-hidden>{card.icon}</span>
              </div>
              <div className={`text-2xl font-semibold mt-1 ${card.text}`}>{count}</div>
              <p className="text-xs text-text-muted mt-1">{card.helper}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
        <section className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-border space-y-3">
            <h2 className="text-lg font-semibold text-text">{requestsSectionTitle}</h2>
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
            <label className="flex flex-col gap-1 text-sm max-w-xs">
              <span className="text-text-muted">Pracownik</span>
              <select
                className="min-h-[44px] border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
                value={requestUserId}
                onChange={(e) => setRequestUserId(e.target.value)}
              >
                <option value="">Wszyscy pracownicy</option>
                {(data?.employees ?? []).map((e) => (
                  <option key={e.userId} value={e.userId}>
                    {e.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            className="hidden md:block overflow-y-auto scroll-smooth overscroll-contain border-t border-border"
            style={{ maxHeight: REQUESTS_TABLE_MAX_HEIGHT }}
          >
            <table className="w-full text-sm">
              <thead className="bg-bg-secondary sticky top-0 z-10 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Pracownik</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Typ urlopu</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Od</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Do</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Dni</th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.requests ?? []).map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-border hover:bg-card-hover cursor-pointer"
                    onClick={() => setDetailsRequest(row)}
                  >
                    <td className="px-4 py-3 font-medium text-text">{row.displayName}</td>
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
                  </tr>
                ))}
                {!busy && (data?.requests.length ?? 0) === 0 && (
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailsRequest(row);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-text">{row.displayName}</div>
                    <div className="text-sm text-text-muted">{VACATION_TYPE_LABELS[row.type]}</div>
                  </div>
                  <span
                    className={`inline-flex px-2 py-1 rounded-full border text-xs font-medium ${getVacationStatusBadgeClass(row.status)}`}
                  >
                    {VACATION_STATUS_LABELS[row.status]}
                  </span>
                </div>
                <div className="text-sm text-text">
                  {formatDateShort(row.startDate)} – {formatDateShort(row.endDate)} · {row.totalDays} dni
                </div>
                <button
                  type="button"
                  className="min-h-[44px] w-full px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-text hover:bg-card-hover"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailsRequest(row);
                  }}
                >
                  Szczegóły
                </button>
              </article>
            ))}
          </div>
        </section>

        <aside className="border border-border rounded-xl bg-card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-text">Dzisiejsze nieobecności</h2>
          <div className="mt-4 space-y-3">
            {todayList.length === 0 ? (
              <p className="text-sm text-text-muted">Dzisiaj wszyscy pracują</p>
            ) : (
              todayList.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-bg-secondary p-3">
                  <div className="font-medium text-text">{item.displayName}</div>
                  <div className="text-sm text-text-muted mt-0.5">{VACATION_TYPE_LABELS[item.type]}</div>
                  <div className="text-xs text-text-muted mt-1">
                    {formatDateShort(item.startDate)} – {formatDateShort(item.endDate)}
                  </div>
                </div>
              ))
            )}
          </div>
          {(data?.todayAbsences.length ?? 0) > 5 && (
            <button
              type="button"
              className="mt-4 min-h-[44px] text-sm font-medium text-text underline"
              onClick={() => setShowAllAbsences((v) => !v)}
            >
              {showAllAbsences ? "Pokaż mniej" : "Zobacz pełną listę"}
            </button>
          )}
        </aside>
      </div>

      <div className="border border-border rounded-lg bg-card p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-sm min-w-[180px]">
          <span className="text-text-muted">Filtr pracownika (plan)</span>
          <select
            className="border border-border rounded-lg px-3 py-2.5 bg-input text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
            value={planUserId}
            onChange={(e) => setPlanUserId(e.target.value)}
          >
            <option value="">Wszyscy pracownicy</option>
            {(data?.employees ?? []).map((e) => (
              <option key={e.userId} value={e.userId}>
                {e.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <AbsencePlanSection
        companyId={companyId}
        planUserId={planUserId}
      />

      <AddVacationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        employees={data?.employees ?? []}
        onSubmit={handleCreate}
        busy={busy}
      />

      <VacationRequestDetailsModal
        request={detailsRequest}
        onClose={() => setDetailsRequest(null)}
        onDecision={handleDecision}
        busy={busy}
      />
    </div>
  );
}
