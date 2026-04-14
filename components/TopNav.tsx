"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Role = "owner" | "admin" | "staff";

type MeResponse = {
  uid: string;
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
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
        active
          ? "bg-black text-white"
          : "text-gray-700 hover:bg-gray-100",
      ].join(" ")}
    >
      <span className="w-5 text-center">{icon}</span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const companyId = useActiveCompanyId();

  const [role, setRole] = useState<Role>("staff");

  const hideShell =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/start") ||
    pathname.startsWith("/platnosc") ||
    pathname.startsWith("/oczekiwanie");

  const isAuthed = !!user && !loading;

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      setRole("staff");
      if (!isAuthed || !companyId || hideShell) return;

      try {
        const data: MeResponse = await apiFetch(`/api/companies/${companyId}/me`);
        if (cancelled) return;
        setRole((data?.role as Role) || "staff");
      } catch {}
    }

    loadRole();
    return () => {
      cancelled = true;
    };
  }, [isAuthed, companyId, hideShell]);

  const isOwnerOrAdmin = role === "owner" || role === "admin";

  const roleLabel = useMemo(() => {
    if (role === "owner") return "Właściciel";
    if (role === "admin") return "Administrator";
    return "Pracownik";
  }, [role]);

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  if (hideShell) return <>{children}</>;
  if (loading) return null;
  if (!user) return <>{children}</>;

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* SIDEBAR */}
      <aside className="w-64 bg-white px-4 py-5 flex flex-col gap-6 border-r border-gray-100">

        {/* LOGO */}
        <div className="flex items-center gap-3 px-1">
          <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center shadow-sm">
            ⚡
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-gray-900">Elektra</div>
            <div className="text-xs text-gray-500">Panel</div>
          </div>
        </div>

        {/* USER */}
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-sm font-medium text-gray-900 truncate">
            {user.email}
          </div>
          <div className="text-xs text-gray-600">{roleLabel}</div>
        </div>

        {/* NAV */}
        <nav className="flex flex-col gap-1">
          <SidebarItem href="/dashboard" label="Panel główny" icon="🏠" />
          <SidebarItem href="/jobs" label="Zlecenia" icon="🧾" />
          <SidebarItem href="/todo" label="Do zrobienia" icon="✅" />
          {isOwnerOrAdmin && (
            <SidebarItem href="/members" label="Pracownicy" icon="👥" />
          )}
          <SidebarItem href="/settings" label="Ustawienia" icon="⚙️" />
        </nav>

        {/* BOTTOM */}
        <div className="mt-auto space-y-2">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition"
          >
            Zmień firmę
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition"
          >
            Wyloguj
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1">
        <div className="h-14 bg-white border-b border-gray-100 flex items-center justify-end px-4 gap-2">

          <button
            className="w-9 h-9 rounded-lg hover:bg-gray-100 transition"
            title="Powiadomienia"
            type="button"
          >
            🔔
          </button>

          <Link
            href="/settings"
            className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center transition"
            title="Ustawienia"
          >
            ⚙️
          </Link>
        </div>

        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}