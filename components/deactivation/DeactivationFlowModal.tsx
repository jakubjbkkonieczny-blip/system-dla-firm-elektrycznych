"use client";

import { useAuth } from "@/components/AuthProvider";
import {
  confirmDeactivationVerification,
  startDeactivationVerification,
  submitDeactivationFinal,
} from "@/lib/deactivation/deactivation-client-api";
import {
  DEACTIVATION_CONSEQUENCES,
  DEACTIVATION_CONFIRMATIONS,
  DEACTIVATION_WARNING_POINTS,
  type DeactivationConfirmationId,
} from "@/lib/deactivation/deactivation-ui-copy";
import {
  allConfirmationsChecked,
  createEmptyConfirmationState,
  hasStripeCancellationWarning,
  isPasswordStepValid,
  isVerificationCodeValid,
  mapDeactivationFinalError,
  mapVerificationConfirmError,
  mapVerificationStartError,
  type DeactivationConfirmationState,
  type DeactivationFlowStep,
} from "@/lib/deactivation/deactivation-ui-helpers";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type Props = {
  userEmail: string;
  onClose: () => void;
};

const STEP_ORDER: DeactivationFlowStep[] = [
  "warning",
  "emailVerification",
  "consequences",
  "confirmations",
  "password",
  "finalConfirmation",
];

function stepTitle(step: DeactivationFlowStep): string {
  switch (step) {
    case "warning":
      return "Usuń konto i firmę";
    case "emailVerification":
      return "Weryfikacja e-mail";
    case "consequences":
      return "Konsekwencje dezaktywacji";
    case "confirmations":
      return "Wymagane potwierdzenia";
    case "password":
      return "Potwierdzenie hasłem";
    case "finalConfirmation":
      return "Ostateczne potwierdzenie";
  }
}

function stepProgress(step: DeactivationFlowStep): string {
  const index = STEP_ORDER.indexOf(step);
  return `Krok ${index + 1} z ${STEP_ORDER.length}`;
}

