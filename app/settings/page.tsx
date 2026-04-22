"use client";

import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type BillingStatus = "active" | "inactive" | "cancelled" | null;

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");

  const [role, setRole] = useState<"worker" | "employer" | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(null);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);

  const [cancelSubOpen, setCancelSubOpen] = useState(false);
  const [cancelSubBusy, setCancelSubBusy] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const subscriptionExpired = useMemo(() => {
    if (!subscriptionEndsAt) return billingStatus === "inactive";
    return new Date(subscriptionEndsAt).getTime() < Date.now();
  }, [billingStatus, subscriptionEndsAt]);

  const formattedEndsAt = useMemo(() => {
    if (!subscriptionEndsAt) return null;
    const d = new Date(subscriptionEndsAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("pl-PL");
  }, [subscriptionEndsAt]);

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
    setSubscriptionEndsAt(me?.billing?.subscriptionEndsAt ?? null);
    setCancelAtPeriodEnd(Boolean(me?.billing?.cancelAtPeriodEnd ?? false));
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
          setMsg("Subskrypcja wygasła. Odnów ją, aby odblokować dostęp do panelu głównego, zleceń i listy zadań.");
        } else if (checkout === "success") {
          setMsg("Subskrypcja została opłacona.");
        } else if (checkout === "cancel") {
          setMsg("Anulowano przejście do płatności.");
        }
      } catch (e: any) {
        setErr(e?.message ?? "LOAD_ERROR");
      } finally {
        setLoadingData(false);
      }
    })();
  }, [user, searchParams]);

  async function saveDisplayName() {
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

      setMsg("Nazwa użytkownika została zapisana.");
      router.refresh();
    } catch (e: any) {
      const m = e?.message ?? "SAVE_ERROR";
      setErr(m === "NAME_REQUIRED" ? "Podaj imię i nazwisko." : m);
    } finally {
      setBusy(false);
    }
  }

  async function renewSubscription() {
    if (!user) return;

    setBusy(true);
    setErr(null);
    setMsg(null);

    try {
      const data = await apiFetch("/api/stripe/checkout", {
        method: "POST",
      });

      if (!data?.url) {
        throw new Error("NO_CHECKOUT_URL");
      }

      window.location.href = data.url;
    } catch (e: any) {
      setErr(e?.message ?? "RENEW_ERROR");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSubscription() {
    if (!user || !user.email) return;

    if (!passwordConfirm.trim()) {
      setErr("Podaj hasło.");
      return;
    }

    setCancelSubBusy(true);
    setErr(null);
    setMsg(null);

    try {
      console.log("TODO AUTH");

      await apiFetch("/api/stripe/cancel", {
        method: "POST",
      });

      setCancelSubOpen(false);
      setPasswordConfirm("");
      await loadMe();

      setMsg("Subskrypcja została anulowana i będzie działać do końca obecnego okresu rozliczeniowego.");
    } catch (e: any) {
      const message = e?.message ?? "CANCEL_ERROR";

      if (
        message.includes("auth/invalid-credential") ||
        message.includes("auth/wrong-password") ||
        message.includes("auth/invalid-login-credentials")
      ) {
        setErr("Nieprawidłowe hasło.");
      } else {
        setErr(message);
      }
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
      router.replace("/login");
    } catch (e: any) {
      setErr(e?.message ?? "DELETE_ERROR");
    } finally {
      setDeleteBusy(false);
      setDeleteOpen(false);
      setDeleteConfirm("");
    }
  }

  if (loading || loadingData) return <div className="p-6">Ładowanie...</div>;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-3xl mx-auto space-y-8">

        <div>
          <h1 className="text-3xl font-semibold text-gray-900">
            Ustawienia
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Zarządzaj swoim kontem
          </p>
        </div>

        {err && (
          <div className="text-sm text-red-700 border border-red-200 bg-red-50 p-4 rounded-xl">
            {err}
          </div>
        )}

        {msg && (
          <div className="text-sm text-green-800 border border-green-200 bg-green-50 p-4 rounded-xl">
            {msg}
          </div>
        )}

        {role === "employer" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Subskrypcja
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Zarządzaj swoim planem i dostępem do funkcji
                </p>
              </div>

              <span
                className={`inline-block text-xs px-3 py-1 rounded-full ${
                  billingStatus === "active"
                    ? "bg-green-100 text-green-700"
                    : billingStatus === "cancelled"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {billingStatus === "active"
                  ? "Aktywna"
                  : billingStatus === "cancelled"
                  ? "Anulowana"
                  : "Nieaktywna"}
              </span>
            </div>

            {formattedEndsAt && (
              <div className="text-sm text-gray-700">
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
            )}

            {subscriptionExpired || billingStatus === "inactive" ? (
              <div className="flex justify-end">
                <button
                  onClick={renewSubscription}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50 transition"
                >
                  {busy ? "Przekierowanie..." : "Odnów subskrypcję"}
                </button>
              </div>
            ) : (
              <div className="flex justify-end">
                <button
                  onClick={() => setCancelSubOpen(true)}
                  disabled={busy || cancelAtPeriodEnd || billingStatus === "cancelled"}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition"
                >
                  {cancelAtPeriodEnd || billingStatus === "cancelled"
                    ? "Subskrypcja już anulowana"
                    : "Anuluj subskrypcję"}
                </button>
              </div>
            )}
          </div>
        )}









{role !== "worker" && (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
    <div>
      <h2 className="text-lg font-semibold text-gray-900">
        Nazwa użytkownika
      </h2>
      <p className="text-sm text-gray-500 mt-1">
        Ta nazwa będzie widoczna zamiast adresu e-mail
      </p>
    </div>

    <input
      className="w-full border border-gray-200 rounded-lg px-3 py-2"
      value={displayName}
      onChange={(e) => setDisplayName(e.target.value)}
    />

    <div className="flex justify-end">
      <button
        onClick={saveDisplayName}
        disabled={busy}
        className="px-4 py-2 rounded-lg border border-black text-black hover:bg-black hover:text-white transition disabled:opacity-50"
      >
        {busy ? "Zapisywanie..." : "Zapisz"}
      </button>
    </div>
  </div>
)}







        {role === "employer" && (
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-red-700">
                Niebezpieczna strefa
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Usunięcie konta jest nieodwracalne
              </p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setDeleteOpen(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Usuń konto
              </button>
            </div>
          </div>
        )}

        {cancelSubOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-white rounded-2xl p-6 space-y-5 shadow-lg">
              <h3 className="text-lg font-semibold text-gray-900">
                Anulować subskrypcję?
              </h3>

              <p className="text-sm text-gray-600">
                Podaj hasło, aby potwierdzić anulowanie. Subskrypcja będzie działać do końca obecnego okresu rozliczeniowego.
              </p>

              <input
                type="password"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
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
                  className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Anuluj
                </button>

                <button
                  onClick={cancelSubscription}
                  disabled={cancelSubBusy || passwordConfirm.trim().length === 0}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelSubBusy ? "Anulowanie..." : "Potwierdź anulowanie"}
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-white rounded-2xl p-6 space-y-5 shadow-lg">
              <h3 className="text-lg font-semibold text-gray-900">
                Czy na pewno chcesz usunąć konto?
              </h3>

              <p className="text-sm text-gray-600">
                Ta operacja jest nieodwracalna. Wpisz <b>USUŃ</b>, aby potwierdzić.
              </p>

              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
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
                  className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Anuluj
                </button>

                <button
                  onClick={deleteAccount}
                  disabled={deleteBusy || deleteConfirm !== "USUŃ"}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteBusy ? "Usuwanie..." : "Usuń konto"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
      );
}