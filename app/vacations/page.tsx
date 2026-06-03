"use client";

import { useAuth } from "@/components/AuthProvider";
import { AdminVacationDashboard } from "@/components/vacations/AdminVacationDashboard";
import { EmployeeVacationDashboard } from "@/components/vacations/EmployeeVacationDashboard";
import { apiFetch } from "@/lib/api";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "owner" | "admin" | "staff";

export default function VacationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const companyId = useActiveCompanyId();

  const [role, setRole] = useState<Role | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [companyStorageReady, setCompanyStorageReady] = useState(false);

  useEffect(() => {
    setCompanyStorageReady(true);
  }, []);

  const isOwnerOrAdmin = role === "owner" || role === "admin";

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !companyId) {
      setRole(null);
      setRoleLoaded(false);
      return;
    }

    setRole(null);
    setRoleLoaded(false);
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch(`/api/companies/${companyId}/me`);
        if (!cancelled) setRole((me?.role as Role) || "staff");
      } catch {
        if (!cancelled) setRole("staff");
      } finally {
        if (!cancelled) setRoleLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, companyId]);

  const waitingForRole = !!user && !!companyId && (!roleLoaded || role === null);

  if (loading || !companyStorageReady || waitingForRole) {
    return <div className="p-6">Ładowanie...</div>;
  }
  if (!user) return null;

  if (!companyId) {
    return (
      <div className="p-6">
        Najpierw wybierz aktywną firmę w{" "}
        <Link className="underline" href="/dashboard">
          Dashboard
        </Link>
        .
      </div>
    );
  }

  if (isOwnerOrAdmin) {
    return <AdminVacationDashboard companyId={companyId} />;
  }

  return <EmployeeVacationDashboard companyId={companyId} />;
}
