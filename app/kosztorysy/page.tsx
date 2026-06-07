"use client";

import { useAuth } from "@/components/AuthProvider";
import { ProjectBudgetDashboard } from "@/components/budget/ProjectBudgetDashboard";
import { ProjectListSidebar } from "@/components/budget/ProjectListSidebar";
import { apiFetch } from "@/lib/api";
import type { CompanyMemberOption } from "@/lib/company/member-options";
import type { BudgetJobListItem, BudgetJobsListResponse, PaginatedMeta } from "@/lib/jobs/budget/types";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Role = "owner" | "admin" | "staff";

export default function KosztorysyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = useActiveCompanyId();

  const [role, setRole] = useState<Role>("staff");
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [jobs, setJobs] = useState<BudgetJobListItem[]>([]);
  const [jobsMeta, setJobsMeta] = useState<PaginatedMeta | null>(null);
  const [members, setMembers] = useState<CompanyMemberOption[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedJobId = searchParams.get("job") || "";
  const isOwnerOrAdmin = role === "owner" || role === "admin";

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !companyId) return;
    let cancelled = false;

    (async () => {
      try {
        const me = await apiFetch(`/api/companies/${companyId}/me`);
        if (cancelled) return;
        setRole((me?.role as Role) || "staff");
        setRoleLoaded(true);
      } catch {
        if (!cancelled) {
          setRole("staff");
          setRoleLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, companyId]);

  const loadJobs = useCallback(
    async (q: string, status: string, p: number) => {
      if (!companyId) return;
      setBusy(true);
      setErr(null);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (status) params.set("status", status);
        params.set("page", String(p));
        params.set("limit", "50");
        const qs = params.toString() ? `?${params.toString()}` : "";
        const data = (await apiFetch(
          `/api/companies/${companyId}/budgets/jobs${qs}`
        )) as BudgetJobsListResponse;
        setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
        setJobsMeta(data?.meta ?? null);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "LOAD_ERROR");
        setJobs([]);
        setJobsMeta(null);
      } finally {
        setBusy(false);
      }
    },
    [companyId]
  );

  useEffect(() => {
    if (!user || !companyId || !roleLoaded || !isOwnerOrAdmin) return;
    loadJobs(search, statusFilter, page);
  }, [user, companyId, roleLoaded, isOwnerOrAdmin, loadJobs, search, statusFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (!user || !companyId || !isOwnerOrAdmin) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch(`/api/companies/${companyId}/members/simple`);
        if (cancelled) return;
        setMembers(Array.isArray(data?.members) ? data.members : []);
      } catch {
        if (!cancelled) setMembers([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, companyId, isOwnerOrAdmin]);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) ?? null,
    [jobs, selectedJobId]
  );

  function selectJob(jobId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("job", jobId);
    router.replace(`/kosztorysy?${params.toString()}`);
  }

  if (loading || !roleLoaded) {
    return <div className="text-sm text-gray-600">Ładowanie...</div>;
  }

  if (!user) return null;

  if (!isOwnerOrAdmin) {
    return (
      <div className="max-w-lg border rounded-xl p-6 bg-white text-sm text-gray-700">
        Brak dostępu. Moduł Kosztorysy jest dostępny tylko dla właściciela lub administratora firmy.
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="max-w-lg border rounded-xl p-6 bg-white text-sm text-gray-700">
        Wybierz firmę w panelu głównym, aby korzystać z kosztorysów.
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden flex flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-gray-900">Kosztorysy</h1>
        <p className="text-sm text-gray-500 mt-1">
          Profesjonalny dashboard budżetowy dla właścicieli, administratorów i księgowości.
        </p>
      </div>

      {err ? (
        <div className="text-sm text-red-700 border border-red-200 bg-red-50 p-3 rounded-lg shrink-0">{err}</div>
      ) : null}

      <div className="flex flex-col lg:flex-row gap-4">
        <ProjectListSidebar
          jobs={jobs}
          meta={jobsMeta}
          selectedJobId={selectedJobId}
          search={search}
          statusFilter={statusFilter}
          busy={busy}
          onSearchChange={setSearch}
          onStatusChange={setStatusFilter}
          onSelectJob={selectJob}
          onPageChange={setPage}
        />

        <main className="flex-1 min-w-0 border rounded-xl bg-gray-50 p-4 lg:p-5">
          {selectedJob ? (
            <ProjectBudgetDashboard
              companyId={companyId}
              jobId={selectedJob.id}
              jobNumber={selectedJob.jobNumber}
              jobLabel={`#${selectedJob.jobNumber} · ${selectedJob.customerName}`}
              members={members}
            />
          ) : (
            <div className="flex items-center justify-center min-h-[240px] text-sm text-gray-500 text-center px-4">
              Wybierz projekt z listy po lewej, aby zobaczyć dashboard kosztorysu.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
