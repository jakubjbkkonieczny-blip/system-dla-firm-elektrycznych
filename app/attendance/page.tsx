"use client";

import { useAuth } from "@/components/AuthProvider";
import { AttendancePhotoCell } from "@/components/attendance/AttendancePhotoCell";
import { AttendanceStatusBadge } from "@/components/attendance/AttendanceStatusBadge";
import { apiFetch } from "@/lib/api";
import {
  formatAttendanceDateInput,
  formatDateShort,
  formatTimeHm,
} from "@/lib/attendance/dates";
import { formatWorkDuration } from "@/lib/attendance/duration";
import {
  ATTENDANCE_PHOTO_HELPER_TEXT,
} from "@/lib/attendance/photos";
import { getAttendanceStatusColors } from "@/lib/attendance/labels";
import type {
  AttendanceDashboardResponse,
  AttendanceStatus,
} from "@/lib/attendance/types";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "owner" | "admin" | "staff";

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
  status?: AttendanceStatus;
}[] = [
  { key: "working", label: "W pracy", status: "working" },
  { key: "break", label: "Na przerwie", status: "break" },
  { key: "finished", label: "Zakończyli", status: "finished" },
  { key: "absent", label: "Nieobecni", status: "absent" },
  { key: "total", label: "Razem pracowników" },
];

export default function AttendancePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const companyId = useActiveCompanyId();

  const [role, setRole] = useState<Role>("staff");
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [data, setData] = useState<AttendanceDashboardResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [date, setDate] = useState(formatAttendanceDateInput());
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("");
  const [useDemo, setUseDemo] = useState(false);

  const isOwnerOrAdmin = role === "owner" || role === "admin";

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !companyId) {
      setRoleLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch(`/api/companies/${companyId}/me`);
        if (!cancelled) setRole((me?.role as Role) || "staff");
      } catch {
        if (!cancelled) setRole("staff");
      } finally {
        if (!cancelled) setRoleLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, companyId]);

  const load = useCallback(async () => {
    if (!companyId || !isOwnerOrAdmin) return;
    setBusy(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (date) qs.set("date", date);
      if (userId) qs.set("userId", userId);
      if (status) qs.set("status", status);
      if (useDemo) qs.set("demo", "1");
      const res = await apiFetch(
        `/api/companies/${companyId}/attendance?${qs.toString()}`
      );
      setData(res as AttendanceDashboardResponse);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "LOAD_ERROR";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }, [companyId, date, userId, status, useDemo, isOwnerOrAdmin]);

  useEffect(() => {
    if (user && companyId && roleLoaded && isOwnerOrAdmin) load();
  }, [user, companyId, roleLoaded, isOwnerOrAdmin, load]);

  if (loading || !roleLoaded) return <div className="p-6">Ładowanie...</div>;
  if (!user) return null;

  if (!companyId) {
    return (
      <div className="p-6">
        Najpierw wybierz aktywną firmę w{" "}
        <Link className="underline" href="/dashboard">
          Dashboard
        </Link>
        .
      </div>
    );
  }

  if (!isOwnerOrAdmin) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Obecność</h1>
        <p className="text-sm text-gray-600">
          Brak dostępu. Moduł obecności jest dostępny tylko dla właściciela lub kierownika.
        </p>
      </div>
    );
  }

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

      <p className="text-xs text-gray-500 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2">
        {ATTENDANCE_PHOTO_HELPER_TEXT}
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
            : {
                card: "border-gray-200 bg-white",
                text: "text-gray-900",
              };
          return (
            <div
              key={item.key}
              className={`rounded-xl border p-4 ${colors.card}`}
            >
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

        <label className="flex items-center gap-2 text-sm pb-2">
          <input
            type="checkbox"
            checked={useDemo}
            onChange={(e) => setUseDemo(e.target.checked)}
          />
          <span className="text-gray-600">Podgląd demo</span>
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
        <table className="w-full text-sm min-w-[960px]">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-600">
              <th className="p-3 font-medium">Pracownik</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Start</th>
              <th className="p-3 font-medium">Koniec</th>
              <th className="p-3 font-medium">Czas pracy</th>
              <th className="p-3 font-medium">Lokalizacja</th>
              <th className="p-3 font-medium">Zdjęcie wejścia</th>
              <th className="p-3 font-medium">Zdjęcie wyjścia</th>
              <th className="p-3 font-medium">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {!data?.rows.length ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-gray-500">
                  {busy ? "Ładowanie..." : "Brak danych obecności na wybrany dzień."}
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
                  <td className="p-3 text-gray-700 max-w-[180px]">
                    {row.locationText || "—"}
                  </td>
                  <td className="p-3">
                    <AttendancePhotoCell photo={row.checkInPhoto} label="Wejście" />
                  </td>
                  <td className="p-3">
                    <AttendancePhotoCell photo={row.checkOutPhoto} label="Wyjście" />
                  </td>
                  <td className="p-3">
                    <span className="text-xs text-gray-400">Podgląd</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
