"use client";

import { useAuth } from "@/components/AuthProvider";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ThemeSelector } from "@/components/settings/ThemeSelector";
import { apiFetch } from "@/lib/api";
import { PRICING_SUMMARY_LINES } from "@/lib/billing/pricing-ui-copy";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type BillingStatus = "active" | "inactive" | "cancelled" | null;

export default function SettingsPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"worker" | "employer" | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(null);
  const [billingAllowsAccess, setBillingAllowsAccess] = useState(false);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [sessionsBusy, setSessionsBusy] = useState(false);

  const [cancelSubOpen, setCancelSubOpen] = useState(false);
  const [cancelSubBusy, setCancelSubBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const subscriptionExpired = useMemo(() => !billingAllowsAccess, [billingAllowsAccess]);

  const formattedEndsAt = useMemo(() => {
    if (!subscriptionEndsAt) return null;
    const d = new Date(subscriptionEndsAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("pl-PL");
  }, [subscriptionEndsAt]);

  const billingBadge = useMemo(() => {
    if (billingStatus === "active") {
      return (
        <span className="inline-block text-xs px-3 py-1 rounded-full bg-success-bg text-success border border-success-border">
          Aktywna
        </span>
      );
    }
    if (billingStatus === "cancelled") {
      return (
        <span className="inline-block text-xs px-3 py-1 rounded-full bg-warning-bg text-warning border border-warning-border">
          Anulowana
        </span>
      );
    }
    return (
      <span className="inline-block text-xs px-3 py-1 rounded-full bg-danger-bg text-danger border border-danger-border">
        Nieaktywna
      </span>
    );
  }, [billingStatus]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  async function loadMe() {
    const me = await apiFetch("/api/me");

    setDisplayName(String(me?.displayName ?? ""));
    setRole(me?.role ?? null);
    setBillingStatus((me?.billingStatus ?? null) as BillingStatus);
    setBillingAllowsAccess(Boolean(me?.billingAllowsAccess ?? false));
    setSubscriptionEndsAt(me?.billing?.subscriptionEndsAt ?? null);
    setCancelAtPeriodEnd(Boolean(me?.billing?.cancelAtPeriodEnd ?? false));
    setHasStripeCustomer(Boolean(me?.billing?.hasStripeCustomer ?? false));
  }

  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        setErr(null);
        setLoadingData(true);
        await loadMe();

        const expired = searchParams.get("expired");
        const checkout = searchParams.get("checkout");

        if (expired === "1") {
          setMsg(
            "Subskrypcja wygasła. Odnów ją, aby odblokować dostęp do panelu głównego, zleceń i listy zadań."
          );
        } else if (checkout === "success") {
          setMsg("Subskrypcja została opłacona.");
        } else if (checkout === "cancel") {
          setMsg("Anulowano przejście do płatności.");
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "LOAD_ERROR";
        setErr(message);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [user, searchParams]);

  async function saveAccount() {
    setBusy(true);
    setErr(null);
    setMsg(null);

    try {
      const value = displayName.trim();
      if (!value) throw new Error("NAME_REQUIRED");

      await apiFetch("/api/me/display-name", {
        method: "PATCH",
        body: JSON.stringify({ displayName: value }),
      });

      setMsg("Dane konta zostały zapisane.");
      router.refresh();
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "SAVE_ERROR";
      setErr(m === "NAME_REQUIRED" ? "Podaj imię i nazwisko." : m);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setPasswordBusy(true);
    setErr(null);
    setMsg(null);

    try {
      if (!currentPassword || !newPassword) {
        throw new Error("MISSING_FIELDS");
      }
      if (newPassword.length < 8) {
        throw new Error("PASSWORD_TOO_SHORT");
      }
      if (newPassword !== confirmPassword) {
        throw new Error("PASSWORD_MISMATCH");
      }

      await apiFetch("/api/me/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMsg("Hasło zostało zmienione.");
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "PASSWORD_ERROR";
      if (m === "INVALID_PASSWORD") {
        setErr("Nieprawidłowe obecne hasło.");
      } else if (m === "PASSWORD_TOO_SHORT") {
        setErr("Nowe hasło musi mieć co najmniej 8 znaków.");
      } else if (m === "PASSWORD_MISMATCH") {
        setErr("Nowe hasła nie są identyczne.");
      } else if (m === "MISSING_FIELDS") {
        setErr("Wypełnij wszystkie pola hasła.");
      } else {
        setErr(m);
      }
    } finally {
      setPasswordBusy(false);
    }
  }

  async function logoutAllSessions() {
    setSessionsBusy(true);
    setErr(null);
    setMsg(null);

    try {
      await apiFetch("/api/me/sessions", { method: "POST" });
      setMsg("Wylogowano wszystkie inne sesje. Bieżąca sesja pozostaje aktywna.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "SESSIONS_ERROR";
      setErr(message);
    } finally {
      setSessionsBusy(false);
    }
  }

  async function openBillingPortal() {
    setPortalBusy(true);
    setErr(null);
    setMsg(null);

    try {
      const data = await apiFetch("/api/stripe/portal", { method: "POST" });
      if (!data?.url) throw new Error("NO_PORTAL_URL");
      window.location.href = data.url;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "PORTAL_ERROR";
      setErr(message);
    } finally {
      setPortalBusy(false);
    }
  }

  async function resumeSubscription() {
    setResumeBusy(true);
    setErr(null);
    setMsg(null);

    try {
      await apiFetch("/api/stripe/resume", { method: "POST" });
      await loadMe();
      setMsg("Subskrypcja została wznowiona.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "RESUME_ERROR";
      setErr(message);
    } finally {
      setResumeBusy(false);
    }
  }

  async function renewSubscription() {
    if (!user) return;

    setBusy(true);
    setErr(null);
    setMsg(null);

    try {
      const data = await apiFetch("/api/stripe/checkout", { method: "POST" });
      if (!data?.url) throw new Error("NO_CHECKOUT_URL");
      window.location.href = data.url;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "RENEW_ERROR";
      setErr(message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelSubscription() {
    if (!user?.email) return;

    if (!passwordConfirm.trim()) {
      setErr("Podaj hasło.");
      return;
    }

    setCancelSubBusy(true);
    setErr(null);
    setMsg(null);

    try {
      await apiFetch("/api/stripe/cancel", { method: "POST" });
      setCancelSubOpen(false);
      setPasswordConfirm("");
      await loadMe();
      setMsg(
        "Subskrypcja została anulowana i będzie działać do końca obecnego okresu rozliczeniowego."
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "CANCEL_ERROR";
      setErr(message);
    } finally {
      setCancelSubBusy(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== "USUŃ") {
      setErr("Aby usunąć konto wpisz dokładnie: USUŃ");
      return;
    }

    setDeleteBusy(true);
    setErr(null);

    try {
      await apiFetch("/api/me", { method: "DELETE" });
      await logout();
      router.replace("/login");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "DELETE_ERROR";
      setErr(message);
    } finally {
      setDeleteBusy(false);
      setDeleteOpen(false);
      setDeleteConfirm("");
    }
  }

  if (loading || loadingData) {
    return (
      <div className="p-6 text-text-muted">Ładowanie...</div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-text">Ustawienia</h1>
          <p className="text-sm text-text-muted mt-1">
            Zarządzaj kontem, wyglądem i bezpieczeństwem
          </p>
        </div>

        {err ? (
          <div className="text-sm text-danger border border-danger-border bg-danger-bg p-4 rounded-xl">
            {err}
          </div>
        ) : null}

        {msg ? (
          <div className="text-sm text-success border border-success-border bg-success-bg p-4 rounded-xl">
            {msg}
          </div>
        ) : null}

        <SettingsSection
          title="Konto"
          description="Dane logowania i nazwa wyświetlana w aplikacji"
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm text-text-muted block mb-1">
                Nazwa użytkownika
              </label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Imię i nazwisko"
              />
            </div>

            <div>
              <label className="text-sm text-text-muted block mb-1">E-mail</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 bg-bg-secondary text-text-muted"
                value={user?.email ?? ""}
                readOnly
                disabled
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => void saveAccount()}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 disabled:opacity-50 transition"
              >
                {busy ? "Zapisywanie..." : "Zapisz"}
              </button>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Wygląd"
          description="Wybierz motyw interfejsu — ustawienie dotyczy tylko Twojego konta"
        >
          <ThemeSelector />
        </SettingsSection>

        {role === "employer" ? (
          <SettingsSection
            title="Subskrypcja"
            description="Zarządzaj planem i dostępem do funkcji"
            badge={billingBadge}
          >
            <ul className="text-sm text-text list-disc list-inside space-y-1 mb-4">
              {PRICING_SUMMARY_LINES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            {formattedEndsAt ? (
              <div className="text-sm text-text">
                {subscriptionExpired ? (
                  <>
                    Subskrypcja wygasła dnia: <b>{formattedEndsAt}</b>
                  </>
                ) : cancelAtPeriodEnd || billingStatus === "cancelled" ? (
                  <>
                    Subskrypcja działa do: <b>{formattedEndsAt}</b>
                  </>
                ) : (
                  <>
                    Kolejny okres rozliczeniowy do: <b>{formattedEndsAt}</b>
                  </>
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              {hasStripeCustomer ? (
                <button
                  onClick={() => void openBillingPortal()}
                  disabled={portalBusy || busy || resumeBusy}
                  className="px-4 py-2 rounded-lg border border-primary text-primary hover:bg-primary hover:text-primary-fg transition disabled:opacity-50"
                >
                  {portalBusy ? "Przekierowanie..." : "Zarządzaj płatnościami"}
                </button>
              ) : null}
              {cancelAtPeriodEnd && !subscriptionExpired ? (
                <button
                  onClick={() => void resumeSubscription()}
                  disabled={resumeBusy || busy || portalBusy}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 disabled:opacity-50 transition"
                >
                  {resumeBusy ? "Wznawianie..." : "Wznów subskrypcję"}
                </button>
              ) : null}
              {subscriptionExpired ? (
                <button
                  onClick={() => void renewSubscription()}
                  disabled={busy || portalBusy || resumeBusy}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 disabled:opacity-50 transition"
                >
                  {busy ? "Przekierowanie..." : "Zarządzaj subskrypcją"}
                </button>
              ) : !cancelAtPeriodEnd && billingStatus !== "cancelled" ? (
                <button
                  onClick={() => setCancelSubOpen(true)}
                  disabled={busy || portalBusy || resumeBusy}
                  className="px-4 py-2 rounded-lg bg-danger text-white hover:opacity-90 disabled:opacity-50 transition"
                >
                  Anuluj subskrypcję
                </button>
              ) : null}
            </div>
          </SettingsSection>
        ) : null}

        <SettingsSection
          title="Bezpieczeństwo"
          description="Zmiana hasła i zarządzanie aktywnymi sesjami"
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-1">
              <input
                type="password"
                className="w-full border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Obecne hasło"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <input
                type="password"
                className="w-full border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Nowe hasło (min. 8 znaków)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <input
                type="password"
                className="w-full border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Powtórz nowe hasło"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
              <button
                onClick={() => void changePassword()}
                disabled={passwordBusy}
                className="px-4 py-2 rounded-lg border border-primary text-primary hover:bg-primary hover:text-primary-fg transition disabled:opacity-50"
              >
                {passwordBusy ? "Zapisywanie..." : "Zmień hasło"}
              </button>

              <button
                onClick={() => void logoutAllSessions()}
                disabled={sessionsBusy}
                className="px-4 py-2 rounded-lg border border-border text-text hover:bg-card-hover transition disabled:opacity-50"
              >
                {sessionsBusy ? "Wylogowywanie..." : "Wyloguj wszystkie sesje"}
              </button>
            </div>
          </div>
        </SettingsSection>

        {role === "employer" ? (
          <SettingsSection
            title="Strefa zagrożenia"
            description="Usunięcie konta jest nieodwracalne"
            variant="danger"
          >
            <div className="flex justify-end">
              <button
                onClick={() => setDeleteOpen(true)}
                className="px-4 py-2 bg-danger text-white rounded-lg hover:opacity-90 transition"
              >
                Usuń konto
              </button>
            </div>
          </SettingsSection>
        ) : null}

        {cancelSubOpen ? (
          <div className="fixed inset-0 bg-overlay flex items-center justify-center p-6 z-50">
            <div className="w-full max-w-md theme-glass bg-card rounded-2xl p-6 space-y-5 border border-border shadow-lg">
              <h3 className="text-lg font-semibold text-text">
                Anulować subskrypcję?
              </h3>
              <p className="text-sm text-text-muted">
                Podaj hasło, aby potwierdzić anulowanie. Subskrypcja będzie działać do
                końca obecnego okresu rozliczeniowego.
              </p>
              <input
                type="password"
                className="w-full border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-danger"
                placeholder="Hasło"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setCancelSubOpen(false);
                    setPasswordConfirm("");
                  }}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-card-hover text-text"
                >
                  Anuluj
                </button>
                <button
                  onClick={() => void cancelSubscription()}
                  disabled={cancelSubBusy || passwordConfirm.trim().length === 0}
                  className="px-4 py-2 bg-danger text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {cancelSubBusy ? "Anulowanie..." : "Potwierdź anulowanie"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {deleteOpen ? (
          <div className="fixed inset-0 bg-overlay flex items-center justify-center p-6 z-50">
            <div className="w-full max-w-md theme-glass bg-card rounded-2xl p-6 space-y-5 border border-border shadow-lg">
              <h3 className="text-lg font-semibold text-text">
                Czy na pewno chcesz usunąć konto?
              </h3>
              <p className="text-sm text-text-muted">
                Ta operacja jest nieodwracalna. Wpisz <b>USUŃ</b>, aby potwierdzić.
              </p>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-danger"
                placeholder="USUŃ"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteConfirm("");
                  }}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-card-hover text-text"
                >
                  Anuluj
                </button>
                <button
                  onClick={() => void deleteAccount()}
                  disabled={deleteBusy || deleteConfirm !== "USUŃ"}
                  className="px-4 py-2 bg-danger text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {deleteBusy ? "Usuwanie..." : "Usuń konto"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
