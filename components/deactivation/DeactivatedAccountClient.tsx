"use client";

import { AuthCardHeader } from "@/components/auth/AuthCardHeader";
import { AuthMessage } from "@/components/auth/AuthMessage";
import { AuthShell } from "@/components/auth/AuthShell";
import { RecoveryConfirmationModal } from "@/components/deactivation/RecoveryConfirmationModal";
import { submitAccountRecovery } from "@/lib/deactivation/deactivation-client-api";
import {
  DEACTIVATED_ACCOUNT_EXPLANATION,
  DEACTIVATED_ACCOUNT_TITLE,
  DEACTIVATED_RECOVERY_EXPIRED_BODY,
  DEACTIVATED_RECOVERY_EXPIRED_TITLE,
  DEACTIVATED_STRIPE_WARNING,
  formatDeactivationDate,
} from "@/lib/deactivation/deactivated-account-ui-copy";
import {
  beginRecoverySubmit,
  buildRecoveryLoginRedirectUrl,
  canSubmitRecovery,
  createRecoverySubmitGuard,
  finishRecoverySubmit,
  mapRecoveryError,
  shouldRedirectToLoginAfterRecovery,
  type RecoverySubmitGuard,
} from "@/lib/deactivation/recovery-ui-helpers";
import type { DeactivatedAccountState } from "@/lib/server/deactivation/get-deactivated-account-state";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  initialState: DeactivatedAccountState;
};

function DeactivatedAccountInner({ initialState }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const recoveryGuardRef = useRef<RecoverySubmitGuard>(createRecoverySubmitGuard());

  const stripeWarning = useMemo(() => searchParams.get("stripeWarning") === "1", [searchParams]);

  useEffect(() => {
    if (!stripeWarning) return;
    router.replace("/account-deactivated", { scroll: false });
  }, [router, stripeWarning]);

  async function handleLogout() {
    setBusy(true);
    try {
      await fetch("/api/deactivation/access/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      // proceed to login even if network fails
    }
    router.replace("/login");
  }

  function openRecoveryModal() {
    if (!initialState.isRecoverable || recoveryBusy) return;
    setRecoveryError(null);
    setRecoveryModalOpen(true);
  }

  function closeRecoveryModal() {
    if (recoveryBusy) return;
    setRecoveryError(null);
    setRecoveryModalOpen(false);
  }

  async function handleRecoveryConfirm() {
    if (!canSubmitRecovery(recoveryGuardRef.current)) {
      return;
    }

    const nextGuard = beginRecoverySubmit(recoveryGuardRef.current);
    if (!nextGuard) {
      return;
    }

    recoveryGuardRef.current = nextGuard;
    setRecoveryBusy(true);
    setRecoveryError(null);

    try {
      const response = await submitAccountRecovery();

      if (shouldRedirectToLoginAfterRecovery(response)) {
        router.replace(buildRecoveryLoginRedirectUrl());
        return;
      }

      setRecoveryError(mapRecoveryError("INTERNAL_ERROR"));
      recoveryGuardRef.current = finishRecoverySubmit(recoveryGuardRef.current);
      setRecoveryBusy(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "INTERNAL_ERROR";
      setRecoveryError(mapRecoveryError(message));
      recoveryGuardRef.current = finishRecoverySubmit(recoveryGuardRef.current);
      setRecoveryBusy(false);
    }
  }

  const deactivatedLabel = formatDeactivationDate(initialState.deactivatedAt);
  const recoveryLabel = formatDeactivationDate(initialState.recoveryDeadline);

  return (
    <AuthShell accountType="employer">
      <AuthCardHeader
        accountType="employer"
        title={
          initialState.recoveryExpired
            ? DEACTIVATED_RECOVERY_EXPIRED_TITLE
            : DEACTIVATED_ACCOUNT_TITLE
        }
        typeLabel="Pracodawca"
      />

      <div className="px-6 sm:px-8 pb-8 pt-2 space-y-5">
        {stripeWarning ? (
          <div role="alert" aria-live="polite">
            <AuthMessage>{DEACTIVATED_STRIPE_WARNING}</AuthMessage>
          </div>
        ) : null}

        {initialState.recoveryExpired ? (
          <p className="text-sm text-slate-400 leading-relaxed">{DEACTIVATED_RECOVERY_EXPIRED_BODY}</p>
        ) : (
          <>
            <div className="space-y-2 text-sm text-slate-300 leading-relaxed">
              <p>
                Twoje konto zostało zdezaktywowane dnia:{" "}
                <span className="font-semibold text-white">{deactivatedLabel}</span>
              </p>
              <p>
                Firma: <span className="font-semibold text-white">{initialState.companyName}</span>
              </p>
              {initialState.isRecoverable ? (
                <p>
                  Możesz rozpocząć proces odzyskania konta do:{" "}
                  <span className="font-semibold text-white">{recoveryLabel}</span>
                </p>
              ) : null}
            </div>

            <ul className="text-sm text-slate-400 list-disc list-inside space-y-1.5">
              {DEACTIVATED_ACCOUNT_EXPLANATION.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            <button
              type="button"
              disabled={!initialState.isRecoverable || busy || recoveryBusy}
              onClick={openRecoveryModal}
              className="w-full min-h-[48px] rounded-xl text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed bg-amber-500/90 text-slate-950 hover:bg-amber-400 transition-colors"
              aria-describedby={!initialState.isRecoverable ? "recovery-unavailable" : undefined}
            >
              Odzyskaj konto
            </button>
            {!initialState.isRecoverable ? (
              <p id="recovery-unavailable" className="sr-only">
                Odzyskanie konta nie jest obecnie dostępne.
              </p>
            ) : null}
          </>
        )}

        <button
          type="button"
          disabled={busy || recoveryBusy}
          onClick={() => void handleLogout()}
          className="w-full min-h-[48px] rounded-xl text-base font-semibold border border-white/15 text-slate-200 hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          {busy ? "Wylogowywanie..." : "Wróć do logowania"}
        </button>
      </div>

      {recoveryModalOpen ? (
        <RecoveryConfirmationModal
          error={recoveryError}
          busy={recoveryBusy}
          onCancel={closeRecoveryModal}
          onConfirm={() => void handleRecoveryConfirm()}
        />
      ) : null}
    </AuthShell>
  );
}

export function DeactivatedAccountClient({ initialState }: Props) {
  return (
    <Suspense fallback={null}>
      <DeactivatedAccountInner initialState={initialState} />
    </Suspense>
  );
}
