"use client";

import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import { JobPriorityBadge } from "@/lib/jobs/job-priority";
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

const STATUS_CHIP_ITEMS = [
  { key: "all", label: "Wszystkie" },
  { key: "new", label: "Nowe" },
  { key: "scheduled", label: "Zaplanowane" },
  { key: "in_progress", label: "W trakcie" },
  { key: "done", label: "Zakończone" },
  { key: "cancelled", label: "Anulowane" },
] as const;

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

  if (typeof dateValue === "object" && dateValue?.seconds) {
    date = new Date(dateValue.seconds * 1000);
  } else if (typeof dateValue === "string" || typeof dateValue === "number") {
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
      ? "bg-success-bg text-success border-success-border"
      : status === "in_progress"
        ? "bg-warning-bg text-warning border-warning-border"
        : status === "scheduled"
          ? "bg-card text-accent border-border"
          : status === "cancelled"
            ? "bg-danger-bg text-danger border-danger-border"
            : "bg-bg-secondary text-text-muted border-border";

  const dot =
    status === "done"
      ? "bg-success"
      : status === "in_progress"
        ? "bg-warning"
        : status === "scheduled"
          ? "bg-accent"
          : status === "cancelled"
            ? "bg-danger"
            : "bg-text-muted";

  return (
    <span
      className={[
        "inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold",
        cls,
      ].join(" ")}
      title={label}
    >
      <span className={["w-2 h-2 rounded-full shrink-0", dot].join(" ")} />
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

  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const me = await apiFetch("/api/me");

        if (me?.role === "employer" && !me?.billingAllowsAccess) {
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

  if (loading) return <div className="text-text-muted">Ładowanie...</div>;
  if (!user) return null;

  if (!companyId) {
    return (
      <div className="text-text">
        Najpierw wybierz aktywną firmę w{" "}
        <Link className="underline text-accent" href="/dashboard">
          Panelu głównym
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0">
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
        {/* Mobile-first header */}
        <div className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-text">Zlecenia</h1>
              <p className="text-sm text-text-muted mt-1">Zarządzaj zleceniami firmy</p>
            </div>

            {!roleLoading && isOwnerOrAdmin && (
              <Link
                href="/jobs/new"
                className="w-full lg:w-auto shrink-0 inline-flex items-center justify-center min-h-[48px] px-5 py-2.5 rounded-xl bg-primary text-primary-fg font-medium hover:opacity-90 transition"
              >
                Dodaj zlecenie
              </Link>
            )}
          </div>

          {/* Status chips — 2 columns on mobile */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap gap-2">
            {STATUS_CHIP_ITEMS.map((item) => {
              const isActive =
                (item.key === "all" && status === "") || status === item.key;
              const count = stats[item.key as keyof typeof stats];

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStatus(item.key === "all" ? "" : item.key)}
                  className={[
                    "status-chip flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-sm transition",
                    isActive ? "status-chip-active" : "status-chip-idle",
                  ].join(" ")}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="font-semibold tabular-nums shrink-0">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {err && (
          <div className="text-sm text-danger border border-danger-border bg-danger-bg p-4 rounded-xl">
            {err}
          </div>
        )}

        {/* Filter card */}
        <div className="theme-glass bg-card rounded-2xl border border-border p-4 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <label className="text-sm text-text-muted block sm:inline">Status:</label>

          <select
            className="w-full sm:w-auto min-h-[44px] border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
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
            type="button"
            className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-lg border border-border bg-card text-text hover:bg-card-hover transition disabled:opacity-50"
            disabled={busy}
            onClick={() => load(true)}
          >
            Odśwież
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="theme-glass bg-card rounded-2xl border border-border p-6 text-sm text-text-muted">
            Brak zleceń
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((j) => (
              <Link
                key={j.id}
                href={`/jobs/${j.id}`}
                className="block theme-glass bg-card rounded-2xl border border-border p-4 sm:p-5 hover:bg-card-hover transition min-w-0"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:gap-6">
                  <div className="min-w-0 space-y-1">
                    <div className="font-semibold text-text truncate">
                      {j.customerName} • {j.customerPhone}
                    </div>

                    <div className="text-sm text-text-muted">
                      {j.addressCity}, {j.addressStreet}
                    </div>

                    {j.description ? (
                      <div className="text-sm text-text-muted mt-1 line-clamp-2">
                        {j.description}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-2 shrink-0">
                    <StatusBadge status={j.status} />
                    <JobPriorityBadge priority={j.priority} />
                    <div className="text-xs text-text-muted w-full sm:text-right">
                      Przypisani: <b className="text-text">{assignedCount(j)}</b>
                    </div>
                    <div className="text-[11px] text-text-muted w-full sm:text-right">
                      🕒 {formatTimeAgo(j.statusUpdatedAt || j.updatedAt) || "brak daty"}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {nextCursor && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              className="min-h-[44px] px-5 py-2 rounded-lg border border-border bg-card text-text hover:bg-card-hover transition disabled:opacity-50"
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
