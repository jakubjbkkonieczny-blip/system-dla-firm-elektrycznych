"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Role = "owner" | "admin" | "staff";

type CompanyMeResponse = {
  role?: Role;
  active?: boolean;
};

function SidebarItem({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm border",
        active
          ? "bg-gray-900 text-white border-gray-900"
          : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50",
      ].join(" ")}
    >
      <span className="w-5 text-center">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export function AppShell({
  children,
  initialDisplayName,
}: {
  children: React.ReactNode;
  initialDisplayName?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const companyId = useActiveCompanyId();

  const [role, setRole] = useState<Role>("staff");
  const [displayName, setDisplayName] = useState<string>(initialDisplayName ?? "");

  const [roleLoaded, setRoleLoaded] = useState(false);

  const hideShell =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/start") ||
    pathname.startsWith("/platnosc") ||
    pathname.startsWith("/oczekiwanie") ||
    pathname.startsWith("/subskrypcja");

  const isAuthed = !!user && !loading;

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      if (!isAuthed || hideShell) return;

      if (!companyId) {
        setRoleLoaded(false);
        return;
      }

      try {
        const data: CompanyMeResponse = await apiFetch(
          `/api/companies/${companyId}/me`
        );

        if (cancelled) return;

        setRole((data?.role as Role) || "staff");
        setRoleLoaded(true);
      } catch {
        setRole("staff");
        setRoleLoaded(true);
      }
    }

    loadRole();

    return () => {
      cancelled = true;
    };
  }, [isAuthed, companyId, hideShell]);

  useEffect(() => {
    if (!isAuthed || hideShell) {
      setDisplayName("");
      return;
    }
    setDisplayName(initialDisplayName ?? "");
  }, [isAuthed, hideShell, initialDisplayName, user?.uid, pathname]);

  const isOwnerOrAdmin = role === "owner" || role === "admin";

  const roleLabel = useMemo(() => {
    if (role === "owner") return "Właściciel";
    if (role === "admin") return "Administrator";
    return "Pracownik";
  }, [role]);

  async function onLogout() {
    await logout();
    router.replace("/");
  }

  if (hideShell) return <>{children}</>;
  if (loading) return null;
  if (!user) return <>{children}</>;
  if (!roleLoaded && companyId) return null;

  const topLabel = displayName.trim() || user.email || "Użytkownik";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-white border-r px-4 py-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center">
            ⚡
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-lg">Elektra</div>
            <div className="text-xs text-gray-500">Panel</div>
          </div>
        </div>

        <div className="border rounded-xl p-3 bg-gray-50">
          <div className="text-sm font-medium text-gray-900 truncate">{topLabel}</div>
          <div className="text-xs text-gray-600">{roleLabel}</div>
        </div>

        <nav className="flex flex-col gap-2">
          <SidebarItem href="/dashboard" label="Panel główny" icon="🏠" />
          <SidebarItem href="/jobs" label="Zlecenia" icon="🧾" />
          <SidebarItem href="/todo" label="Do zrobienia" icon="✅" />

          {isOwnerOrAdmin && (
            <SidebarItem href="/members" label="Pracownicy" icon="👥" />
          )}

          {/* 🔥 TUTAJ ZMIANA */}
          {isOwnerOrAdmin && (
            <SidebarItem href="/calendar" label="Kalendarz" icon="📅" />
          )}

          {isOwnerOrAdmin && (
          <SidebarItem href="/gallery" label="Galeria zdjęć" icon="🖼️" />
          )}

          <SidebarItem href="/notifications" label="Powiadomienia" icon="🔔" />
          <SidebarItem href="/settings" label="Ustawienia" icon="⚙️" />
        </nav>

        <div className="mt-auto space-y-3">
         
          <button
            type="button"
            onClick={onLogout}
            className="w-full px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm"
          >
            Wyloguj
          </button>
        </div>
      </aside>

      <main className="flex-1">
        <div className="h-14 bg-white border-b flex items-center justify-end px-4 gap-2">
          <Link href="/notifications" className="w-9 h-9 rounded-xl border flex items-center justify-center">
            🔔
          </Link>
          <Link href="/settings" className="w-9 h-9 rounded-xl border flex items-center justify-center">
            ⚙️
          </Link>
        </div>

        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}