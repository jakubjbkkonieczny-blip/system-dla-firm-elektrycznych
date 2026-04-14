
"use client";

import { useEffect, useState } from "react";

export default function InstallApp() {
  const [promptEvent, setPromptEvent] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setPromptEvent(e);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  if (!promptEvent) return null;

  return (
    <div className="mt-6 flex items-center gap-4 bg-gray-100 border rounded-xl p-4">

      <div className="text-2xl">📱</div>

      <div className="flex-1">
        <div className="font-semibold text-gray-900">
          Zainstaluj aplikację Elektra
        </div>
        <div className="text-sm text-gray-600">
          Dodaj do ekranu głównego i używaj jak aplikacji.
        </div>
      </div>

      <button
        onClick={async () => {
          promptEvent.prompt();
          await promptEvent.userChoice;
          setPromptEvent(null);
        }}
        className="px-4 py-2 bg-black text-white rounded-lg hover:opacity-90"
      >
        Zainstaluj
      </button>
    </div>
  );
}