"use client";

import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Job = any;

function assignedCount(job: any) {
  if (Array.isArray(job?.assignedToUids)) return job.assignedToUids.length;
  return job?.assignedTo ? 1 : 0;
}

export default function TodoPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const companyId = useActiveCompanyId();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 🔥 NOWE
  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // 🔥 BLOKADA
  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const me = await apiFetch("/api/me");
        setBillingStatus(me?.billingStatus ?? null);
        setSubscriptionEndsAt(me?.billing?.subscriptionEndsAt ?? null);

        const expired =
          me?.billingStatus === "inactive" ||
          (me?.billing?.subscriptionEndsAt &&
            new Date(me.billing.subscriptionEndsAt).getTime() < Date.now());

        if (me?.role === "employer" && expired) {
          router.replace("/settings?expired=1");
        }
      } catch {}
    })();
  }, [user, router]);

  async function load() {
    if (!companyId) return;
    setBusy(true);
    setErr(null);
    try {
      const data = await apiFetch(`/api/companies/${companyId}/jobs?todo=1&limit=50`);
      setJobs(data.jobs || []);
    } catch (e: any) {
      setErr(e?.message ?? "LOAD_ERROR");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (user && companyId) load();
  }, [user, companyId]);

  if (loading) return <div className="p-6">Ładowanie...</div>;
  if (!user) return null;

  if (!companyId) {
    return (
      <div className="p-6">
        Najpierw wybierz aktywną firmę w{" "}
        <Link className="underline" href="/dashboard">
          Dashboard
        </Link>.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Do zrobienia</h1>
        <button className="px-3 py-2 rounded border" disabled={busy} onClick={load}>
          Odśwież
        </button>
      </div>

      {err && (
        <div className="text-sm text-red-600 border border-red-200 bg-red-50 p-2 rounded">
          {err}
        </div>
      )}

      <div className="border rounded">
        {jobs.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">Brak jobów do zrobienia.</div>
        ) : (
          <div className="divide-y">
            {jobs.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className="block p-4 hover:bg-gray-50">
                <div className="font-semibold">
                  {j.customerName} • {j.customerPhone}
                </div>
                <div className="text-sm text-gray-600">
                  {j.addressCity}, {j.addressStreet} • {j.description}
                </div>
                <div className="text-sm">
                  Status: <b>{j.status}</b>
                </div>
                <div className="text-sm text-gray-600">
                  Przypisani: <b>{assignedCount(j)}</b>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}