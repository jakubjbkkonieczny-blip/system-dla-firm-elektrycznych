"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AuthBackground } from "@/components/auth/AuthBackground";
import { AuthBenefitsStrip } from "@/components/auth/AuthBenefitsStrip";
import { ElektraLogo } from "@/components/auth/ElektraLogo";
import { getAuthAccent } from "@/components/auth/auth-accent";
import { apiFetch } from "@/lib/api";
import { PRICING_SUMMARY_LINES } from "@/lib/billing/pricing-ui-copy";

type BillingStatus = "active" | "inactive" | "cancelled" | "past_due" | "trialing" | null;

const DEV_BYPASS_UI_ENABLED =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_ENABLE_DEV_BILLING_BYPASS === "true";

function billingStatusLabel(status: BillingStatus): string {
  switch (status) {
    case "active":
      return "Aktywna";
    case "trialing":
      return "Okres próbny";
    case "cancelled":
      return "Anulowana";
    case "past_due":
      return "Zaległa płatność";
    case "inactive":
      return "Nieaktywna";
    default:
      return "Brak subskrypcji";
  }
}

function mapCheckoutError(raw: string): string {
  switch (raw) {
    case "SUBSCRIPTION_ALREADY_ACTIVE":
      return "Masz już aktywną subskrypcję.";
    case "FORBIDDEN":
      return "Brak uprawnień do płatności.";
    case "NO_CHECKOUT_URL":
      return "Nie udało się utworzyć sesji płatności. Spróbuj ponownie.";
    default:
      return raw;
  }
}

export default function SubskrypcjaPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const accent = getAuthAccent("employer");

  const [busy, setBusy] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(null);

  const statusBadgeClass = useMemo(() => {
    if (billingStatus === "active" || billingStatus === "trialing") {
      return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
    }
    if (billingStatus === "cancelled") {
      return "border-amber-400/40 bg-amber-500/15 text-amber-200";
    }
    return "border-amber-400/40 bg-amber-500/15 text-amber-200";
  }, [billingStatus]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const me = await apiFetch("/api/me");
        setBillingStatus((me?.billingStatus ?? null) as BillingStatus);

        if (me?.role === "worker") {
          router.replace("/dashboard");
          return;
        }

        if (me?.billingAllowsAccess) {
          router.replace("/dashboard");
        }
      } catch {
        /* keep page visible */
      }
    })();
  }, [user, router]);

  async function handleCheckout() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const data = await apiFetch("/api/stripe/checkout", { method: "POST" });
      if (!data?.url) throw new Error("NO_CHECKOUT_URL");
      window.location.href = data.url;
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Błąd płatności.";
      setError(mapCheckoutError(raw));
    } finally {
      setBusy(false);
    }
  }

  async function handleDevActivate() {
    setDevBusy(true);
    setError(null);
    setMsg(null);
    try {
      await apiFetch("/api/dev/activate-billing", { method: "POST" });
      router.replace("/dashboard");
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "DEV_ACTIVATE_ERROR";
      setError(mapCheckoutError(raw === "NOT_AVAILABLE" ? "Dev bypass niedostępny." : raw));
    } finally {
      setDevBusy(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/login?type=employer");
    } finally {
      setLoggingOut(false);
    }
  }

  const actionBusy = busy || devBusy || loggingOut;

  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#070d18] text-slate-100 flex items-center justify-center">
        <AuthBackground />
        <p className="relative z-10 text-slate-400">Ładowanie…</p>
      </div>
    );
  }

  if (!user) return null;

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
            <ElektraLogo />
          </div>

          <div className="px-6 sm:px-10 pb-8 sm:pb-10 space-y-6">
            <div className="text-center space-y-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Aktywacja konta pracodawcy
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl mx-auto">
                Aby korzystać z systemu, aktywuj subskrypcję. Bez aktywnej płatności nie
                możesz przejść dalej.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.08] px-5 py-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Status subskrypcji
                </div>
                <span
                  className={[
                    "inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold",
                    statusBadgeClass,
                  ].join(" ")}
                >
                  {billingStatusLabel(billingStatus)}
                </span>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
                  Cennik
                </h2>
                <ul className="space-y-2 text-sm text-slate-200">
                  {PRICING_SUMMARY_LINES.map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <span className="text-amber-300 shrink-0 mt-0.5" aria-hidden>
                        ✓
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
              >
                {error}
              </div>
            ) : null}

            {msg ? (
              <div
                role="status"
                className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
              >
                {msg}
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleCheckout()}
                className={[
                  "flex-1 min-h-[48px] rounded-xl text-base font-semibold disabled:opacity-60 transition-colors",
                  accent.button,
                ].join(" ")}
              >
                {busy ? "Przekierowuję…" : "Przejdź do płatności"}
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleLogout()}
                className="flex-1 min-h-[48px] rounded-xl border border-white/15 bg-white/[0.06] text-base font-semibold text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-60"
              >
                {loggingOut ? "Wylogowywanie…" : "Wyloguj się"}
              </button>
            </div>

            {DEV_BYPASS_UI_ENABLED ? (
              <div className="pt-2 border-t border-white/10">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleDevActivate()}
                  className="w-full min-h-[40px] rounded-lg border border-dashed border-white/20 bg-white/[0.03] text-xs font-medium text-slate-400 hover:text-slate-200 hover:border-white/30 transition-colors disabled:opacity-60"
                >
                  {devBusy ? "Aktywowanie…" : "Dev: aktywuj lokalnie"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <AuthBenefitsStrip />
    </div>
  );
}
