
"use client";

import { useEffect, useState } from "react";
import { APP_BRANDING } from "@/lib/branding";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const PWA_INSTALLED_STORAGE_KEY = "elektra-pwa-installed";
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

export default function InstallApp({ className = "" }: { className?: string }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(deferredInstallPrompt);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone || iosStandalone);
    setIsInstalled(window.localStorage.getItem(PWA_INSTALLED_STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setPromptEvent(deferredInstallPrompt);
    };

    const handleAppInstalled = () => {
      deferredInstallPrompt = null;
      setPromptEvent(null);
      setIsInstalled(true);
      setIsStandalone(true);
      window.localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, "1");
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (isStandalone || isInstalled || !promptEvent) return null;

  return (
    <div
      className={`w-full min-h-[7.75rem] rounded-2xl border border-white/20 bg-slate-950/55 px-5 py-5 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.1)] ${className}`.trim()}
    >
      <div className="flex items-start gap-4">
        <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M17 1H7a2 2 0 00-2 2v18a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2zm0 18H7V5h10v14z" />
          </svg>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <div className="font-semibold leading-tight text-slate-100">
              Zainstaluj aplikację {APP_BRANDING.name}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
              Dodaj do ekranu głównego i korzystaj jak z aplikacji.
            </p>
          </div>
          <button
            onClick={async () => {
              promptEvent.prompt();
              const { outcome } = await promptEvent.userChoice;

              // Keep CTA available after cancel/dismiss so route changes do not hide it.
              if (outcome === "accepted") {
                deferredInstallPrompt = null;
                setPromptEvent(null);
                setIsInstalled(true);
                window.localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, "1");
              }
            }}
            className="min-h-11 w-full rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:from-amber-300 hover:to-amber-400 sm:w-auto"
          >
            Zainstaluj
          </button>
        </div>
      </div>
    </div>
  );
}