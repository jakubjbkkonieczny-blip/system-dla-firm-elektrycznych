"use client";

import { STAGE_STATUS_LABELS, type StagePlStatus } from "@/lib/jobs/stage-status";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type JobStageCardData = {
  id: string;
  nazwa_etapu: string;
  opis_etapu?: string;
  planowana_data?: string;
  status: StagePlStatus;
  data_zakonczenia?: string | null;
  zakonczone_przez?: { displayName: string; email: string | null } | null;
  notatka_pracownika?: string;
  lista_zdjec?: string[];
  kierownik_etapu?: { uid: string; displayName: string; email: string | null } | null;
  kierownik_moze_tworzyc_etapy?: boolean;
  odrzucenie_komentarz?: string;
};

export type JobStageCardPermissions = {
  canEditMeta: boolean;
  canDelete: boolean;
  canAssignSupervisor: boolean;
  canEditNote: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canReopen: boolean;
};

type Props = {
  stage: JobStageCardData;
  busy: boolean;
  permissions: JobStageCardPermissions;
  onEditMeta: () => void;
  onDelete: () => void;
  onAssignSupervisor: () => void;
  onEditNote: () => void;
  onNoteHistory: () => void;
  onEventHistory: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onReopen: () => void;
};

function statusBadgeClass(status: StagePlStatus): string {
  switch (status) {
    case "zakonczony":
      return "bg-success-bg text-success border-success-border";
    case "oczekuje_na_akceptacje":
      return "bg-warning-bg text-warning border-warning-border";
    case "do_poprawy":
      return "bg-danger-bg text-danger border-danger-border";
    case "w_realizacji":
      return "bg-card text-accent border-border";
    default:
      return "bg-bg-secondary text-text-muted border-border";
  }
}

