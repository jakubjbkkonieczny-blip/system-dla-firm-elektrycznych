"use client";

import {
  RECOVERY_CONFIRMATION_INTRO,
  RECOVERY_CONFIRMATION_POINTS,
  RECOVERY_CONFIRMATION_TITLE,
  RECOVERY_CONFIRM_CANCEL,
  RECOVERY_CONFIRM_SUBMIT,
  RECOVERY_SUBMIT_LOADING,
} from "@/lib/deactivation/recovery-ui-copy";
import { useCallback, useEffect, useId, useRef } from "react";

type Props = {
  error: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RecoveryConfirmationModal({ error, busy, onCancel, onConfirm }: Props) {
  const titleId = useId();
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  const handleCancel = useCallback(() => {
    if (busy) return;
    onCancel();
  }, [busy, onCancel]);

  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || busy) return;
      handleCancel();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, handleCancel]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 sm:p-6 z-50"
      role="presentation"
      onClick={handleCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border border-white/15 bg-slate-900 p-5 sm:p-6 space-y-5 shadow-lg max-h-[min(92vh,44rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="space-y-1">
          <h3 id={titleId} className="text-lg font-semibold text-white">
            {RECOVERY_CONFIRMATION_TITLE}
          </h3>
        </header>

        <p className="text-sm text-slate-300 leading-relaxed">{RECOVERY_CONFIRMATION_INTRO}</p>

        <ul className="text-sm text-slate-300 list-disc list-inside space-y-2">
          {RECOVERY_CONFIRMATION_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        {error ? (
          <div
            role="alert"
            aria-live="polite"
            className="text-sm text-amber-200 border border-amber-500/30 bg-amber-500/10 p-3 rounded-xl"
          >
            {error}
          </div>
        ) : null}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            ref={firstFocusRef}
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="min-h-[48px] px-4 py-2 border border-white/15 rounded-xl text-slate-200 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {RECOVERY_CONFIRM_CANCEL}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-[48px] px-4 py-2 rounded-xl font-semibold bg-amber-500/90 text-slate-950 hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {busy ? RECOVERY_SUBMIT_LOADING : RECOVERY_CONFIRM_SUBMIT}
          </button>
        </div>
      </div>
    </div>
  );
}
