"use client";

import { AttendanceStatusBadge } from "@/components/attendance/AttendanceStatusBadge";
import { apiFetch } from "@/lib/api";
import { formatDateShort, formatTimeHm } from "@/lib/attendance/dates";
import { formatMinutes } from "@/lib/attendance/duration";
import type { AttendanceHistoryDay, AttendanceHistoryResponse } from "@/lib/attendance/types";
import { useCallback, useEffect, useState } from "react";

const PAGE_LIMIT = 20;

export function AttendanceHistoryList({
  companyId,
  userId,
  emptyMessage = "Brak zapisanej historii.",
}: {
  companyId: string;
  userId?: string;
  emptyMessage?: string;
}) {
  const [items, setItems] = useState<AttendanceHistoryDay[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (cursor?: string, append = false) => {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_LIMIT));
      if (userId) qs.set("userId", userId);
      if (cursor) qs.set("cursor", cursor);

      const res = (await apiFetch(
        `/api/companies/${companyId}/attendance/history?${qs.toString()}`
      )) as AttendanceHistoryResponse;

      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setNextCursor(res.nextCursor);
    },
    [companyId, userId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      setErr(null);
      try {
        await fetchPage();
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "LOAD_ERROR");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setErr(null);
    try {
      await fetchPage(nextCursor, true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "LOAD_ERROR");
    } finally {
      setLoadingMore(false);
    }
  }

  if (busy && items.length === 0) {
    return <div className="text-sm text-gray-500">Ładowanie historii...</div>;
  }

  if (err) {
    return (
      <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-2 rounded">
        {err}
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="text-sm text-gray-500">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-2">
      {items.map((h) => (
        <div
          key={`${h.date}-${h.startedAt ?? ""}-${h.endedAt ?? ""}`}
          className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm"
        >
          <div>
            <div className="font-medium">{formatDateShort(h.date)}</div>
            <div className="text-xs text-gray-500">
              {formatTimeHm(h.startedAt)} – {formatTimeHm(h.endedAt)}
            </div>
          </div>
          <div className="text-right space-y-1 shrink-0">
            <AttendanceStatusBadge status={h.status} />
            <div className="text-xs text-gray-600">
              {formatMinutes(h.totalWorkedMinutes)} · przerwa {formatMinutes(h.totalBreakMinutes)}
            </div>
          </div>
        </div>
      ))}
      {nextCursor && (
        <button
          type="button"
          className="w-full py-2 text-sm border rounded-lg bg-white hover:bg-gray-50 disabled:opacity-60"
          disabled={loadingMore}
          onClick={loadMore}
        >
          {loadingMore ? "Ładowanie..." : "Pokaż więcej"}
        </button>
      )}
    </div>
  );
}
