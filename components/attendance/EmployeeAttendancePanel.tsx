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
    if (!companyId) {
      setSessionLoading(false);
      return;
    }

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
    if (!companyId) return;

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
        <h1 className="text-xl font-semibold text-text">Moja obecność</h1>
      </div>

      {success && (
        <div className="text-sm text-success border border-success-border bg-success-bg rounded-lg p-3">
          {success}
        </div>
      )}
      {err && (
        <div className="text-sm text-danger border border-danger-border bg-danger-bg rounded-lg p-3">
          {err}
        </div>
      )}

      <div className="border border-border rounded-xl bg-primary text-primary-fg p-4 space-y-1">
        <div className="text-sm font-medium opacity-90">Dzisiejsza obecność</div>
        <div className="text-lg font-semibold">Data: {todayDisplay}</div>
        {!sessionLoading && (
          <div className="text-sm opacity-90 pt-1">{getEmployeeStateLabel(state)}</div>
        )}
      </div>

      <div className="border border-border rounded-xl bg-card p-4 space-y-3">
        {sessionLoading ? (
          <div className="text-sm text-text-muted">Ładowanie statusu...</div>
        ) : (
          <>
            {session?.startedAt && (
              <div className="text-sm text-text-muted">
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
              <div className="text-sm text-text-muted">
                Praca: <b>{formatMinutes(session?.totalWorkedMinutes ?? 0)}</b> · Przerwy:{" "}
                <b>{formatMinutes(session?.totalBreakMinutes ?? 0)}</b>
              </div>
            )}
            {state === "finished" && (
              <p className="text-sm text-text bg-bg-secondary border border-border rounded-lg px-3 py-2">
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
                "w-full min-h-[44px] py-4 rounded-xl text-base font-semibold border disabled:opacity-60",
                action === "finish_work"
                  ? "bg-primary text-primary-fg border-primary"
                  : "bg-card text-text border-border hover:bg-card-hover",
              ].join(" ")}
            >
              {ACTION_LABELS[action]}
            </button>
          ))}
        </div>
      )}

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <button
          type="button"
          className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between text-left text-sm font-medium text-text hover:bg-card-hover"
          onClick={() => setHistoryOpen((v) => !v)}
        >
          Historia godzin pracy
          <span className="text-text-muted">{historyOpen ? "▲" : "▼"}</span>
        </button>
        {historyOpen && (
          <div className="px-4 pb-4 border-t border-border">
            <AttendanceHistoryList companyId={companyId} />
          </div>
        )}
      </div>
    </div>
  );
}