export function DeactivationFlowModal({ userEmail, onClose }: Props) {
  const router = useRouter();
  const { logout } = useAuth();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLElement | null>(null);
  const setFirstFocus = useCallback((el: HTMLElement | null) => {
    firstFocusRef.current = el;
  }, []);

  const [step, setStep] = useState<DeactivationFlowStep>("warning");
  const [err, setErr] = useState<string | null>(null);

  const [codeSent, setCodeSent] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [codeConfirming, setCodeConfirming] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  const [confirmations, setConfirmations] = useState<DeactivationConfirmationState>(
    createEmptyConfirmationState
  );
  const [password, setPassword] = useState("");
  const [finalBusy, setFinalBusy] = useState(false);

  const resetFlow = useCallback(() => {
    setStep("warning");
    setErr(null);
    setCodeSent(false);
    setCodeSending(false);
    setCodeConfirming(false);
    setVerificationCode("");
    setConfirmations(createEmptyConfirmationState());
    setPassword("");
    setFinalBusy(false);
  }, []);

  const handleClose = useCallback(() => {
    if (finalBusy) return;
    resetFlow();
    onClose();
  }, [finalBusy, onClose, resetFlow]);

  useEffect(() => {
    firstFocusRef.current?.focus();
  }, [step]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || finalBusy) return;
      if (step === "finalConfirmation") {
        setStep("password");
        setErr(null);
        return;
      }
      handleClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finalBusy, handleClose, step]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function sendVerificationCode() {
    setCodeSending(true);
    setErr(null);

    try {
      await startDeactivationVerification();
      setCodeSent(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "SEND_ERROR";
      setErr(mapVerificationStartError(message));
    } finally {
      setCodeSending(false);
    }
  }

  async function confirmVerificationCode() {
    if (!isVerificationCodeValid(verificationCode)) {
      setErr("Wpisz 6-cyfrowy kod weryfikacyjny.");
      return;
    }

    setCodeConfirming(true);
    setErr(null);

    try {
      await confirmDeactivationVerification(verificationCode);
      setStep("consequences");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "CONFIRM_ERROR";
      setErr(mapVerificationConfirmError(message));
    } finally {
      setCodeConfirming(false);
    }
  }

  async function handleFinalDeactivation() {
    if (!isPasswordStepValid(password)) {
      setErr("Podaj aktualne hasło.");
      return;
    }

    setFinalBusy(true);
    setErr(null);

    try {
      const response = await submitDeactivationFinal(password);
      const stripeWarning = hasStripeCancellationWarning(response);

      await logout();
      router.replace(
        stripeWarning ? "/account-deactivated?stripeWarning=1" : "/account-deactivated"
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "FINAL_ERROR";
      setErr(mapDeactivationFinalError(message));
      setFinalBusy(false);
    }
  }

  function toggleConfirmation(id: DeactivationConfirmationId, checked: boolean) {
    setConfirmations((prev) => ({ ...prev, [id]: checked }));
  }

  const canProceedFromConfirmations = allConfirmationsChecked(confirmations);
  const canProceedFromPassword = isPasswordStepValid(password);

  return (
    <div
      className="fixed inset-0 bg-overlay flex items-center justify-center p-4 sm:p-6 z-50"
      role="presentation"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg theme-glass bg-card rounded-2xl p-5 sm:p-6 space-y-5 border border-danger-border shadow-lg max-h-[min(92vh,44rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-danger">{stepProgress(step)}</p>
          <h3 id={titleId} className="text-lg font-semibold text-text">
            {stepTitle(step)}
          </h3>
        </header>

        {err ? (
          <div
            role="alert"
            className="text-sm text-danger border border-danger-border bg-danger-bg p-3 rounded-xl"
          >
            {err}
          </div>
        ) : null}

        {step === "warning" ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Ta operacja jest krytyczna i dotyczy zarówno Twojego konta pracodawcy, jak i firmy.
            </p>
            <ul className="text-sm text-text list-disc list-inside space-y-2">
              {DEACTIVATION_WARNING_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                ref={setFirstFocus}
                type="button"
                onClick={handleClose}
                className="min-h-[44px] px-4 py-2 border border-border rounded-lg hover:bg-card-hover text-text"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => {
                  setErr(null);
                  setStep("emailVerification");
                }}
                className="min-h-[44px] px-4 py-2 bg-danger text-white rounded-lg hover:opacity-90"
              >
                Kontynuuj
              </button>
            </div>
          </div>
        ) : null}

        {step === "emailVerification" ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Aby kontynuować, potwierdź tożsamość kodem wysłanym na adres{" "}
              <span className="font-medium text-text">{userEmail}</span>.
            </p>

            {!codeSent ? (
              <p className="text-sm text-text-muted">
                Kliknij poniżej, aby otrzymać 6-cyfrowy kod weryfikacyjny.
              </p>
            ) : (
              <p className="text-sm text-success border border-success-border bg-success-bg p-3 rounded-xl">
                Jeśli dostawa e-mail działa, kod został wysłany na Twój adres. Sprawdź skrzynkę
                (również folder spam).
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                ref={setFirstFocus}
                type="button"
                onClick={() => void sendVerificationCode()}
                disabled={codeSending || codeConfirming}
                className="min-h-[44px] px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary hover:text-primary-fg transition disabled:opacity-50"
              >
                {codeSending ? "Wysyłanie..." : codeSent ? "Wyślij kod ponownie" : "Wyślij kod"}
              </button>
            </div>

            <div>
              <label htmlFor="deactivation-verification-code" className="text-sm text-text-muted block mb-1">
                Kod weryfikacyjny
              </label>
              <input
                id="deactivation-verification-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full min-h-[44px] border border-border rounded-lg px-3 py-2 bg-input text-text tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setErr(null);
                  setStep("warning");
                }}
                disabled={codeConfirming}
                className="min-h-[44px] px-4 py-2 border border-border rounded-lg hover:bg-card-hover text-text disabled:opacity-50"
              >
                Wstecz
              </button>
              <button
                type="button"
                onClick={() => void confirmVerificationCode()}
                disabled={codeConfirming || !isVerificationCodeValid(verificationCode)}
                className="min-h-[44px] px-4 py-2 bg-primary text-primary-fg rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {codeConfirming ? "Sprawdzanie..." : "Potwierdź kod"}
              </button>
            </div>
          </div>
        ) : null}

        {step === "consequences" ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Przed kontynuacją zapoznaj się z konsekwencjami dezaktywacji:
            </p>
            <ul className="text-sm text-text list-disc list-inside space-y-2">
              {DEACTIVATION_CONSEQUENCES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                ref={setFirstFocus}
                type="button"
                onClick={() => {
                  setErr(null);
                  setStep("emailVerification");
                }}
                className="min-h-[44px] px-4 py-2 border border-border rounded-lg hover:bg-card-hover text-text"
              >
                Wstecz
              </button>
              <button
                type="button"
                onClick={() => {
                  setErr(null);
                  setStep("confirmations");
                }}
                className="min-h-[44px] px-4 py-2 bg-primary text-primary-fg rounded-lg hover:opacity-90"
              >
                Kontynuuj
              </button>
            </div>
          </div>
        ) : null}

        {step === "confirmations" ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Zaznacz wszystkie poniższe oświadczenia, aby kontynuować:
            </p>
            <fieldset className="space-y-3 border-0 p-0 m-0">
              <legend className="sr-only">Wymagane potwierdzenia dezaktywacji</legend>
              {DEACTIVATION_CONFIRMATIONS.map((item) => (
                <label
                  key={item.id}
                  className="flex items-start gap-3 text-sm text-text cursor-pointer"
                >
                  <input
                    ref={item.id === "accessLoss" ? setFirstFocus : undefined}
                    type="checkbox"
                    checked={confirmations[item.id]}
                    onChange={(e) => toggleConfirmation(item.id, e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-danger)]"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setErr(null);
                  setStep("consequences");
                }}
                className="min-h-[44px] px-4 py-2 border border-border rounded-lg hover:bg-card-hover text-text"
              >
                Wstecz
              </button>
              <button
                type="button"
                onClick={() => {
                  setErr(null);
                  setStep("password");
                }}
                disabled={!canProceedFromConfirmations}
                className="min-h-[44px] px-4 py-2 bg-primary text-primary-fg rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                Dalej
              </button>
            </div>
          </div>
        ) : null}

        {step === "password" ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Podaj aktualne hasło, aby przejść do ostatecznego potwierdzenia dezaktywacji.
            </p>
            <div>
              <label htmlFor="deactivation-current-password" className="text-sm text-text-muted block mb-1">
                Aktualne hasło
              </label>
              <input
                ref={setFirstFocus}
                id="deactivation-current-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[44px] border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setErr(null);
                  setStep("confirmations");
                }}
                disabled={finalBusy}
                className="min-h-[44px] px-4 py-2 border border-border rounded-lg hover:bg-card-hover text-text disabled:opacity-50"
              >
                Wstecz
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!canProceedFromPassword) {
                    setErr("Podaj aktualne hasło.");
                    return;
                  }
                  setErr(null);
                  setStep("finalConfirmation");
                }}
                disabled={!canProceedFromPassword}
                className="min-h-[44px] px-4 py-2 bg-primary text-primary-fg rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                Dalej
              </button>
            </div>
          </div>
        ) : null}

        {step === "finalConfirmation" ? (
          <div className="space-y-4">
            <p className="text-sm text-text">
              Czy na pewno chcesz dezaktywować konto i firmę?
            </p>
            <p className="text-sm text-text-muted">
              Po zatwierdzeniu utracisz dostęp do firmy i rozpocznie się 12-miesięczny okres
              odzyskiwania.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                ref={setFirstFocus}
                type="button"
                onClick={() => {
                  setErr(null);
                  setStep("password");
                }}
                disabled={finalBusy}
                className="min-h-[44px] px-4 py-2 border border-border rounded-lg hover:bg-card-hover text-text disabled:opacity-50"
              >
                Wróć
              </button>
              <button
                type="button"
                onClick={() => void handleFinalDeactivation()}
                disabled={finalBusy}
                className="min-h-[44px] px-4 py-2 bg-danger text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {finalBusy ? "Dezaktywowanie..." : "Tak, dezaktywuj konto i firmę"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
