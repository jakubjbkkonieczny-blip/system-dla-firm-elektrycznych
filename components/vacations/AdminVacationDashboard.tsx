"use client";

import { apiFetch } from "@/lib/api";
import {
  formatDateShort,
  formatMonthParam,
  formatVacationDateInput,
  shiftMonth,
  formatMonthParamFromParts,
  parseMonthParam,
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
    card: "border-amber-200 bg-amber-50",
    text: "text-amber-900",
  },
  {
    key: "approved" as const,
    label: "Zaakceptowane",
    helper: "Zatwierdzone urlopy",
    icon: "✅",
    card: "border-emerald-200 bg-emerald-50",
    text: "text-emerald-900",
  },
  {
    key: "rejected" as const,
    label: "Odrzucone",
    helper: "Odrzucone wnioski",
    icon: "✕",
    card: "border-red-200 bg-red-50",
    text: "text-red-900",
  },
  {
    key: "absentToday" as const,
    label: "Dzisiaj nieobecni",
    helper: "Na urlopie dziś",
    icon: "🏖️",
    card: "border-sky-200 bg-sky-50",
    text: "text-sky-900",
  },
];

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-white p-5 sm:p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">Dodaj wniosek urlopowy</h2>
        <p className="text-sm text-gray-600 mt-1">Utwórz wniosek w imieniu pracownika.</p>

        <div className="mt-5 space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600">Pracownik</span>
            <select
              className="border rounded-lg px-3 py-2.5 bg-white min-h-[44px]"
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
            <span className="text-gray-600">Typ urlopu</span>
            <select
              className="border rounded-lg px-3 py-2.5 bg-white min-h-[44px]"
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
              <span className="text-gray-600">Od</span>
              <input
                type="date"
                className="border rounded-lg px-3 py-2.5 bg-white min-h-[44px]"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-600">Do</span>
              <input
                type="date"
                className="border rounded-lg px-3 py-2.5 bg-white min-h-[44px]"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600">Uwagi (opcjonalnie)</span>
            <textarea
              className="border rounded-lg px-3 py-2.5 bg-white min-h-[88px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            className="min-h-[44px] px-4 py-2 rounded-lg border bg-white text-sm"
            onClick={onClose}
            disabled={busy}
          >
            Anuluj
          </button>
          <button
            type="button"
            className="min-h-[44px] px-4 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-60"
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
  const dayHeaders = useMemo(
    () => Array.from({ length: plan?.daysInMonth ?? 31 }, (_, i) => i + 1),
    [plan?.daysInMonth]
  );

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
    <section className="border rounded-xl bg-white p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Plan nieobecności pracowników</h2>
          <p className="text-sm text-gray-600 mt-1">Widok miesiąca — przewiń w poziomie na mobile.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="min-h-[44px] px-3 py-2 rounded-lg border bg-white text-sm"
            onClick={goToday}
          >
            Dzisiaj
          </button>
          <button
            type="button"
            className="min-h-[44px] w-11 rounded-lg border bg-white text-sm"
            onClick={goPrev}
            aria-label="Poprzedni miesiąc"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-gray-900 min-w-[9rem] text-center">
            {plan?.monthLabel ?? "—"}
          </span>
          <button
            type="button"
            className="min-h-[44px] w-11 rounded-lg border bg-white text-sm"
            onClick={goNext}
            aria-label="Następny miesiąc"
          >
            ›
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-sky-200 border border-sky-300" /> Urlop wypoczynkowy
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-200 border border-amber-300" /> Urlop na żądanie
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300" /> Urlop bezpłatny
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-200 border border-red-300" /> Odrzucony
        </span>
      </div>

      {err && (
        <div className="text-sm text-red-700 border border-red-200 bg-red-50 p-3 rounded-lg">{err}</div>
      )}

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-[720px] w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600 sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                Pracownik
              </th>
              {dayHeaders.map((day) => (
                <th key={day} className="px-1 py-2 font-medium text-gray-500 w-7 text-center">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(plan?.rows ?? []).map((row) => (
              <tr key={row.userId} className="border-t">
                <td className="px-3 py-2 font-medium text-gray-900 sticky left-0 bg-white z-10">
                  {row.displayName}
                </td>
                <td colSpan={dayHeaders.length} className="p-0 relative h-10">
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${dayHeaders.length}, minmax(1.75rem, 1fr))` }}>
                    {dayHeaders.map((day) => (
                      <div key={day} className="border-l border-gray-100 h-full" />
                    ))}
                  </div>
                  <div className="absolute inset-y-1 inset-x-0">
                    {row.bars.map((bar) => (
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
                <td colSpan={dayHeaders.length + 1} className="px-3 py-6 text-center text-sm text-gray-500">
                  Brak pracowników do wyświetlenia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          Pokazano {plan?.rows.length ?? 0} z {plan?.totalEmployees ?? 0} pracowników
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-[44px] px-3 py-2 rounded-lg border bg-white text-sm disabled:opacity-50"
            disabled={page <= 1 || busy}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Poprzednia
          </button>
          <button
            type="button"
            className="min-h-[44px] px-3 py-2 rounded-lg border bg-white text-sm disabled:opacity-50"
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
  const [planUserId, setPlanUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showAllAbsences, setShowAllAbsences] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      const res = await apiFetch(
        `/api/companies/${companyId}/vacations?${qs.toString()}`
      );
      setData(res as VacationDashboardResponse);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "LOAD_ERROR");
    } finally {
      setBusy(false);
    }
  }, [companyId, statusFilter]);

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

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Urlopy</h1>
          <p className="text-sm text-gray-600 mt-1">
            Zarządzaj wnioskami urlopowymi pracowników i planuj nieobecności w firmie.
          </p>
        </div>
        <button
          type="button"
          className="min-h-[44px] px-4 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-60"
          onClick={() => setModalOpen(true)}
          disabled={busy}
        >
          Dodaj wniosek
        </button>
      </div>

      {err && (
        <div className="text-sm text-red-700 border border-red-200 bg-red-50 p-3 rounded-lg">{err}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SUMMARY_CARDS.map((card) => {
          const count = data?.summary[card.key] ?? 0;
          return (
            <div key={card.key} className={`rounded-xl border p-4 ${card.card}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-600">{card.label}</span>
                <span aria-hidden>{card.icon}</span>
              </div>
              <div className={`text-2xl font-semibold mt-1 ${card.text}`}>{count}</div>
              <p className="text-xs text-gray-600 mt-1">{card.helper}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
        <section className="border rounded-xl bg-white overflow-hidden">
          <div className="p-4 sm:p-5 border-b space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Wnioski urlopowe</h2>
            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value || "all"}
                  type="button"
                  className={[
                    "min-h-[44px] px-3 py-2 rounded-lg border text-sm",
                    statusFilter === tab.value
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-700 hover:bg-gray-50",
                  ].join(" ")}
                  onClick={() => setStatusFilter(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Pracownik</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Typ urlopu</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Od</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Do</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Dni</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {(data?.requests ?? []).map((row) => (
                  <tr key={row.id} className="border-t hover:bg-gray-50/80">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.displayName}</td>
                    <td className="px-4 py-3 text-gray-700">{VACATION_TYPE_LABELS[row.type]}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDateShort(row.startDate)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDateShort(row.endDate)}</td>
                    <td className="px-4 py-3 text-gray-700">{row.totalDays}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full border text-xs font-medium ${getVacationStatusBadgeClass(row.status)}`}
                      >
                        {VACATION_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.status === "PENDING" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="min-h-[44px] px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs disabled:opacity-60"
                            disabled={busy}
                            onClick={() => handleDecision(row.id, "approve")}
                          >
                            Akceptuj
                          </button>
                          <button
                            type="button"
                            className="min-h-[44px] px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-red-800 text-xs disabled:opacity-60"
                            disabled={busy}
                            onClick={() => handleDecision(row.id, "reject")}
                          >
                            Odrzuć
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!busy && (data?.requests.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Brak wniosków urlopowych.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y">
            {(data?.requests ?? []).map((row) => (
              <article key={row.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">{row.displayName}</div>
                    <div className="text-sm text-gray-600">{VACATION_TYPE_LABELS[row.type]}</div>
                  </div>
                  <span
                    className={`inline-flex px-2 py-1 rounded-full border text-xs font-medium ${getVacationStatusBadgeClass(row.status)}`}
                  >
                    {VACATION_STATUS_LABELS[row.status]}
                  </span>
                </div>
                <div className="text-sm text-gray-700">
                  {formatDateShort(row.startDate)} – {formatDateShort(row.endDate)} · {row.totalDays} dni
                </div>
                {row.status === "PENDING" && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      className="min-h-[44px] flex-1 px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm"
                      disabled={busy}
                      onClick={() => handleDecision(row.id, "approve")}
                    >
                      Akceptuj
                    </button>
                    <button
                      type="button"
                      className="min-h-[44px] flex-1 px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-800 text-sm"
                      disabled={busy}
                      onClick={() => handleDecision(row.id, "reject")}
                    >
                      Odrzuć
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <aside className="border rounded-xl bg-white p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-gray-900">Dzisiejsze nieobecności</h2>
          <div className="mt-4 space-y-3">
            {todayList.length === 0 ? (
              <p className="text-sm text-gray-600">Dzisiaj wszyscy pracują</p>
            ) : (
              todayList.map((item) => (
                <div key={item.id} className="rounded-lg border bg-gray-50 p-3">
                  <div className="font-medium text-gray-900">{item.displayName}</div>
                  <div className="text-sm text-gray-600 mt-0.5">{VACATION_TYPE_LABELS[item.type]}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatDateShort(item.startDate)} – {formatDateShort(item.endDate)}
                  </div>
                </div>
              ))
            )}
          </div>
          {(data?.todayAbsences.length ?? 0) > 5 && (
            <button
              type="button"
              className="mt-4 min-h-[44px] text-sm font-medium text-gray-900 underline"
              onClick={() => setShowAllAbsences((v) => !v)}
            >
              {showAllAbsences ? "Pokaż mniej" : "Zobacz pełną listę"}
            </button>
          )}
        </aside>
      </div>

      <div className="border rounded-lg bg-white p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-sm min-w-[180px]">
          <span className="text-gray-600">Filtr pracownika (plan)</span>
          <select
            className="border rounded-lg px-3 py-2.5 bg-white min-h-[44px]"
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
    </div>
  );
}
