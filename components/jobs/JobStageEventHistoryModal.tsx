"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

const EVENT_LABELS: Record<string, string> = {
  supervisor_assigned: "Przypisano kierownika etapu",
  supervisor_cleared: "Usunięto kierownika etapu",
  submitted_for_approval: "Zgłoszono do akceptacji",
  approved: "Zaakceptowano wykonanie",
  rejected: "Odrzucono wykonanie",
  reopened: "Cofnięto zakończenie",
};

type HistoryItem = {
  id: string;
  eventType: string;
  comment: string | null;
  metadata: { supervisorCanCreateStages?: boolean } | null;
  createdAt: string;
  actor: { uid: string; displayName: string; email: string | null };
  target: { uid: string; displayName: string; email: string | null } | null;
};

export function JobStageEventHistoryModal({
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
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(
          `/api/companies/${companyId}/jobs/${jobId}/etapy_realizacji/${stageId}/historia`
        );
        if (!cancelled) {
          setItems(Array.isArray(data?.items) ? data.items : []);
        }
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
  }, [companyId, jobId, stageId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto theme-glass bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-text">Historia etapu</h3>
            <p className="text-sm text-text-muted truncate">{stageName}</p>
          </div>
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-border bg-card text-text-muted hover:bg-card-hover shrink-0"
            onClick={onClose}
            aria-label="Zamknij"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-text-muted">Ładowanie…</p>
        ) : err ? (
          <p className="text-sm text-danger">{err}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-muted">Brak zdarzeń w historii.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-border bg-bg-secondary p-3 text-sm space-y-1"
              >
                <div className="font-medium text-text">
                  {EVENT_LABELS[item.eventType] ?? item.eventType}
                </div>
                <div className="text-text-muted text-xs">
                  {new Date(item.createdAt).toLocaleString("pl-PL")} · {item.actor.displayName}
                </div>
                {item.target ? (
                  <div className="text-text-muted">
                    Kierownik: <span className="text-text">{item.target.displayName}</span>
                  </div>
                ) : null}
                {item.metadata?.supervisorCanCreateStages ? (
                  <div className="text-xs text-text-muted">Może tworzyć nowe etapy</div>
                ) : null}
                {item.comment ? (
                  <div className="text-text mt-1 whitespace-pre-wrap break-words">{item.comment}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
