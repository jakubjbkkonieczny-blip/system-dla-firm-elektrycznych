"use client";

import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Job = any;
type Role = "owner" | "admin" | "staff";

type MeResponse = {
  role?: Role;
  active?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  new: "Nowe",
  scheduled: "Zaplanowane",
  in_progress: "W trakcie",
  done: "Zakończone",
  cancelled: "Anulowane",
};

function getStatusLabel(status: string) {
  return STATUS_LABELS[status] || status;
}

function assignedCount(job: any) {
  if (Array.isArray(job?.assignedToUids)) return job.assignedToUids.length;
  return job?.assignedTo ? 1 : 0;
}

function formatTimeAgo(dateValue?: any) {
  if (!dateValue) return null;

  let date: Date | null = null;

  // Handle Firestore Timestamp
  if (typeof dateValue === "object" && dateValue?.seconds) {
    date = new Date(dateValue.seconds * 1000);
  }
  // Handle ISO string / normal date
  else if (typeof dateValue === "string" || typeof dateValue === "number") {
    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) {
      date = parsed;
    }
  }

  if (!date) return null;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) return null;

  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  const time = date.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffMin < 1) return "teraz";
  if (diffMin < 60) return `${diffMin} min temu (${time})`;
  if (diffH < 24) return `${diffH} godz. temu (${time})`;
  if (diffD === 1) return `wczoraj (${time})`;

  return date.toLocaleDateString("pl-PL") + ` (${time})`;
}

function StatusBadge({ status }: { status: string }) {
  const label = getStatusLabel(status);

  const cls =
    status === "done"
      ? "bg-green-50 text-green-800 border-green-200"
      : status === "in_progress"
      ? "bg-yellow-50 text-yellow-900 border-yellow-200"
      : status === "scheduled"
      ? "bg-blue-50 text-blue-800 border-blue-200"
      : status === "new"
      ? "bg-gray-50 text-gray-800 border-gray-200"
      : status === "cancelled"
      ? "bg-red-50 text-red-800 border-red-200"
      : "bg-gray-50 text-gray-800 border-gray-200";

  const dot =
    status === "done"
      ? "bg-green-600"
      : status === "in_progress"
      ? "bg-yellow-500"
      : status === "scheduled"
      ? "bg-blue-600"
      : status === "new"
      ? "bg-gray-500"
      : status === "cancelled"
      ? "bg-red-600"
      : "bg-gray-500";

  return (
    <span
      className={[
        "inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold whitespace-nowrap",
        cls,
      ].join(" ")}
      title={label}
    >
      <span className={["w-2 h-2 rounded-full", dot].join(" ")} />
      {label}
    </span>
  );
}

