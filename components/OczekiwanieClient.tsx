"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { AuthBenefitsStrip } from "@/components/auth/AuthBenefitsStrip";
import { AppLogo } from "@/components/auth/AppLogo";
import { WaitingStatusIcon } from "@/components/auth/WaitingStatusIcon";
import { getAuthAccent } from "@/components/auth/auth-accent";
import { apiFetch } from "@/lib/api";

const ACCESS_FEATURES = [
  { icon: "🧾", label: "Zlecenia" },
  { icon: "📅", label: "Harmonogram" },
  { icon: "📷", label: "Zdjęcia" },
  { icon: "📝", label: "Notatki" },
  { icon: "📊", label: "Statusy prac" },
] as const;

type Props = {
  createdAt?: string | null;
  displayName?: string | null;
  probableEmployerName?: string | null;
};

function formatAccountDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("pl-PL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export default function OczekiwanieClient({
  createdAt,
  displayName,
  probableEmployerName,
}: Props) {
  const router = useRouter();
  const { logout } = useAuth();
  const accent = getAuthAccent("worker");

  const [msg, setMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const isMountedRef = useRef(false);
  const isCheckingRef = useRef(false);

  const accountCreatedLabel = formatAccountDate(createdAt);

  const checkCompanies = useCallback(
    async (showFeedback: boolean) => {
      if (isCheckingRef.current) return false;
      isCheckingRef.current = true;
      if (showFeedback) setRefreshing(true);

      try {
        const data = await apiFetch("/api/me/companies");
        const companies = Array.isArray(data?.companies) ? data.companies : [];

        if (!isMountedRef.current) return false;

        if (companies.length > 0) {
          router.replace("/dashboard");
          return true;
        }

        if (showFeedback) {
          setMsg("Nadal oczekujesz na przypisanie do firmy. Spróbuj ponownie za chwilę.");
        }
        return false;
      } catch {
        if (showFeedback && isMountedRef.current) {
          setMsg("Nie udało się odświeżyć statusu. Sprawdź połączenie i spróbuj ponownie.");
        }
        return false;
      } finally {
        isCheckingRef.current = false;
        if (isMountedRef.current && showFeedback) setRefreshing(false);
      }
    },
    [router]
  );

  useEffect(() => {
    isMountedRef.current = true;
    void checkCompanies(false);
    const interval = setInterval(() => {
      void checkCompanies(false);
    }, 5000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [checkCompanies]);

  async function handleRefresh() {
    setMsg(null);
    await checkCompanies(true);
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/login?type=worker");
    } finally {
      if (isMountedRef.current) setLoggingOut(false);
    }
  }

  const busy = refreshing || loggingOut;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#070d18] text-slate-100 overflow-x-hidden flex flex-col">
      <AuthBackground />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-10">
        <div
          className={[
            "w-full max-w-2xl rounded-2xl border bg-slate-950/50 backdrop-blur-xl",
            "shadow-[0_24px_64px_rgba(0,0,0,0.45)] landing-fade-up",
            accent.card,
          ].join(" ")}
        >
          <div className="px-6 pt-8 pb-2 sm:px-10 sm:pt-10 flex justify-center">
            <AppLogo />
          </div>

          <div className="px-6 sm:px-10 pb-8 sm:pb-10 space-y-6">
            <div className="text-center space-y-4">
              <WaitingStatusIcon />
              <div className="space-y-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Czekasz na przypisanie do firmy
                </h1>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl mx-auto">
                  Twoje konto zostało utworzone. Pracodawca musi dodać Cię do swojej firmy, zanim
                  uzyskasz dostęp do zleceń i funkcji aplikacji.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.08] px-5 py-5 text-center space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-4 py-2">
                <span className="relative flex h-2.5 w-2.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
                </span>
                <span className="text-sm font-semibold text-amber-200">Oczekuje na przypisanie</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-300">
                {displayName ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Konto</div>
                    <div className="mt-1 font-medium text-white">{displayName}</div>
                  </div>
                ) : null}
                {accountCreatedLabel ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Data utworzenia konta
                    </div>
                    <div className="mt-1 font-medium text-white">{accountCreatedLabel}</div>
                  </div>
                ) : null}
              </div>
            </div>

            {probableEmployerName ? (
              <div className="rounded-xl border border-blue-400/25 bg-blue-500/[0.08] px-4 py-3 text-sm text-blue-100">
                <span className="text-blue-300/80">Prawdopodobny pracodawca: </span>
                <span className="font-semibold text-white">{probableEmployerName}</span>
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Po przypisaniu otrzymasz dostęp do
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ACCESS_FEATURES.map((feature) => (
                  <li
                    key={feature.label}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 min-h-[44px]"
                  >
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-400/25 bg-blue-500/10 text-base shrink-0"
                      aria-hidden
                    >
                      {feature.icon}
                    </span>
                    <span className="text-sm font-medium text-slate-100">
                      <span className="text-blue-300 mr-1.5" aria-hidden>
                        ✓
                      </span>
                      {feature.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Gdy pracodawca doda Cię do firmy, system automatycznie przeniesie Cię do panelu.
              Status odświeża się co kilka sekund.
            </p>

            {msg ? (
              <div
                role="alert"
                className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
              >
                {msg}
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={handleRefresh}
                className={[
                  "flex-1 min-h-[48px] rounded-xl text-base font-semibold disabled:opacity-60 transition-colors",
                  accent.button,
                ].join(" ")}
              >
                {refreshing ? "Odświeżanie…" : "Odśwież status"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleLogout}
                className="flex-1 min-h-[48px] rounded-xl border border-white/15 bg-white/[0.06] text-base font-semibold text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-60"
              >
                {loggingOut ? "Wylogowywanie…" : "Wyloguj się"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <AuthBenefitsStrip />
    </div>
  );
}
