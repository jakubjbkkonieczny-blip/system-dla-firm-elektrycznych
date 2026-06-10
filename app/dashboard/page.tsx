"use client";

import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import {
  setActiveCompanyIdInStorage,
  useActiveCompanyId,
} from "@/lib/useActiveCompany";
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
  const activeCompanyId = useActiveCompanyId();

  const [canCreateCompany, setCanCreateCompany] = useState<boolean>(true);

  const [meRole, setMeRole] = useState<MeRole>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(null);
  const [billingAllowsAccess, setBillingAllowsAccess] = useState(false);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string | null>(null);

  const [bootLoaded, setBootLoaded] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  async function loadMe() {
    const data = await apiFetch("/api/me");
    setCanCreateCompany(Boolean(data?.canCreateCompany ?? true));
    setMeRole((data?.role ?? null) as MeRole);
    setBillingStatus((data?.billingStatus ?? null) as BillingStatus);
    setBillingAllowsAccess(Boolean(data?.billingAllowsAccess ?? false));
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

    if (meRole === "employer" && !billingAllowsAccess) {
      router.replace("/settings?expired=1");
    }
  }, [user, bootLoaded, meRole, billingAllowsAccess, router]);

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
    billingAllowsAccess &&
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

      setActiveCompanyIdInStorage(companyId);
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
    setActiveCompanyIdInStorage(id);
    router.refresh();
  }

  if (loading) return <div className="text-text-muted">Ładowanie...</div>;
  if (!user) return null;

  return (
    <div className="w-full max-w-full min-w-0">
      <div className="max-w-5xl mx-auto space-y-5 sm:space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-text">Panel główny</h1>
          <p className="text-sm text-text-muted mt-1">
            Zalogowany: <b className="text-text">{user.email}</b>
          </p>
        </div>

        {err && (
          <div className="text-sm text-danger border border-danger-border bg-danger-bg p-4 rounded-xl">
            {err}
          </div>
        )}

        <div className="theme-glass bg-card rounded-2xl border border-border p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm text-text-muted">Typ konta</div>
            <div className="font-medium text-text">{meRole ?? "..."}</div>
          </div>

          {meRole === "employer" && (
            <div>
              <div className="text-sm text-text-muted">Subskrypcja</div>
              <span
                className={`inline-block mt-1 text-xs px-3 py-1 rounded-full border ${
                  billingStatus === "active"
                    ? "bg-success-bg text-success border-success-border"
                    : billingStatus === "cancelled"
                      ? "bg-warning-bg text-warning border-warning-border"
                      : "bg-danger-bg text-danger border-danger-border"
                }`}
              >
                {billingStatus ?? "..."}
              </span>
            </div>
          )}
        </div>

        <div className="theme-glass bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-text">Firmy</h2>

            <button
              type="button"
              className="min-h-[44px] border border-border rounded-lg px-4 py-2 text-sm bg-card text-text hover:bg-card-hover transition disabled:opacity-50"
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
                <label className="text-sm text-text-muted">Wybierz aktywną firmę</label>

                <select
                  className="mt-1 w-full min-h-[44px] border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
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
                <div className="flex items-center justify-between bg-bg-secondary rounded-xl p-4 border border-border">
                  <div className="min-w-0">
                    <div className="text-sm text-text-muted">Aktywna firma</div>
                    <div className="font-medium text-text truncate">{activeCompany.name}</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-text-muted">
              {meRole === "worker"
                ? "Nie masz jeszcze przypisanej firmy."
                : "Nie masz jeszcze firmy. Utwórz pierwszą poniżej."}
            </div>
          )}

          {showCreateCompany && (
            <div className="border-t border-border pt-5 space-y-3">
              <h3 className="font-semibold text-text">Utwórz firmę</h3>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className="flex-1 min-h-[44px] border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="Nazwa firmy"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                />

                <button
                  type="button"
                  className="min-h-[48px] px-5 py-2 rounded-xl bg-primary text-primary-fg font-medium hover:opacity-90 disabled:opacity-50 transition"
                  disabled={busy || newCompanyName.trim().length === 0}
                  onClick={createCompany}
                >
                  {busy ? "..." : "Utwórz"}
                </button>
              </div>

              <div className="text-xs text-text-muted">Możesz utworzyć tylko jedną firmę.</div>
            </div>
          )}

          {meRole === "employer" && companies.length > 0 && (
            <div className="border-t border-border pt-4 text-sm text-text-muted">
              Masz już utworzoną firmę. System pozwala tylko na jedną firmę.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
