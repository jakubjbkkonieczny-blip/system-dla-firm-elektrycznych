"use client";

import { AttendanceHistoryTree } from "@/components/attendance/AttendanceHistoryTree";
import { apiFetch } from "@/lib/api";
import type {
  AttendanceHistoryDay,
  AttendanceHistoryMonthSummary,
  AttendanceHistoryResponse,
} from "@/lib/attendance/types";
import { useCallback, useEffect, useState } from "react";

const PAGE_LIMIT = 20;

export function AttendanceHistoryList({
  companyId,
  userId,
  emptyMessage = "Brak historii czasu pracy.",
  layout = "default",
}: {
  companyId: string;
  userId?: string;
  emptyMessage?: string;
  layout?: "default" | "comfortable";
}) {
  const [items, setItems] = useState<AttendanceHistoryDay[]>([]);
  const [monthSummaries, setMonthSummaries] = useState<
    AttendanceHistoryMonthSummary[] | undefined
  >();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (cursor?: string, append = false) => {
      if (!companyId) return;

      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_LIMIT));
      if (userId) qs.set("userId", userId);
      if (cursor) qs.set("cursor", cursor);

      const res = (await apiFetch(
        `/api/companies/${companyId}/attendance/history?${qs.toString()}`
      )) as AttendanceHistoryResponse;

      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      if (!append && res.monthSummaries) {
        setMonthSummaries(res.monthSummaries);
      }
      setNextCursor(res.nextCursor);
    },
    [companyId, userId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      setErr(null);
      setMonthSummaries(undefined);
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
    return <div className="text-sm text-text-muted">Ładowanie historii...</div>;
  }

  if (err) {
    return (
      <div className="text-sm text-danger bg-danger-bg border border-danger-border p-2 rounded">
        {err}
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="text-sm text-text-muted">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      <AttendanceHistoryTree
        items={items}
        monthSummaries={monthSummaries}
        layout={layout}
      />
      {nextCursor && (
        <button
          type="button"
          className="w-full min-h-[44px] py-2 text-sm border border-border rounded-lg bg-card text-text hover:bg-card-hover disabled:opacity-60"
          disabled={loadingMore}
          onClick={loadMore}
        >
          {loadingMore ? "Ładowanie..." : "Pokaż więcej"}
        </button>
      )}
    </div>
  );
}