export default function JobsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const companyId = useActiveCompanyId();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState<string>("");

  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [role, setRole] = useState<Role>("staff");
  const [roleLoading, setRoleLoading] = useState(true);

  // 🔥 NOWE — billing
  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string | null>(null);

  const isOwnerOrAdmin = useMemo(() => role === "owner" || role === "admin", [role]);

  const stats = {
    all: allJobs.length,
    new: allJobs.filter((j) => j.status === "new").length,
    scheduled: allJobs.filter((j) => j.status === "scheduled").length,
    in_progress: allJobs.filter((j) => j.status === "in_progress").length,
    done: allJobs.filter((j) => j.status === "done").length,
    cancelled: allJobs.filter((j) => j.status === "cancelled").length,
  };


  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // 🔥 NOWE — blokada subskrypcji
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

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      setRole("staff");
      setRoleLoading(true);

      if (!companyId || !user) {
        setRoleLoading(false);
        return;
      }

      try {
        const data: MeResponse = await apiFetch(`/api/companies/${companyId}/me`);
        if (cancelled) return;
        setRole((data?.role as Role) || "staff");
      } catch {
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    }

    loadRole();
    return () => {
      cancelled = true;
    };
  }, [companyId, user?.uid]);

  async function load(firstPage = true) {
    if (!companyId) return;
    setBusy(true);
    setErr(null);

    try {
      const qs = new URLSearchParams();
      qs.set("limit", "50");
      if (status) qs.set("status", status);
      if (!firstPage && cursor) qs.set("cursor", cursor);

      const data = await apiFetch(`/api/companies/${companyId}/jobs?` + qs.toString());
      const nextJobs = Array.isArray(data?.jobs) ? data.jobs : [];

      if (!status) {
        setAllJobs(firstPage ? nextJobs : [...allJobs, ...nextJobs]);
      }
      setJobs(firstPage ? nextJobs : [...jobs, ...nextJobs]);
      setNextCursor(data.nextCursor || null);
      setCursor(data.nextCursor || null);
    } catch (e: any) {
      setErr(e?.message ?? "LOAD_ERROR");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (user && companyId) load(true);
  }, [user, companyId, status]);

  if (loading) return <div className="p-6">Ładowanie...</div>;
  if (!user) return null;

  if (!companyId) {
    return (
      <div className="p-6">
        Najpierw wybierz aktywną firmę w{" "}
        <Link className="underline" href="/dashboard">
          Panelu głównym
        </Link>.
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-8">

        <div className="flex items-center justify-between gap-6">
          <div className="shrink-0">
            <h1 className="text-3xl font-semibold text-gray-900">
              Zlecenia
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Zarządzaj zleceniami firmy
            </p>
          </div>

          <div className="flex-1 flex justify-center">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {[
                { key: "all", label: "Wszystkie", count: stats.all, color: "text-gray-700 border-gray-300 bg-gray-50 hover:bg-gray-100" },
                { key: "new", label: "Nowe", count: stats.new, color: "text-gray-700 border-gray-300 bg-gray-50 hover:bg-gray-100" },
                { key: "scheduled", label: "Zaplanowane", count: stats.scheduled, color: "text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100" },
                { key: "in_progress", label: "W trakcie", count: stats.in_progress, color: "text-yellow-800 border-yellow-300 bg-yellow-50 hover:bg-yellow-100" },
                { key: "done", label: "Zakończone", count: stats.done, color: "text-green-700 border-green-300 bg-green-50 hover:bg-green-100" },
                { key: "cancelled", label: "Anulowane", count: stats.cancelled, color: "text-red-700 border-red-300 bg-red-50 hover:bg-red-100" },
              ].map((item) => {
                const isActive = (item.key === "all" && status === "") || status === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setStatus(item.key === "all" ? "" : item.key)}
                    className={[
                      "px-4 py-2 rounded-xl border text-sm flex items-center gap-2 transition",
                      isActive ? "bg-black text-white border-black" : item.color,
                    ].join(" ")}
                  >
                    <span>{item.label}</span>
                    <span className="font-semibold">{item.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 min-w-[144px] flex justify-end">
            {!roleLoading && isOwnerOrAdmin && (
              <Link
                href="/jobs/new"
                className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 transition"
              >
                Dodaj zlecenie
              </Link>
            )}
          </div>
        </div>

        {err && (
          <div className="text-sm text-red-700 border border-red-200 bg-red-50 p-4 rounded-xl">
            {err}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <label className="text-sm text-gray-600">
            Status:
          </label>

          <select
            className="border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Wszystkie</option>
            <option value="new">Nowe</option>
            <option value="scheduled">Zaplanowane</option>
            <option value="in_progress">W trakcie</option>
            <option value="done">Zakończone</option>
            <option value="cancelled">Anulowane</option>
          </select>

          <button
            className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
            disabled={busy}
            onClick={() => load(true)}
          >
            Odśwież
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-sm text-gray-500">
            Brak zleceń
          </div>
        ) : (
          <div className="space-y-4">

            {jobs.map((j) => (
              <Link
                key={j.id}
                href={`/jobs/${j.id}`}
                className="block bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition"
              >
                <div className="flex justify-between gap-6">

                  <div className="min-w-0 space-y-1">
                    <div className="font-semibold text-gray-900 truncate">
                      {j.customerName} • {j.customerPhone}
                    </div>

                    <div className="text-sm text-gray-500">
                      {j.addressCity}, {j.addressStreet}
                    </div>

                    <div className="text-sm text-gray-600 mt-1">
                      {j.description}
                    </div>
                  </div>

                  <div className="text-right space-y-2 shrink-0">
                    <StatusBadge status={j.status} />

                    <div className="text-xs text-gray-500">
                      Priorytet: <b>{j.priority}</b>
                    </div>

                    <div className="text-xs text-gray-500">
                      Przypisani: <b>{assignedCount(j)}</b>
                    </div>

                    <div className="text-[11px] text-gray-400">
                      🕒 {formatTimeAgo(j.statusUpdatedAt || j.updatedAt) || "brak daty"}
                    </div>
                  </div>

                </div>
              </Link>
            ))}

          </div>
        )}

        {nextCursor && (
          <div className="flex justify-center">
            <button
              className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
              disabled={busy}
              onClick={() => load(false)}
            >
              {busy ? "Ładowanie..." : "Załaduj więcej"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
