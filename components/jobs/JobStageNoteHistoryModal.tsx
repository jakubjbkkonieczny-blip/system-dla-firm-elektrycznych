"use client";

import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type HistoryEditor = {
  displayName: string;
  email: string | null;
  roleLabel: string | null;
};

type HistoryItem = {
  id: string;
  createdAt: string;
  previousNote: string;
  newNote: string;
  editedBy: HistoryEditor;
};

type HistoryResponse = {
  stageName: string;
  items: HistoryItem[];
  nextCursor: string | null;
  limit: number;
};

function formatHistoryDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function noteBlock(label: string, text: string) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words rounded-lg border bg-white px-3 py-2">
        {text}
      </div>
    </div>
  );
}

export function JobStageNoteHistoryModal({
  companyId,
  jobId,
  stageId,
  stageName,
  onClose,
}: {
  companyId: string;
  jobId: string;
  stageId: string;
  stageName: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [titleStageName, setTitleStageName] = useState(stageName);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadPage = useCallback(
    async (cursor?: string) => {
      const qs = new URLSearchParams({ limit: "20" });
      if (cursor) qs.set("cursor", cursor);
      const data = (await apiFetch(
        `/api/companies/${companyId}/jobs/${jobId}/stages/${stageId}/notes/history?${qs.toString()}`
      )) as HistoryResponse;
      return data;
    },
    [companyId, jobId, stageId]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setItems([]);
    setNextCursor(null);

    (async () => {
      try {
        const data = await loadPage();
        if (cancelled) return;
        setTitleStageName(data.stageName || stageName);
        setItems(data.items);
        setNextCursor(data.nextCursor);
      } catch (e: unknown) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "LOAD_ERROR");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadPage, stageName]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setErr(null);
    try {
      const data = await loadPage(nextCursor);
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "LOAD_ERROR");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-[700px] max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl border bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-note-history-title"
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 sm:px-5 py-4 shrink-0">
          <div className="min-w-0">
            <h2
              id="stage-note-history-title"
              className="text-lg font-semibold text-gray-900"
            >
              Historia notatki
            </h2>
            <p className="text-sm text-gray-600 mt-0.5 truncate">{titleStageName}</p>
          </div>
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] rounded-lg border bg-white text-gray-600 hover:bg-gray-50 shrink-0"
            onClick={onClose}
            aria-label="Zamknij"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
          {err && (
            <div className="text-sm text-red-700 border border-red-200 bg-red-50 p-3 rounded-lg">
              {err}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-500">Ładowanie historii…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-600">Brak zapisanych zmian notatki.</p>
          ) : (
            items.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4 space-y-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 break-words">
                    {item.editedBy.displayName}
                  </div>
                  {item.editedBy.email ? (
                    <div className="text-sm text-gray-600 break-all">
                      {item.editedBy.email}
                    </div>
                  ) : null}
                  {item.editedBy.roleLabel ? (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {item.editedBy.roleLabel}
                    </div>
                  ) : null}
                  <div className="text-xs text-gray-500 mt-1">
                    {formatHistoryDateTime(item.createdAt)}
                  </div>
                </div>

                {noteBlock(
                  "Przed:",
                  item.previousNote.trim()
                    ? `"${item.previousNote}"`
                    : "Brak wcześniejszej notatki"
                )}
                {noteBlock(
                  "Po:",
                  item.newNote.trim() ? `"${item.newNote}"` : "Notatka usunięta"
                )}
              </article>
            ))
          )}

          {nextCursor && !loading ? (
            <button
              type="button"
              className="w-full min-h-[44px] px-4 py-2 rounded-lg border bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? "Ładowanie…" : "Załaduj więcej"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
