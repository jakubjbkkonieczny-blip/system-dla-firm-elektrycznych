
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
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone || iosStandalone);
    // LocalStorage migration: copy legacy key to new key if present.
    // NOTE: do NOT treat storage flag as source of truth for installation.
    const NEW_KEY = "vectorwork-pwa-installed";
    const legacy = window.localStorage.getItem(PWA_INSTALLED_STORAGE_KEY);
    const migrated = window.localStorage.getItem(NEW_KEY);
    if (migrated !== "1" && legacy === "1") {
      try {
        window.localStorage.setItem(NEW_KEY, "1");
        window.localStorage.removeItem(PWA_INSTALLED_STORAGE_KEY);
      } catch (e) {
        // ignore storage errors
      }
    }

    // Start with session-only installed=false. Only live signals (display-mode/navigator.standalone)
    // or runtime events (appinstalled / accepted prompt) will set isInstalled to true for the session.
    setIsInstalled(false);
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
      // Mark installed for current session only; persist a helper flag for analytics only.
      setIsInstalled(true);
      setIsStandalone(true);
      try {
        window.localStorage.setItem("vectorwork-pwa-installed", "1");
      } catch (e) {}
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Hide only when we are actually running as a standalone PWA or we know it's installed.
  if (isStandalone || isInstalled) return null;

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
          {promptEvent ? (
            <button
              onClick={async () => {
                try {
                  promptEvent.prompt();
                  const { outcome } = await promptEvent.userChoice;

                  if (outcome === "accepted") {
                    deferredInstallPrompt = null;
                    setPromptEvent(null);
                    setIsInstalled(true);
                    try {
                      window.localStorage.setItem("vectorwork-pwa-installed", "1");
                    } catch (e) {}
                  }
                } catch (e) {
                  // prompt might throw in some browsers; fallback to showing instructions
                  setShowInstructions(true);
                }
              }}
              className="min-h-11 w-full rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:from-amber-300 hover:to-amber-400 sm:w-auto"
            >
              Zainstaluj
            </button>
          ) : (
            <button
              onClick={() => setShowInstructions(true)}
              className="min-h-11 w-full rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:from-amber-300 hover:to-amber-400 sm:w-auto"
            >
              Pobierz na urządzenie
            </button>
          )}

          {showInstructions ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-200">
              <Instructions />
              <div className="mt-3 text-right">
                <button
                  onClick={() => setShowInstructions(false)}
                  className="text-sm font-medium text-amber-300 underline"
                >
                  Zamknij
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Instructions() {
  // Client-only detection
  if (typeof window === "undefined") return null;

  const ua = window.navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && 'ontouchend' in document);
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
  const isMac = /Macintosh/.test(ua) && !isIOS;

  if (isIOS) {
    return (
      <div>
        <div className="font-semibold">Instalacja na iPhone / iPad (Safari)</div>
        <ol className="list-decimal ml-5 mt-2 text-sm">
          <li>Otwórz tę stronę w Safari.</li>
          <li>Stuknij ikonę "Udostępnij" (kwadrat ze strzałką).</li>
          <li>Wybierz „Dodaj do ekranu początkowego”.</li>
          <li>Potwierdź <strong>Dodaj</strong>.</li>
        </ol>
      </div>
    );
  }

  if (isMac && isSafari) {
    return (
      <div>
        <div className="font-semibold">Instalacja na macOS (Safari)</div>
        <p className="mt-2">W Safari wybierz <strong>Plik → Dodaj do Docka</strong> lub użyj <strong>Udostępnij → Dodaj do Docka</strong>.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="font-semibold">Instalacja aplikacji</div>
      <p className="mt-2">Twoja przeglądarka nie obsługuje automatycznego okna instalacji. Aby zainstalować aplikację:</p>
      <ul className="list-disc ml-5 mt-2 text-sm">
        <li>Użyj Chrome/Edge na Android lub desktop, aby zobaczyć natywny przycisk „Zainstaluj”.</li>
        <li>Na iPhone/iPad otwórz Safari i wybierz „Udostępnij → Dodaj do ekranu początkowego”.</li>
      </ul>
    </div>
  );
}