export function JobStageCard({
  stage,
  busy,
  permissions,
  onEditMeta,
  onDelete,
  onAssignSupervisor,
  onEditNote,
  onNoteHistory,
  onEventHistory,
  onSubmit,
  onApprove,
  onReject,
  onReopen,
}: Props) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const photos = Array.isArray(stage.lista_zdjec) ? stage.lista_zdjec : [];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!actionsOpen) return;
    const mq = window.matchMedia("(min-width: 768px)");
    if (!mq.matches) return;

    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [actionsOpen]);

  function runAction(item: { label: string; onClick: () => void }) {
    item.onClick();
    setActionsOpen(false);
  }

  const actionButtonClass = (variant?: "danger") =>
    [
      "w-full text-left px-4 py-3 min-h-[44px] text-sm hover:bg-card-hover",
      variant === "danger" ? "text-danger" : "text-text",
    ].join(" ");

  const actionItems: { label: string; onClick: () => void; variant?: "danger" }[] = [];

  if (permissions.canEditMeta) actionItems.push({ label: "Edytuj etap", onClick: onEditMeta });
  if (permissions.canDelete)
    actionItems.push({ label: "Usuń etap", onClick: onDelete, variant: "danger" });
  if (permissions.canAssignSupervisor)
    actionItems.push({ label: "Przypisz kierownika", onClick: onAssignSupervisor });
  if (permissions.canEditNote) actionItems.push({ label: "Edytuj notatkę", onClick: onEditNote });
  if (permissions.canSubmit)
    actionItems.push({ label: "Oznacz jako wykonany", onClick: onSubmit });
  if (permissions.canApprove) actionItems.push({ label: "Akceptuj wykonanie", onClick: onApprove });
  if (permissions.canReject)
    actionItems.push({ label: "Odrzuć wykonanie", onClick: onReject, variant: "danger" });
  if (permissions.canReopen) actionItems.push({ label: "Cofnij zakończenie", onClick: onReopen });

  const mobileActionsSheet =
    actionsOpen && actionItems.length > 0 ? (
      <div
        className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-overlay p-0"
        onClick={() => setActionsOpen(false)}
        role="presentation"
      >
        <div
          className="w-full max-h-[85vh] flex flex-col bg-bg-secondary border border-border border-b-0 rounded-t-2xl shadow-xl pb-[env(safe-area-inset-bottom)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`stage-actions-title-${stage.id}`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 shrink-0 bg-bg-secondary">
            <div className="min-w-0">
              <h2
                id={`stage-actions-title-${stage.id}`}
                className="text-lg font-semibold text-text"
              >
                Akcje
              </h2>
              <p className="text-sm text-text-muted mt-0.5 truncate">{stage.nazwa_etapu}</p>
            </div>
            <button
              type="button"
              className="min-h-[44px] min-w-[44px] rounded-lg border border-border bg-bg-secondary text-text-muted hover:bg-card-hover shrink-0"
              onClick={() => setActionsOpen(false)}
              aria-label="Zamknij"
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain py-1 bg-bg-secondary">
            {actionItems.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={busy}
                onClick={() => runAction(item)}
                className={actionButtonClass(item.variant)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <article className="theme-glass border border-border rounded-xl p-4 bg-card space-y-3 min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-text truncate">{stage.nazwa_etapu}</h3>
            <span
              className={[
                "inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold",
                statusBadgeClass(stage.status),
              ].join(" ")}
            >
              {STAGE_STATUS_LABELS[stage.status]}
            </span>
          </div>

          {stage.kierownik_etapu ? (
            <div className="text-sm text-text-muted">
              Kierownik:{" "}
              <span className="text-text font-medium">{stage.kierownik_etapu.displayName}</span>
              {stage.kierownik_moze_tworzyc_etapy ? (
                <span className="text-xs ml-1">(może dodawać etapy)</span>
              ) : null}
            </div>
          ) : null}

          <div className="text-sm text-text-muted">
            Planowana data:{" "}
            <span className="text-text font-medium">
              {stage.planowana_data ? stage.planowana_data : "(brak)"}
            </span>
          </div>

          {stage.opis_etapu ? (
            <p className="text-sm text-text whitespace-pre-wrap break-words">{stage.opis_etapu}</p>
          ) : null}

          <div className="text-sm">
            {stage.notatka_pracownika ? (
              <p className="text-text">
                <span className="text-text-muted">Notatka:</span> {stage.notatka_pracownika}
              </p>
            ) : (
              <p className="text-text-muted text-xs">Notatka: (brak)</p>
            )}
          </div>

          {stage.status === "do_poprawy" && stage.odrzucenie_komentarz ? (
            <div className="text-sm text-danger border border-danger-border bg-danger-bg rounded-lg px-3 py-2">
              <span className="font-medium">Komentarz odrzucenia:</span>{" "}
              {stage.odrzucenie_komentarz}
            </div>
          ) : null}

          {stage.status === "zakonczony" && stage.zakonczone_przez ? (
            <div className="text-xs text-text-muted">
              Zakończono: {stage.data_zakonczenia || "—"} · {stage.zakonczone_przez.displayName}
            </div>
          ) : null}
        </div>

        {actionItems.length > 0 ? (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              disabled={busy}
              onClick={() => setActionsOpen((v) => !v)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-border bg-card text-text hover:bg-card-hover text-sm font-medium w-full sm:w-auto"
            >
              Akcje ▾
            </button>
            {actionsOpen ? (
              <div className="hidden md:block absolute right-0 mt-1 z-20 w-[min(100vw-2rem,14rem)] rounded-xl border border-border bg-card shadow-lg py-1">
                {actionItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled={busy}
                    onClick={() => runAction(item)}
                    className={actionButtonClass(item.variant)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {mounted && mobileActionsSheet ? createPortal(mobileActionsSheet, document.body) : null}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={onNoteHistory}
          className="min-h-[44px] px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text text-xs font-medium hover:bg-card-hover"
        >
          Historia notatek
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onEventHistory}
          className="min-h-[44px] px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text text-xs font-medium hover:bg-card-hover"
        >
          Historia etapu
        </button>
      </div>

      {photos.length > 0 ? (
        <div>
          <div className="text-xs text-text-muted mb-2">Zdjęcia</div>
          <div className="flex gap-2 flex-wrap">
            {photos.map((url, idx) => (
              <a
                key={idx}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block"
                title="Otwórz zdjęcie"
              >
                <img
                  src={url}
                  alt={`Zdjęcie ${idx + 1}`}
                  className="w-20 h-20 object-cover rounded-lg border border-border bg-card"
                />
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}
