"use client";

import { AttendanceHistoryList } from "@/components/attendance/AttendanceHistoryList";
import { apiFetch } from "@/lib/api";
import { formatMinutes } from "@/lib/attendance/duration";
import type { AttendanceHoursSummary } from "@/lib/attendance/types";
import { useEffect, useState } from "react";

export function AttendanceHoursModal({
  companyId,
  userId,
  displayName,
  email,
  date,
  onClose,
}: {
  companyId: string;
  userId: string;
  displayName: string;
  email: string;
  date: string;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<AttendanceHoursSummary | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      setErr(null);
      try {
        const qs = date ? `?date=${encodeURIComponent(date)}` : "";
        const res = await apiFetch(
          `/api/companies/${companyId}/attendance/${userId}/hours${qs}`
        );
        if (!cancelled) setSummary(res as AttendanceHoursSummary);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "LOAD_ERROR");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, userId, date]);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border rounded-xl shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-semibold text-lg">Godziny pracy</h3>
            <p className="text-sm text-gray-600">
              {displayName} · {email}
            </p>
          </div>
          <button type="button" className="px-2 py-1 text-sm border rounded" onClick={onClose}>
            Zamknij
          </button>
        </div>

        <div className="p-4 space-y-4">
          {busy && <div className="text-sm text-gray-500">Ładowanie podsumowania...</div>}
          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-2 rounded">
              {err}
            </div>
          )}
          {summary && !busy && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="border rounded-lg p-3 bg-gray-50">
                <div className="text-xs text-gray-600">Dziś</div>
                <div className="font-semibold">{formatMinutes(summary.todayWorkedMinutes)}</div>
                <div className="text-[10px] text-gray-500">
                  przerwy {formatMinutes(summary.todayBreakMinutes)}
                </div>
              </div>
              <div className="border rounded-lg p-3 bg-gray-50">
                <div className="text-xs text-gray-600">Tydzień</div>
                <div className="font-semibold">{formatMinutes(summary.weekWorkedMinutes)}</div>
              </div>
              <div className="border rounded-lg p-3 bg-gray-50">
                <div className="text-xs text-gray-600">Miesiąc</div>
                <div className="font-semibold">{formatMinutes(summary.monthWorkedMinutes)}</div>
              </div>
            </div>
          )}

          <div>
            <div className="text-sm font-medium text-gray-800 mb-2">Historia godzin pracy</div>
            <AttendanceHistoryList
              companyId={companyId}
              userId={userId}
              emptyMessage="Brak zapisanej historii pracy."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
