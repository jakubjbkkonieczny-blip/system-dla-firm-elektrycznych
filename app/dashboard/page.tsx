"use client";

import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Company = { id: string; name: string };

type MeRole = "worker" | "employer" | null;
type BillingStatus = "active" | "inactive" | "cancelled" | null;

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [newCompanyName, setNewCompanyName] = useState("");
  const [activeCompanyId, setActiveCompanyId] = useState<string>("");

  

  const [canCreateCompany, setCanCreateCompany] = useState<boolean>(true);

  const [meRole, setMeRole] = useState<MeRole>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(null);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string | null>(null);

  const [bootLoaded, setBootLoaded] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem("activeCompanyId") || "";
    setActiveCompanyId(saved);
  }, [user]);

  async function loadMe() {
    const data = await apiFetch("/api/me");
    setCanCreateCompany(Boolean(data?.canCreateCompany ?? true));
    setMeRole((data?.role ?? null) as MeRole);
    setBillingStatus((data?.billingStatus ?? null) as BillingStatus);
    setSubscriptionEndsAt(data?.billing?.subscriptionEndsAt ?? null);
  }

  async function loadCompanies() {
    const data = await apiFetch("/api/me/companies");
    setCompanies(Array.isArray(data?.companies) ? data.companies : []);
  }

  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        setErr(null);
        setBusy(true);
        setBootLoaded(false);

        await loadMe();
        await loadCompanies();
      } catch (e: any) {
        setErr(e?.message ?? "LOAD_ERROR");
      } finally {
        setBusy(false);
        setBootLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user || !bootLoaded) return;

    const expired =
      billingStatus === "inactive" ||
      (subscriptionEndsAt ? new Date(subscriptionEndsAt).getTime() < Date.now() : false);

    if (meRole === "employer" && expired) {
      router.replace("/settings?expired=1");
    }
  }, [user, bootLoaded, meRole, billingStatus, subscriptionEndsAt, router]);

  useEffect(() => {
    if (!user || !bootLoaded) return;

    if (meRole === "worker" && companies.length === 0) {
      router.replace("/oczekiwanie");
    }
  }, [user, bootLoaded, meRole, companies, router]);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) || null,
    [companies, activeCompanyId]
  );

  const showCreateCompany =
    meRole === "employer" &&
    billingStatus === "active" &&
    canCreateCompany &&
    companies.length === 0;

  async function createCompany() {
    setErr(null);
    setBusy(true);

    try {
      const name = newCompanyName.trim();
      if (!name) throw new Error("NAME_REQUIRED");

      const data = await apiFetch("/api/company/create", {
        method: "POST",
        body: JSON.stringify({ name }),
      });

      const companyId = data.companyId as string;

      localStorage.setItem("activeCompanyId", companyId);
      setActiveCompanyId(companyId);
      setNewCompanyName("");

      await loadCompanies();
      await loadMe();
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "CREATE_ERROR");
    } finally {
      setBusy(false);
    }
  }

  function onSelectCompany(id: string) {
    setActiveCompanyId(id);
    localStorage.setItem("activeCompanyId", id);
    router.refresh();
  }

  
  

  if (loading) return <div className="p-6">Ładowanie...</div>;
  if (!user) return null;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-8">

        <div>
          <h1 className="text-3xl font-semibold text-gray-900">
            Panel główny
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Zalogowany: <b>{user.email}</b>
          </p>
        </div>

        {err && (
          <div className="text-sm text-red-700 border border-red-200 bg-red-50 p-4 rounded-xl">
            {err}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Typ konta</div>
            <div className="font-medium text-gray-900">
              {meRole ?? "..."}
            </div>
          </div>

          {meRole === "employer" && (
            <div>
              <div className="text-sm text-gray-500">Subskrypcja</div>
              <span
                className={`inline-block mt-1 text-xs px-3 py-1 rounded-full ${
                  billingStatus === "active"
                    ? "bg-green-100 text-green-700"
                    : billingStatus === "cancelled"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {billingStatus ?? "..."}
              </span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Firmy
            </h2>

            <button
              className="border border-gray-200 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition"
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  await loadMe();
                  await loadCompanies();
                  router.refresh();
                } catch (e: any) {
                  setErr(e?.message ?? "REFRESH_ERROR");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              Odśwież
            </button>
          </div>

          {companies.length > 0 ? (
            <div className="space-y-5">
              <div>
                <label className="text-sm text-gray-500">
                  Wybierz aktywną firmę
                </label>

                <select
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  value={activeCompanyId}
                  onChange={(e) => onSelectCompany(e.target.value)}
                >
                  <option value="">-- wybierz firmę --</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {activeCompany && (
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
                  <div>
                    <div className="text-sm text-gray-500">Aktywna firma</div>
                    <div className="font-medium text-gray-900">
                      {activeCompany.name}
                    </div>
                  </div>

                 
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              {meRole === "worker"
                ? "Nie masz jeszcze przypisanej firmy."
                : "Nie masz jeszcze firmy. Utwórz pierwszą poniżej."}
            </div>
          )}

          {showCreateCompany && (
            <div className="border-t pt-5 space-y-3">
              <h3 className="font-semibold text-gray-900">
                Utwórz firmę
              </h3>

              <div className="flex gap-2">
                <input
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Nazwa firmy"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                />

                <button
                  className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50 transition"
                  disabled={busy || newCompanyName.trim().length === 0}
                  onClick={createCompany}
                >
                  {busy ? "..." : "Utwórz"}
                </button>
              </div>

              <div className="text-xs text-gray-400">
                Możesz utworzyć tylko jedną firmę.
              </div>
            </div>
          )}

          {meRole === "employer" && companies.length > 0 && (
            <div className="border-t pt-4 text-sm text-gray-400">
              Masz już utworzoną firmę. System pozwala tylko na jedną firmę.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
