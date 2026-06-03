"use client";

import { AttendanceHistoryList } from "@/components/attendance/AttendanceHistoryList";
import { LocationAutocomplete } from "@/components/attendance/LocationAutocomplete";
import { apiFetch } from "@/lib/api";
import {
  formatAttendanceDateInput,
  formatSessionDateDisplay,
  formatTimeHm,
} from "@/lib/attendance/dates";
import { formatMinutes } from "@/lib/attendance/duration";
import { getEmployeeStateLabel } from "@/lib/attendance/employee-labels";
import { applyOptimisticAttendanceAction } from "@/lib/attendance/optimistic-session";
import type {
  AttendanceAction,
  AttendanceActionResponse,
  AttendanceMeResponse,
} from "@/lib/attendance/types";
import { useCallback, useEffect, useState } from "react";

const ACTION_LABELS: Record<AttendanceAction, string> = {
  start_work: "Rozpocznij pracę",
  start_break: "Rozpocznij przerwę",
  end_break: "Zakończ przerwę",
  finish_work: "Zakończ pracę",
};

export function EmployeeAttendancePanel({ companyId }: { companyId: string }) {
  const [session, setSession] = useState<AttendanceMeResponse | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [locationText, setLocationText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const todayIso = formatAttendanceDateInput();
  const todayDisplay = formatSessionDateDisplay(todayIso);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await apiFetch(`/api/companies/${companyId}/attendance/me`);
      setSession(data as AttendanceMeResponse);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "LOAD_ERROR");
    } finally {
      setSessionLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(action: AttendanceAction) {
    const previous = session;
    setBusy(true);
    setErr(null);
    setSuccess(null);
    setSession(applyOptimisticAttendanceAction(session, action));

    try {
      const res = (await apiFetch(`/api/companies/${companyId}/attendance/me`, {
        method: "POST",
        body: JSON.stringify({
          action,
          locationText: action === "start_work" ? locationText : undefined,
        }),
      })) as AttendanceActionResponse;
      setSession(res.session);
      setSuccess(res.message);
    } catch (e: unknown) {
      setSession(previous);
      setErr(e instanceof Error ? e.message : "ACTION_ERROR");
    } finally {
      setBusy(false);
    }
  }

  const state = session?.state ?? "not_started";
  const actions = session?.availableActions ?? (state === "not_started" ? ["start_work"] : []);

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Moja obecność</h1>
      </div>

      {success && (
        <div className="text-sm text-green-800 border border-green-200 bg-green-50 rounded-lg p-3">
          {success}
        </div>
      )}
      {err && (
        <div className="text-sm text-red-700 border border-red-200 bg-red-50 rounded-lg p-3">
          {err}
        </div>
      )}

      <div className="border rounded-xl bg-gray-900 text-white p-4 space-y-1">
        <div className="text-sm font-medium opacity-90">Dzisiejsza obecność</div>
        <div className="text-lg font-semibold">Data: {todayDisplay}</div>
        {!sessionLoading && (
          <div className="text-sm opacity-90 pt-1">{getEmployeeStateLabel(state)}</div>
        )}
      </div>

      <div className="border rounded-xl bg-white p-4 space-y-3">
        {sessionLoading ? (
          <div className="text-sm text-gray-500">Ładowanie statusu...</div>
        ) : (
          <>
            {session?.startedAt && (
              <div className="text-sm text-gray-600">
                Start: <b>{formatTimeHm(session.startedAt)}</b>
                {session.endedAt && (
                  <>
                    {" "}
                    · Koniec: <b>{formatTimeHm(session.endedAt)}</b>
                  </>
                )}
              </div>
            )}
            {(session?.totalWorkedMinutes != null || (session?.totalBreakMinutes ?? 0) > 0) && (
              <div className="text-sm text-gray-600">
                Praca: <b>{formatMinutes(session?.totalWorkedMinutes ?? 0)}</b> · Przerwy:{" "}
                <b>{formatMinutes(session?.totalBreakMinutes ?? 0)}</b>
              </div>
            )}
            {state === "finished" && (
              <p className="text-sm text-gray-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Praca na dziś została zakończona. Aby rozpocząć nowy dzień, wróć jutro.
              </p>
            )}
          </>
        )}
      </div>

      {state === "not_started" && !sessionLoading && (
        <LocationAutocomplete
          value={locationText}
          onChange={setLocationText}
          disabled={busy}
        />
      )}

      {!sessionLoading && actions.length > 0 && (
        <div className="flex flex-col gap-2">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => runAction(action)}
              className={[
                "w-full py-4 rounded-xl text-base font-semibold border disabled:opacity-60",
                action === "finish_work"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50",
              ].join(" ")}
            >
              {ACTION_LABELS[action]}
            </button>
          ))}
        </div>
      )}

      <div className="border rounded-xl bg-white overflow-hidden">
        <button
          type="button"
          className="w-full px-4 py-3 flex items-center justify-between text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
          onClick={() => setHistoryOpen((v) => !v)}
        >
          Historia godzin pracy
          <span className="text-gray-500">{historyOpen ? "▲" : "▼"}</span>
        </button>
        {historyOpen && (
          <div className="px-4 pb-4 border-t">
            <AttendanceHistoryList companyId={companyId} />
          </div>
        )}
      </div>
    </div>
  );
}
