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
    if (!companyId || !userId) {
      setBusy(false);
      return;
    }

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
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="attendance-hours-modal-title"
        className="flex flex-col w-full max-w-5xl bg-white border rounded-xl shadow-lg max-h-[min(92vh,56rem)] min-h-[min(72vh,40rem)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-center justify-between gap-4 px-5 py-4 border-b bg-white">
          <div className="min-w-0">
            <h3 id="attendance-hours-modal-title" className="font-semibold text-lg text-gray-900">
              Godziny pracy
            </h3>
            <p className="text-sm text-gray-600 truncate">
              {displayName} · {email}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
            onClick={onClose}
          >
            Zamknij
          </button>
        </header>

        <div className="flex flex-col flex-1 min-h-0">
          {(busy || err || summary) && (
            <div className="shrink-0 px-5 py-4 border-b bg-gray-50/80 space-y-3">
              {busy && <div className="text-sm text-gray-500">Ładowanie podsumowania...</div>}
              {err && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">
                  {err}
                </div>
              )}
              {summary && !busy && (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="border rounded-lg p-4 bg-white">
                    <div className="text-xs text-gray-600 uppercase tracking-wide">Dziś</div>
                    <div className="font-semibold text-lg mt-1">
                      {formatMinutes(summary.todayWorkedMinutes)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      przerwy {formatMinutes(summary.todayBreakMinutes)}
                    </div>
                  </div>
                  <div className="border rounded-lg p-4 bg-white">
                    <div className="text-xs text-gray-600 uppercase tracking-wide">Tydzień</div>
                    <div className="font-semibold text-lg mt-1">
                      {formatMinutes(summary.weekWorkedMinutes)}
                    </div>
                  </div>
                  <div className="border rounded-lg p-4 bg-white">
                    <div className="text-xs text-gray-600 uppercase tracking-wide">Miesiąc</div>
                    <div className="font-semibold text-lg mt-1">
                      {formatMinutes(summary.monthWorkedMinutes)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="shrink-0 px-5 pt-4 pb-2 bg-white border-b">
              <h4 className="text-sm font-semibold text-gray-800">Historia godzin pracy</h4>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
              <AttendanceHistoryList
                companyId={companyId}
                userId={userId}
                layout="comfortable"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
