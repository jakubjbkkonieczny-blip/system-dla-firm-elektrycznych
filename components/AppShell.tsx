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
  onNavigate,
}: {
  href: string;
  label: string;
  icon: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={[
        "flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg text-sm border",
        active
          ? "bg-gray-900 text-white border-gray-900"
          : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50",
      ].join(" ")}
    >
      <span className="w-5 text-center shrink-0">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

type SidebarContentProps = {
  topLabel: string;
  roleLabel: string;
  isOwnerOrAdmin: boolean;
  companyId: string | null;
  onLogout: () => void;
  onNavigate?: () => void;
};

function SidebarContent({
  topLabel,
  roleLabel,
  isOwnerOrAdmin,
  companyId,
  onLogout,
  onNavigate,
}: SidebarContentProps) {
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center shrink-0">
          ⚡
        </div>
        <div className="leading-tight min-w-0">
          <div className="font-semibold text-lg">Elektra</div>
          <div className="text-xs text-gray-500">Panel</div>
        </div>
      </div>

      <div className="border rounded-xl p-3 bg-gray-50">
        <div className="text-sm font-medium text-gray-900 truncate">{topLabel}</div>
        <div className="text-xs text-gray-600">{roleLabel}</div>
      </div>

      <nav className="flex flex-col gap-2">
        <SidebarItem href="/dashboard" label="Panel główny" icon="🏠" onNavigate={onNavigate} />
        <SidebarItem href="/jobs" label="Zlecenia" icon="🧾" onNavigate={onNavigate} />

        {isOwnerOrAdmin && (
          <SidebarItem href="/members" label="Pracownicy" icon="👥" onNavigate={onNavigate} />
        )}

        {companyId && (
          <SidebarItem href="/attendance" label="Obecność" icon="🕐" onNavigate={onNavigate} />
        )}

        {companyId && (
          <SidebarItem href="/vacations" label="Urlopy" icon="🏖️" onNavigate={onNavigate} />
        )}

        {isOwnerOrAdmin && (
          <SidebarItem href="/calendar" label="Kalendarz" icon="📅" onNavigate={onNavigate} />
        )}

        {isOwnerOrAdmin && (
          <SidebarItem href="/gallery" label="Galeria zdjęć" icon="🖼️" onNavigate={onNavigate} />
        )}

        <SidebarItem href="/notifications" label="Powiadomienia" icon="🔔" onNavigate={onNavigate} />
        <SidebarItem href="/settings" label="Ustawienia" icon="⚙️" onNavigate={onNavigate} />
      </nav>

      <div className="mt-auto space-y-3">
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            onLogout();
          }}
          className="w-full min-h-[44px] px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm"
        >
          Wyloguj
        </button>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const companyId = useActiveCompanyId();

  const [role, setRole] = useState<Role>("staff");
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
        setRole("staff");
        setRoleLoaded(false);
        return;
      }

      setRole("staff");
      setRoleLoaded(false);

      try {
        const data: CompanyMeResponse = await apiFetch(
          `/api/companies/${companyId}/me`
        );

        if (cancelled) return;

        setRole((data?.role as Role) || "staff");
        setRoleLoaded(true);
      } catch {
        if (cancelled) return;
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
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileNavOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

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

  const closeMobileNav = () => setMobileNavOpen(false);

  if (hideShell) return <>{children}</>;
  if (loading) return null;
  if (!user) return <>{children}</>;
  if (!roleLoaded && companyId) return null;

  const topLabel =
    (user.displayName ?? "").trim() || user.email || "Użytkownik";

  const sidebarProps: SidebarContentProps = {
    topLabel,
    roleLabel,
    isOwnerOrAdmin,
    companyId,
    onLogout,
  };

  return (
    <div className="h-[100dvh] w-full max-w-[100vw] overflow-x-hidden bg-gray-50 flex flex-col lg:flex-row">
      {/* Mobile header */}
      <header
        className="lg:hidden shrink-0 flex items-center gap-2 px-3 py-2 border-b bg-white z-30 pt-[max(0.5rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
      >
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center shrink-0"
          aria-label="Otwórz menu"
          aria-expanded={mobileNavOpen}
          aria-controls="app-mobile-nav"
        >
          <span className="text-lg leading-none" aria-hidden="true">
            ☰
          </span>
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0 text-sm">
            ⚡
          </div>
          <div className="min-w-0 leading-tight">
            <div className="font-semibold text-gray-900 truncate">Elektra</div>
            <div className="text-xs text-gray-500 truncate">Panel</div>
          </div>
        </div>

        <Link
          href="/notifications"
          className="min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center shrink-0"
          aria-label="Powiadomienia"
        >
          🔔
        </Link>
        <Link
          href="/settings"
          className="min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center shrink-0"
          aria-label="Ustawienia"
        >
          ⚙️
        </Link>
      </header>

      {/* Mobile nav backdrop */}
      {mobileNavOpen ? (
        <button
          type="button"
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          aria-label="Zamknij menu"
          onClick={closeMobileNav}
        />
      ) : null}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r px-4 py-4 flex-col gap-4 overflow-y-auto shrink-0">
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Mobile drawer */}
      <aside
        id="app-mobile-nav"
        className={[
          "lg:hidden fixed inset-y-0 left-0 z-50 w-[min(100vw,18rem)] max-w-[85vw] bg-white border-r px-4 py-4 flex flex-col gap-4 overflow-y-auto shadow-xl transition-transform duration-200 ease-out pb-[env(safe-area-inset-bottom)]",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full pointer-events-none",
        ].join(" ")}
        aria-hidden={!mobileNavOpen}
      >
        <SidebarContent {...sidebarProps} onNavigate={closeMobileNav} />
      </aside>

      <main className="flex-1 min-w-0 w-full flex flex-col overflow-hidden">
        <div className="hidden lg:flex h-14 bg-white border-b items-center justify-end px-4 gap-2 shrink-0">
          <Link
            href="/notifications"
            className="w-9 h-9 rounded-xl border flex items-center justify-center"
            aria-label="Powiadomienia"
          >
            🔔
          </Link>
          <Link
            href="/settings"
            className="w-9 h-9 rounded-xl border flex items-center justify-center"
            aria-label="Ustawienia"
          >
            ⚙️
          </Link>
        </div>

        <div className="flex-1 min-h-0 min-w-0 w-full max-w-full overflow-y-auto overflow-x-hidden p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </main>
    </div>
  );
}
