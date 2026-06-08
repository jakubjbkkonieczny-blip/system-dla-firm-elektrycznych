"use client";

import { AttendanceHoursModal } from "@/components/attendance/AttendanceHoursModal";
import { AttendanceStatusBadge } from "@/components/attendance/AttendanceStatusBadge";
import { apiFetch } from "@/lib/api";
import {
  formatAttendanceDateInput,
  formatDateShort,
  formatTimeHm,
} from "@/lib/attendance/dates";
import { formatWorkDuration } from "@/lib/attendance/duration";
import { getAttendanceStatusColors } from "@/lib/attendance/labels";
import type {
  AttendanceDashboardResponse,
  AttendanceDashboardStatus,
} from "@/lib/attendance/types";
import { useCallback, useEffect, useState } from "react";

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Wszystkie statusy" },
  { value: "working", label: "W pracy" },
  { value: "break", label: "Na przerwie" },
  { value: "finished", label: "Zakończył" },
  { value: "absent", label: "Nieobecny" },
];

const SUMMARY_ITEMS: {
  key: keyof AttendanceDashboardResponse["summary"];
  label: string;
  status?: AttendanceDashboardStatus;
}[] = [
  { key: "working", label: "W pracy", status: "working" },
  { key: "break", label: "Na przerwie", status: "break" },
  { key: "finished", label: "Zakończyli", status: "finished" },
  { key: "absent", label: "Nieobecni", status: "absent" },
  { key: "total", label: "Razem pracowników" },
];

export function AdminAttendanceDashboard({ companyId }: { companyId: string }) {
  const [data, setData] = useState<AttendanceDashboardResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [date, setDate] = useState(formatAttendanceDateInput());
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("");
  const [hoursTarget, setHoursTarget] = useState<{
    userId: string;
    displayName: string;
    email: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;

    setBusy(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (date) qs.set("date", date);
      if (userId) qs.set("userId", userId);
      if (status) qs.set("status", status);
      const res = await apiFetch(
        `/api/companies/${companyId}/attendance?${qs.toString()}`
      );
      setData(res as AttendanceDashboardResponse);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "LOAD_ERROR");
    } finally {
      setBusy(false);
    }
  }, [companyId, date, userId, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Obecność</h1>
          <p className="text-sm text-gray-600 mt-1">
            Monitorowanie czasu pracy i statusów zespołu
          </p>
        </div>
        <button
          type="button"
          className="px-3 py-2 rounded-lg border bg-white text-sm disabled:opacity-60"
          disabled={busy}
          onClick={load}
        >
          Odśwież
        </button>
      </div>

      <p className="text-xs text-gray-600 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2">
        Widok pokazuje wybrany dzień. Historia godzin jest dostępna osobno.
      </p>

      {err && (
        <div className="text-sm text-red-700 border border-red-200 bg-red-50 p-3 rounded-lg">
          {err}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {SUMMARY_ITEMS.map((item) => {
          const count = data?.summary[item.key] ?? 0;
          const colors = item.status
            ? getAttendanceStatusColors(item.status)
            : { card: "border-gray-200 bg-white", text: "text-gray-900" };
          return (
            <div key={item.key} className={`rounded-xl border p-4 ${colors.card}`}>
              <div className="text-xs font-medium text-gray-600">{item.label}</div>
              <div className={`text-2xl font-semibold mt-1 ${colors.text}`}>{count}</div>
            </div>
          );
        })}
      </div>

      <div className="border rounded-lg bg-white p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Data</span>
          <input
            type="date"
            className="border rounded-lg px-3 py-2 bg-white"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm min-w-[180px]">
          <span className="text-gray-600">Pracownik</span>
          <select
            className="border rounded-lg px-3 py-2 bg-white"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Wszyscy pracownicy</option>
            {(data?.employees ?? []).map((e) => (
              <option key={e.userId} value={e.userId}>
                {e.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm min-w-[160px]">
          <span className="text-gray-600">Status</span>
          <select
            className="border rounded-lg px-3 py-2 bg-white"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-60"
          disabled={busy}
          onClick={load}
        >
          Zastosuj filtry
        </button>
      </div>

      <div className="border rounded-lg bg-white overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-600">
              <th className="p-3 font-medium">Pracownik</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Start</th>
              <th className="p-3 font-medium">Koniec</th>
              <th className="p-3 font-medium">Czas pracy</th>
              <th className="p-3 font-medium">Przerwy</th>
              <th className="p-3 font-medium">Lokalizacja</th>
              <th className="p-3 font-medium">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {!data?.rows.length ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  {busy ? "Ładowanie..." : "Brak danych obecności dla wybranego dnia."}
                </td>
              </tr>
            ) : (
              data.rows.map((row) => (
                <tr key={row.userId} className="border-b last:border-0 hover:bg-gray-50/80">
                  <td className="p-3">
                    <div className="font-medium text-gray-900">{row.displayName}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[200px]">
                      {row.email}
                    </div>
                  </td>
                  <td className="p-3">
                    <AttendanceStatusBadge status={row.status} />
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{formatTimeHm(row.startedAt)}</div>
                    <div className="text-xs text-gray-500">{formatDateShort(row.startedAt)}</div>
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{formatTimeHm(row.endedAt)}</div>
                    <div className="text-xs text-gray-500">{formatDateShort(row.endedAt)}</div>
                  </td>
                  <td className="p-3 font-medium text-gray-800">
                    {formatWorkDuration(row.workDurationMs)}
                  </td>
                  <td className="p-3 text-gray-700">
                    {formatWorkDuration(row.breakDurationMs)}
                  </td>
                  <td className="p-3 text-gray-700 max-w-[220px]">
                    {row.locationText || "—"}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-sm px-2 py-1 rounded border bg-white hover:bg-gray-50"
                      onClick={() =>
                        setHoursTarget({
                          userId: row.userId,
                          displayName: row.displayName,
                          email: row.email,
                        })
                      }
                    >
                      Zobacz godziny pracy
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hoursTarget && (
        <AttendanceHoursModal
          companyId={companyId}
          userId={hoursTarget.userId}
          displayName={hoursTarget.displayName}
          email={hoursTarget.email}
          date={date}
          onClose={() => setHoursTarget(null)}
        />
      )}
    </div>
  );
}
