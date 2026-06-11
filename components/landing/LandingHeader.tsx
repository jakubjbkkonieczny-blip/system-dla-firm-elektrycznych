"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppLogoMark } from "@/components/auth/AppLogo";
import { APP_BRANDING } from "@/lib/branding";

const NAV = [
  { href: "#funkcje", label: "Funkcje" },
  { href: "#korzysci", label: "Korzyści" },
  { href: "#dla-kogo", label: "Dla kogo" },
  { href: "#jak-to-dziala", label: "Jak to działa" },
  { href: "#kontakt", label: "Kontakt" },
] as const;

export function LandingHeader({ anchorPrefix = "" }: { anchorPrefix?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header
      className={[
        "fixed top-0 left-0 right-0 z-50 transition-colors duration-200",
        scrolled
          ? "bg-slate-950/85 backdrop-blur-md border-b border-white/10"
          : "bg-transparent",
      ].join(" ")}
    >
      <div className="max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 lg:h-[4.25rem] items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <AppLogoMark size="sm" className="rounded-lg" />
            <span className="text-lg font-semibold text-white tracking-tight">{APP_BRANDING.name}</span>
          </Link>

          <nav
            className="hidden lg:flex items-center gap-8 text-sm text-slate-300"
            aria-label="Główne"
          >
            {NAV.map((item) => (
              <a
                key={item.href}
                href={`${anchorPrefix}${item.href}`}
                className="hover:text-white transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-slate-200 border border-white/20 rounded-lg hover:bg-white/10 transition-colors"
            >
              Zaloguj się
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 rounded-lg hover:from-amber-300 hover:to-amber-400 transition-colors shadow-lg shadow-amber-500/20"
            >
              Rozpocznij
            </Link>
          </div>

          <button
            type="button"
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-white/20 text-white hover:bg-white/10"
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
            aria-label={menuOpen ? "Zamknij menu" : "Otwórz menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          id="landing-mobile-menu"
          className="lg:hidden border-t border-white/10 bg-slate-950/95 backdrop-blur-lg"
        >
          <nav className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1" aria-label="Mobilne">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={`${anchorPrefix}${item.href}`}
                className="px-3 py-3 rounded-lg text-slate-200 hover:bg-white/10 hover:text-white"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="pt-3 mt-2 border-t border-white/10 flex flex-col gap-2">
              <Link
                href="/login"
                className="w-full text-center px-4 py-3 text-sm font-medium text-slate-200 border border-white/20 rounded-lg"
                onClick={() => setMenuOpen(false)}
              >
                Zaloguj się
              </Link>
              <Link
                href="/login"
                className="w-full text-center px-4 py-3 text-sm font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 rounded-lg"
                onClick={() => setMenuOpen(false)}
              >
                Rozpocznij
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
