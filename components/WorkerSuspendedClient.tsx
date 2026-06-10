"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { ElektraLogo } from "@/components/auth/ElektraLogo";
import { SuspendedStatusIcon } from "@/components/auth/SuspendedStatusIcon";
import { getAuthAccent } from "@/components/auth/auth-accent";
import { apiFetch } from "@/lib/api";

const ACCESS_FEATURES = [
  { icon: "🧾", label: "Zlecenia", description: "Przeglądaj i realizuj zlecenia" },
  { icon: "📅", label: "Harmonogram", description: "Sprawdzaj grafiki i terminy" },
  { icon: "📷", label: "Zdjęcia", description: "Dodawaj zdjęcia z realizacji prac" },
  { icon: "📝", label: "Notatki", description: "Twórz notatki i raporty" },
  { icon: "📊", label: "Statusy prac", description: "Aktualizuj postęp" },
] as const;

type Props = {
  displayName?: string | null;
};

export default function WorkerSuspendedClient({ displayName }: Props) {
  const router = useRouter();
  const { logout } = useAuth();
  const accent = getAuthAccent("employer");

  const [msg, setMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const isMountedRef = useRef(false);
  const isCheckingRef = useRef(false);

  const checkAccess = useCallback(
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
          setMsg("Dostęp nadal wstrzymany. Skontaktuj się z pracodawcą, jeśli powinien zostać przywrócony.");
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
    void checkAccess(false);
    const interval = setInterval(() => {
      void checkAccess(false);
    }, 5000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [checkAccess]);

  async function handleRefresh() {
    setMsg(null);
    await checkAccess(true);
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

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sm:px-6">
        <ElektraLogo size="sm" />
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleLogout()}
          className="min-h-[44px] shrink-0 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-60"
        >
          {loggingOut ? "Wylogowywanie…" : "Wyloguj się"}
        </button>
      </header>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:py-6">
        <div
          className={[
            "w-full max-w-2xl rounded-2xl border bg-slate-950/50 backdrop-blur-xl",
            "shadow-[0_24px_64px_rgba(0,0,0,0.45)] landing-fade-up",
            accent.card,
          ].join(" ")}
        >
          <div className="px-6 sm:px-10 pb-8 sm:pb-10 pt-8 sm:pt-10 space-y-6">
            <div className="text-center space-y-4">
              <SuspendedStatusIcon />
              <div className="space-y-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                  Konto zostało
                  <br />
                  tymczasowo wyłączone
                </h1>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl mx-auto">
                  Twój dostęp do firmy został czasowo wstrzymany przez pracodawcę. Konto nadal
                  istnieje i nie zostanie usunięte.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.08] px-5 py-5 space-y-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Status</div>
              <div className="text-lg font-semibold text-amber-200">Dostęp wstrzymany</div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Po ponownej aktywacji przez pracodawcę dostęp wróci automatycznie.
              </p>
              {displayName ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Konto</div>
                  <div className="mt-1 font-medium text-white">{displayName}</div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Po aktywacji odzyskasz dostęp do:
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ACCESS_FEATURES.map((feature) => (
                  <li
                    key={feature.label}
                    className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 min-h-[44px]"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-400/25 bg-amber-500/10 text-base shrink-0 mt-0.5"
                        aria-hidden
                      >
                        {feature.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-100">{feature.label}</div>
                        <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                          {feature.description}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-slate-300 leading-relaxed">
              Twoje dane i historia pracy pozostają zachowane. Skontaktuj się z pracodawcą, jeśli
              dostęp powinien zostać przywrócony.
            </div>

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
                onClick={() => void handleRefresh()}
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
                onClick={() => void handleLogout()}
                className="flex-1 min-h-[48px] rounded-xl border border-white/15 bg-white/[0.06] text-base font-semibold text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-60"
              >
                {loggingOut ? "Wylogowywanie…" : "Wyloguj się"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
